import logging
import os
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from uuid import uuid4
import urllib3
import io

from scenarios.iot_streaming import iot_streaming_scenario
from services.db import get_db_connection, init_db
from connector import DataFabricConnector
from models import (
    BootstrapResult,
    ConnectionProfile,
    ConnectionTestResult,
    ScenarioRequest,
    ScenarioResult,
    ServiceStatus,
)

# Disable SSL warnings for self-signed certificates (common in Data Fabric deployments)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# --- Logging Setup ---
DEBUG_MODE = os.getenv("DEBUG", "true").lower() == "true"
LOG_LEVEL = logging.DEBUG if DEBUG_MODE else logging.INFO

# Standard logging format: time - name - level - [file:line] - message
LOG_FORMAT = (
    "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s"
)

logging.basicConfig(
    level=LOG_LEVEL,
    format=LOG_FORMAT,
)

# Disable detailed logs for noisy libraries
for noise_logger in [
    "kafka.conn",
    "kafka.metrics",
    "kafka.protocol",
    "kafka.client",
    "kafka.cluster",
    "kafka.admin.client",
    "urllib3",
    "botocore",
    "uvicorn.error",
    "uvicorn.access",
    "pyiceberg.io",
    "asyncio",
    "s3fs",
    "aiobotocore.regions",
    "kafka.consumer.fetcher",
    "kafka.consumer.group",
    "kafka.consumer.subscription_state",
    "kafka.producer.sender",
    "fsspec",
    "kafka.coordinator.consumer",
    "kafka.coordinator",
    "kafka.producer.kafka",
    "kafka.producer.producer_batch",
    "kafka.producer.record_accumulator",
]:

    logging.getLogger(noise_logger).setLevel(logging.WARNING)

logging.getLogger("kafka.conn").setLevel(logging.ERROR)
logging.getLogger("kafka.sasl.plain").setLevel(logging.ERROR)

# Align Uvicorn loggers with our format
for uvicorn_logger_name in ["uvicorn", "uvicorn.error", "uvicorn.access"]:
    uv_logger = logging.getLogger(uvicorn_logger_name)
    uv_logger.handlers = []
    uv_logger.propagate = True


logger = logging.getLogger("api")


# Logger initialized above with imports
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("GET /health") == -1


logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

# -- App setup

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import state

app = FastAPI(title="HPE Data Fabric Demo API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Database Initialization ---
@app.on_event("startup")
async def startup_event():
    init_db()


# --- Single Connection Profile Endpoints ---
@app.get("/health")
def health_check():
    return {"status": "healthy"}


def get_profile_from_db() -> Optional[Dict[str, Any]]:
    """Get the single connection profile from database with in-memory caching."""
    cached = state.get_cached_profile()
    if cached:
        return cached

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM connection_profile WHERE id = 'default'")
        row = cursor.fetchone()
        if row:
            profile = dict(row)
            # Ensure configured is explicitly checked
            if profile.get("cluster_host") and profile.get("configured") == 1:
                state.set_cached_profile(profile)
                return profile

        logger.warning(
            "get_profile_from_db: No profile found in database or missing cluster_host"
        )
        return None
    except Exception as e:
        logger.error(f"Error reading profile from DB: {e}")
        return cached  # Return cached version even if DB fails
    finally:
        conn.close()


def is_bootstrapped() -> bool:
    """Check if the demo has been bootstrapped."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT bootstrapped_at FROM bootstrap_state WHERE id = 'default'"
        )
        row = cursor.fetchone()
        return row is not None and row[0] is not None
    except Exception as e:
        logger.error(f"Error checking bootstrap status: {e}")
        return False
    finally:
        conn.close()


@app.get("/profile", response_model=ConnectionProfile)
def get_profile():
    """Get the single connection profile."""
    profile = get_profile_from_db()
    if not profile:
        # Return default unconfigured profile
        return ConnectionProfile(
            id="default",
            name="Data Fabric Connection",
            cluster_host="",
        )
    return profile


@app.put("/profile", response_model=ConnectionProfile)
def update_profile(profile: ConnectionProfile):
    """Create or update the single connection profile."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        now = datetime.now(timezone.utc).isoformat()
        state.invalidate_profile_cache()

        # Use a direct query
        conn_check = get_db_connection()

        try:
            row = conn_check.execute(
                "SELECT id FROM connection_profile WHERE id = 'default'"
            ).fetchone()
            existing = row is not None
        finally:
            conn_check.close()

        if existing:
            # Update existing profile
            cursor.execute(
                """
                UPDATE connection_profile 
                SET name = ?, cluster_host = ?,
                    username = ?, password = ?,
                    updated_at = ?, configured = 1
                WHERE id = 'default'
            """,
                (
                    profile.name,
                    profile.cluster_host,
                    profile.username,
                    profile.password,
                    now,
                ),
            )
        else:
            # Create new profile
            cursor.execute(
                """
                INSERT INTO connection_profile 
                (id, name, cluster_host, username, password,
                 created_at, updated_at, configured)
                VALUES ('default', ?, ?, ?, ?, ?, ?, 1)
            """,
                (
                    profile.name,
                    profile.cluster_host,
                    profile.username,
                    profile.password,
                    now,
                    now,
                ),
            )
        conn.commit()
        state.invalidate_profile_cache()
        # After saving, assume credentials are valid (frontend tested them)

        # Generate S3 keys for caching
        try:
            # Re-fetch full profile including password for connector
            saved_profile = get_profile_from_db()
            if (
                saved_profile
                and saved_profile.get("username")
                and saved_profile.get("password")
            ):
                logger.info("Generating S3 credentials for new profile...")
                connector = DataFabricConnector(saved_profile)
                s3_creds = connector.generate_s3_credentials()

                # Parse response format: {'status': 'OK', 'data': [{'accesskey': '...', 'secretkey': '...'}]}
                if s3_creds and s3_creds.get("status") == "OK" and s3_creds.get("data"):
                    try:
                        data = s3_creds.get("data")[0]
                        # Normalize keys for consistency
                        stored_creds = {
                            "accessKey": data.get("accesskey"),
                            "secretKey": data.get("secretkey"),
                            "expiryTime": data.get("expiryTime"),
                        }

                        s3_creds_json = json.dumps(stored_creds)
                        cursor.execute(
                            "UPDATE connection_profile SET s3_credentials = ? WHERE id = 'default'",
                            (s3_creds_json,),
                        )
                        conn.commit()
                        logger.info("S3 credentials generated and saved.")
                        profile.s3_credentials = s3_creds_json
                    except (IndexError, AttributeError) as e:
                        logger.warning(f"Failed to parse S3 credentials data: {e}")
                else:
                    logger.warning(
                        f"Failed to generate S3 credentials (Status not OK): {s3_creds}"
                    )

        except Exception as e:
            logger.error(f"Error generating S3 credentials after save: {e}")

        profile.id = "default"
        return profile
    finally:
        conn.close()


@app.delete("/profile")
def delete_profile():
    """Delete the connection profile (reset to unconfigured state)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM connection_profile WHERE id = 'default'")
        conn.commit()
        return {"status": "deleted"}
    finally:
        conn.close()


# --- Connection Testing ---


@app.post("/profile/test", response_model=ConnectionTestResult)
def test_connection(profile_in: Optional[ConnectionProfile] = None):
    """Test connection settings.

    If a profile is provided in the request body, tests those settings.
    Otherwise, tests the currently saved profile in the database.
    """
    try:
        if profile_in:
            # Use provided profile (e.g. from configuration form)
            profile = profile_in.dict()
            # Log received profile for debugging (redact password)
            debug_profile = profile.copy()
            if "password" in debug_profile:
                debug_profile["password"] = "***"
            logger.info(f"Testing connection with provided profile: {debug_profile}")
        else:
            # Use saved profile from database
            profile = get_profile_from_db()
            logger.info("Testing connection with saved profile from DB")

        if not profile:
            logger.error("Connection test failed: No profile data found")
            raise HTTPException(
                status_code=400,
                detail="No configuration found. Please save settings or provide them in the request.",
            )

        if not profile.get("cluster_host"):
            logger.error("Connection test failed: Missing cluster_host")
            raise HTTPException(
                status_code=400,
                detail="Cluster Host is required. Please verify your configuration.",
            )

        connector = DataFabricConnector(profile)
        result = connector.test_connection()

        logger.info(
            f"Connection test result: {result.get('status')} - {result.get('message')}"
        )

        return ConnectionTestResult(
            status=result.get("status", "error"),
            message=result.get("message", ""),
            details=result,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during connection test")
        return ConnectionTestResult(
            status="error",
            message=f"Internal server error: {str(e)}",
            details={"error": str(e)},
        )


# --- Service Discovery ---


@app.get("/profile/services")
def discover_services():
    """Discover and check status of all Data Fabric services.

    Tests all services defined in DATAFABRIC_SERVICES and returns
    detailed status for each including connectivity and authentication.
    """
    profile = get_profile_from_db()
    if not profile or not profile.get("cluster_host"):
        raise HTTPException(status_code=400, detail="Profile not configured")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        connector = DataFabricConnector(profile)

        # Use the new discover_all_services method
        result = connector.discover_all_services()

        # Convert service results to ServiceStatus format for compatibility
        service_statuses = []
        fix_guidance_map = {
            "REST API": "Ensure Data Fabric cluster is running and accessible. Check network connectivity and security settings.",
            "HBase REST": "Enable HBase REST API service on the cluster.",
            "Object Store": "Enable Object Store service and configure S3-compatible endpoint.",
            "Database JSON REST API": "Enable Database JSON REST API service (OJAI).",
            "Hive Server2": "Ensure Hive Server2 is running and accessible.",
            "Hive Metastore": "Ensure Hive Metastore service is running.",
            "Kafka REST API": "Enable the Kafka REST API gateway for the cluster.",
            "Kafka Connect REST API": "Enable Kafka Connect REST API service.",
            "NFS": "Configure NFS gateway service on Data Fabric cluster.",
            "NiFi": "Ensure NiFi service is running and accessible.",
            "OJAI REST API": "Enable OJAI REST API service (Database JSON).",
        }

        for service in result.get("services", []):
            # Determine status based on connectivity and auth
            if service.get("error") and not service.get("tcp_available"):
                status = "missing"
            elif service.get("auth_status") == "success":
                status = "available"
            elif service.get("auth_status") == "unauthorized":
                status = "misconfigured"
            elif service.get("tcp_available") or service.get("https_available"):
                status = "available"
            else:
                status = "missing"

            description = service.get("description", "")

            service_statuses.append(
                ServiceStatus(
                    service_name=description.lower().replace(" ", "_"),
                    status=status,
                    message=service.get("error")
                    or f"Port {service.get('port')} - {service.get('auth_status', 'unknown')}",
                    required=True,
                    fix_guidance=fix_guidance_map.get(
                        description,
                        "Check service configuration and network connectivity.",
                    ),
                )
            )

        # Cache service status
        now = datetime.now(timezone.utc).isoformat()
        for service_status in service_statuses:
            cursor.execute(
                """
                INSERT OR REPLACE INTO service_status 
                (service_name, status, message, checked_at)
                VALUES (?, ?, ?, ?)
            """,
                (
                    service_status.service_name,
                    service_status.status,
                    service_status.message,
                    now,
                ),
            )
        conn.commit()

        # Return both the detailed result and the service statuses
        return {
            "status": result.get("status"),
            "message": result.get("message"),
            "cluster_info": result.get("cluster_info"),
            "services": result.get("services"),  # Detailed service info
            "service_statuses": service_statuses,  # Formatted for UI compatibility
        }
    finally:
        conn.close()


@app.get("/profile/readiness")
def get_readiness_score():
    """Calculate readiness score based on service status."""
    result = discover_services()

    # Handle new response format
    if isinstance(result, dict) and "service_statuses" in result:
        services = result["service_statuses"]
    elif isinstance(result, dict) and "services" in result:
        # Convert detailed services to service statuses
        services = []
        for s in result["services"]:
            status = (
                "available"
                if s.get("auth_status") == "success"
                else "reachable" if (s.get("tcp_available")) else "missing"
            )
            services.append(
                {
                    "service_name": s.get("description", "").lower().replace(" ", "_"),
                    "status": status,
                    "required": True,
                }
            )
    else:
        services = result if isinstance(result, list) else []

    required_services = [
        s
        for s in services
        if (isinstance(s, dict) and s.get("required"))
        or (hasattr(s, "required") and s.required)
    ]
    available_required = sum(
        1
        for s in required_services
        if (isinstance(s, dict) and s.get("status") == "available")
        or (hasattr(s, "status") and s.status == "available")
    )
    score = (
        (available_required / len(required_services) * 100) if required_services else 0
    )

    return {
        "score": round(score),
        "total_required": len(required_services),
        "available_required": available_required,
        "services": services,
    }


# --- S3 Key Generation ---
@app.get("/profile/s3credentials")
def generate_s3_credentials() -> str:
    """Generate a temprorary S3 key."""
    profile = get_profile_from_db()
    if not profile or not profile.get("cluster_host"):
        raise HTTPException(status_code=400, detail="Failed to generate s3 credentials")

    connector = DataFabricConnector(profile)
    try:
        s3_credentials = connector.generate_s3_credentials()
        logger.info(f"Created S3 keys: {s3_credentials}")
        # Update bootstrap state
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                INSERT OR REPLACE INTO connection_profile
                (id, s3_credentials)
                VALUES ('default', ?, ?)
            """,
                (s3_credentials),
            )
            conn.commit()
        finally:
            logger.debug("DB profile updated with S3 credentials")
            conn.close()
    except Exception as error:
        logger.error(error)


# --- Dashboard Endpoints ---


@app.get("/dashboard/data")
def get_dashboard_data():
    """Get dashboard data: topics, tables, and buckets."""
    try:
        profile = get_profile_from_db()
        if not profile or not profile.get("cluster_host"):
            logger.debug("Dashboard check: Profile not configured")
            return {
                "configured": False,
                "topics": [],
                "tables": [],
                "buckets": [],
                "readiness": {},
            }

        # Check if bootstrapped before checking all resources
        bootstrapped = is_bootstrapped()
        if not bootstrapped:
            logger.debug("Dashboard check: Not bootstrapped, skipping resource list")
            return {
                "configured": True,
                "bootstrapped": False,
                "topics": [],
                "tables": [],
                "buckets": [],
                "readiness": {
                    "bronze": {"status": "missing", "details": {}},
                    "silver": {"status": "missing", "details": {}},
                    "gold": {"status": "missing", "details": {}},
                },
            }

        connector = DataFabricConnector(profile)

        # List resources
        topics = connector.list_topics()
        tables = connector.list_iceberg_tables()
        buckets = connector.list_buckets()

        # Medallion Architecture mapping for readiness check and filtering
        medallion_expectations = {
            "bronze": {
                "bucket": "bronze-raw",
                "topic": "manufacturing.telemetry.raw",
            },
            "silver": {
                "bucket": "silver-processed",
                "table": "telemetry.cleansed",
            },
            "gold": {
                "bucket": "gold-curated",
                "table": "manufacturing.kpis",
            },
        }

        # Collect all expected resource names for filtering
        expected_buckets = {
            s.get("bucket") for s in medallion_expectations.values() if "bucket" in s
        }
        expected_topics = {
            s.get("topic") for s in medallion_expectations.values() if "topic" in s
        }
        expected_tables = {
            s.get("table") for s in medallion_expectations.values() if "table" in s
        }

        # Helper to check existence and filter
        bucket_names = (
            [b.get("name") for b in buckets] if isinstance(buckets, list) else []
        )
        topic_names = [t.get("name") for t in topics]
        table_names = [t.get("name") for t in tables]

        readiness = {}
        for layer, specs in medallion_expectations.items():
            layer_ready = True
            details = {}

            if "bucket" in specs:
                exists = specs["bucket"] in bucket_names
                details["bucket"] = exists
                if not exists:
                    layer_ready = False

            if "topic" in specs:
                exists = specs["topic"] in topic_names
                details["topic"] = exists
                if not exists:
                    layer_ready = False

            if "table" in specs:
                target = specs["table"]
                exists = any(
                    t == target or t.endswith("." + target) for t in table_names
                )
                details["table"] = exists
                if not exists:
                    layer_ready = False

            readiness[layer] = {
                "status": "ready" if layer_ready else "missing",
                "details": details,
            }

        # Return only relevant resources
        return {
            "configured": True,
            "bootstrapped": True,
            "topics": [t for t in topics if t.get("name") in expected_topics],
            "tables": [
                t
                for t in tables
                if any(
                    t.get("name") == target or t.get("name", "").endswith("." + target)
                    for target in expected_tables
                )
            ],
            "buckets": [b for b in buckets if b.get("name") in expected_buckets],
            "readiness": readiness,
        }
    except Exception as e:
        logger.error(f"Error fetching dashboard data: {str(e)}", exc_info=True)
        return {
            "configured": True,
            "bootstrapped": True,
            "error": str(e),
            "topics": [],
            "tables": [],
            "buckets": [],
            "readiness": {},
        }


@app.get("/buckets/{name}/objects")
def get_bucket_objects(name: str):
    profile = get_profile_from_db()
    if not profile:
        raise HTTPException(status_code=400, detail="Profile not configured")
    connector = DataFabricConnector(profile)
    return connector.list_objects(name)


@app.get("/topics/{name}/metrics")
def get_topic_metrics_endpoint(name: str):
    profile = get_profile_from_db()
    if not profile:
        raise HTTPException(status_code=400, detail="Profile not configured")
    connector = DataFabricConnector(profile)
    return connector.get_topic_metrics(name)


@app.get("/topics/{name}/messages")
def get_topic_messages(name: str, limit: int = 50):
    profile = get_profile_from_db()
    if not profile:
        raise HTTPException(status_code=400, detail="Profile not configured")
    connector = DataFabricConnector(profile)
    return connector.kafka.list_messages(name, limit=limit)


@app.get("/topics/{name}/queue")
def get_topic_queue(name: str, limit: int = 50):
    """Peek at unprocessed messages in the queue without committing offsets."""
    profile = get_profile_from_db()
    if not profile:
        raise HTTPException(status_code=400, detail="Profile not configured")
    connector = DataFabricConnector(profile)
    return connector.kafka.list_unprocessed_messages(name, limit=limit)


@app.get("/tables/{name}/data")
def get_table_data_endpoint(name: str):
    profile = get_profile_from_db()
    if not profile:
        raise HTTPException(status_code=400, detail="Profile not configured")
    connector = DataFabricConnector(profile)
    return connector.get_table_data(name)


@app.get("/tables/{name}/metrics")
def get_table_metrics_endpoint(name: str):
    profile = get_profile_from_db()
    if not profile:
        raise HTTPException(status_code=400, detail="Profile not configured")
    connector = DataFabricConnector(profile)
    return connector.iceberg.get_table_metrics(name)


@app.get("/topics/{name}/detailed-metrics")
def get_detailed_topic_metrics(name: str):
    """Get comprehensive topic metrics including processing lag and timestamps."""
    profile = get_profile_from_db()
    if not profile:
        raise HTTPException(status_code=400, detail="Profile not configured")

    connector = DataFabricConnector(profile)

    # Get basic metrics
    basic_metrics = connector.kafka.get_topic_metrics(name)

    # Calculate additional metrics
    total_messages = basic_metrics.get("messages_count", 0)
    in_queue = basic_metrics.get("in_queue", 0)
    processed = total_messages - in_queue

    # Get timestamps from messages
    latest_msg_time = None
    last_processed_time = None
    lag_seconds = basic_metrics.get("delay_seconds", 0)

    try:
        # Get latest message timestamp
        latest_messages = connector.kafka.list_messages(name, limit=1)
        if latest_messages:
            latest_msg_time = latest_messages[0].get("timestamp")

        # Calculate last processed time from lag
        if latest_msg_time and lag_seconds > 0:

            latest_dt = datetime.fromisoformat(latest_msg_time.replace("Z", "+00:00"))
            last_processed_dt = latest_dt - timedelta(seconds=lag_seconds)
            last_processed_time = last_processed_dt.isoformat()
        elif latest_msg_time:
            # If no lag, last processed is same as latest
            last_processed_time = latest_msg_time
    except Exception as e:
        logger.error(f"Error calculating timestamps: {e}")

    # Calculate processing rate (messages per second)
    processing_rate = 0
    if lag_seconds > 0 and in_queue > 0:
        processing_rate = round(in_queue / lag_seconds, 1)

    return {
        "topic": name,
        "total_messages": total_messages,
        "in_queue": in_queue,
        "processed": processed,
        "latest_message_timestamp": latest_msg_time,
        "last_processed_timestamp": last_processed_time,
        "lag_seconds": lag_seconds,
        "processing_rate": processing_rate,
        "queue_depth_percent": (
            round((in_queue / total_messages * 100), 1) if total_messages > 0 else 0
        ),
    }


@app.post("/profile/bootstrap", response_model=BootstrapResult)
def bootstrap_demo(background_tasks: BackgroundTasks):
    """Bootstrap demo environment: create volumes, topics, and tables."""
    profile = get_profile_from_db()
    if not profile or not profile.get("cluster_host"):
        raise HTTPException(status_code=400, detail="Profile not configured")

    connector = DataFabricConnector(profile)
    logs = []
    topics = []
    tables = []

    # Create S3 buckets
    buckets = ["bronze-raw", "silver-processed", "gold-curated"]
    for bucket in buckets:
        logs.append(f"Checking bucket: {bucket}...")
        result = connector.create_bucket(bucket)

        outcome = result.get("outcome", "unknown")
        if outcome == "created":
            msg = f"✓ Bucket {bucket} created successfully"
        elif outcome == "skipped":
            msg = f"→ Bucket {bucket} already exists, skipping"
        else:
            msg = f"✕ Failed to create bucket {bucket}: {result.get('message')}"

        logs.append(msg)
        # log_demo_event("default", "bootstrap", msg)

    # Create Kafka topics
    topic_configs = [
        ("manufacturing.telemetry.raw", 1, 1),  # 1 partition, 1 replication
    ]

    for topic_name, partitions, replication in topic_configs:
        logs.append(f"Checking topic: {topic_name}...")
        result = connector.create_topic(topic_name, partitions, replication)
        topics.append(result.get("topic", {}))

        outcome = result.get("outcome", "unknown")
        if outcome == "created":
            msg = f"✓ Topic {topic_name} created successfully"
        elif outcome == "skipped":
            msg = f"→ Topic {topic_name} already exists, skipping"
        else:
            msg = f"✕ Failed to create topic {topic_name}: {result.get('message')}"

        logs.append(msg)
        # log_demo_event("default", "bootstrap", msg)

    # Create Iceberg tables
    table_schemas = {
        "telemetry.cleansed": {
            "type": "struct",
            "schema-id": 1,
            "fields": [
                {"id": 1, "required": True, "name": "event_id", "type": "string"},
                {"id": 2, "required": True, "name": "device_id", "type": "string"},
                {"id": 3, "required": True, "name": "timestamp", "type": "timestamp"},
                {"id": 4, "required": True, "name": "temperature", "type": "float"},
                {"id": 5, "required": True, "name": "vibration", "type": "float"},
                {"id": 6, "required": True, "name": "status", "type": "string"},
            ],
        },
        "manufacturing.kpis": {
            "type": "struct",
            "schema-id": 1,
            "fields": [
                {
                    "id": 1,
                    "required": True,
                    "name": "window_start",
                    "type": "timestamp",
                },
                {"id": 2, "required": True, "name": "window_end", "type": "timestamp"},
                {"id": 3, "required": True, "name": "total_events", "type": "long"},
                {"id": 4, "required": True, "name": "avg_temp", "type": "float"},
                {"id": 5, "required": True, "name": "anomaly_count", "type": "int"},
            ],
        },
    }

    for table_name, schema in table_schemas.items():
        logs.append(f"Checking table: {table_name}...")
        result = connector.create_iceberg_table(table_name, schema)
        tables.append(result.get("table", {}))

        outcome = result.get("outcome", "unknown")
        if outcome == "created":
            msg = f"✓ Table {table_name} created successfully"
        elif outcome == "skipped":
            msg = f"→ Table {table_name} already exists, skipping"
        else:
            msg = f"✕ Failed to create table {table_name}: {result.get('message')}"

        logs.append(msg)
        # log_demo_event("default", "bootstrap", msg)

    # Update bootstrap state
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        now = datetime.now(timezone.utc).isoformat()
        cursor.execute(
            """
            INSERT OR REPLACE INTO bootstrap_state 
            (id, topics_created, tables_created, bootstrapped_at)
            VALUES ('default', ?, ?, ?)
        """,
            (len(topics), len(tables), now),
        )
        conn.commit()
    finally:
        conn.close()

    logs.append("✓ Demo environment bootstrap completed successfully")
    # log_demo_event("default", "bootstrap", "Bootstrap completed")

    return BootstrapResult(status="success", topics=topics, tables=tables, logs=logs)


@app.get("/profile/bootstrap/status")
def get_bootstrap_status():
    """Get bootstrap status."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM bootstrap_state WHERE id = 'default'")
        row = cursor.fetchone()
        if not row:
            return {"bootstrapped": False}
        return dict(row)
    finally:
        conn.close()


# --- Debug Endpoints ---


@app.get("/debug/tables")
def get_sqlite_tables():
    """Get list of tables in SQLite database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        return {"tables": tables}
    finally:
        conn.close()


@app.get("/debug/table/{table_name}")
def get_sqlite_table_content(table_name: str, limit: int = 100):
    """Get content of a specific SQLite table."""
    # Allow-list tables for security
    allowed_tables = [
        "connection_profile",
        "service_status",
        "bootstrap_state",
    ]
    if table_name not in allowed_tables:
        raise HTTPException(status_code=400, detail="Table not allowed")

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Use simple string formatting since table name is validated against allow-list
        cursor.execute(f"SELECT * FROM {table_name} LIMIT ?", (limit,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


# --- Batch Ingestion Endpoints ---


# @app.post("/scenarios/generate_batch_csv")
# def generate_batch_csv():
#     """Generate a CSV file with telemetry data in the bronze S3 bucket."""
#     profile = get_profile_from_db()
#     if not profile:
#         raise HTTPException(status_code=400, detail="Profile not configured")

#     connector = DataFabricConnector(profile)

#     try:
#         import csv
#         import random
#         import io
#         from datetime import datetime, timedelta

#         # Generate 100 sample records
#         records = []
#         devices = ["CNC-001", "CNC-002", "ROBOT-A", "ROBOT-B", "PRESS-04"]

#         for _ in range(100):
#             record = {
#                 "event_id": str(uuid4()),
#                 "device_id": random.choice(devices),
#                 "timestamp": datetime.now(timezone.utc).isoformat(),
#                 "temperature": random.uniform(60, 95),
#                 "vibration": random.uniform(0.1, 5.0),
#                 "status": random.choice(
#                     ["OK", "OK", "OK", "OK", "OK", "OK", "WARNING"]
#                 ),
#             }
#             records.append(record)

#         # Write CSV to string buffer
#         csv_buffer = io.StringIO()
#         writer = csv.DictWriter(csv_buffer, fieldnames=records[0].keys())
#         writer.writeheader()
#         writer.writerows(records)
#         csv_content = csv_buffer.getvalue()

#         bucket_name = "bronze-raw"
#         object_key = "batch_ingest.csv"

#         if connector.s3.put_object(
#             bucket_name, object_key, csv_content.encode("utf-8")
#         ):
#             # log_demo_event(
#             #     "default",
#             #     "batch_csv_generated",
#             #     f"Generated {len(records)} records in s3://{bucket_name}/{object_key}",
#             # )
#             return {
#                 "status": "success",
#                 "message": f"Generated {len(records)} records",
#                 "bucket": bucket_name,
#                 "key": object_key,
#                 "record_count": len(records),
#                 "preview": records[:5],  # Show first 5 records
#             }
#         else:
#             # log_demo_event(
#             #     "default",
#             #     "batch_csv_generated failed with S3 put",
#             #     f"Unknown S3 Put error for s3://{bucket_name}/{object_key}",
#             # )
#             return {
#                 "status": "error",
#                 "message": f"Failed to put csv file into s3://{bucket_name}/{object_key}",
#             }

#     except Exception as e:
#         logger.error(f"Failed to generate batch CSV: {e}")
#         return {"status": "error", "message": str(e)}


# @app.get("/scenarios/preview_batch_csv")
# def preview_batch_csv():
#     """Preview the content of the batch CSV file from S3."""
#     profile = get_profile_from_db()
#     if not profile:
#         raise HTTPException(status_code=400, detail="Profile not configured")

#     connector = DataFabricConnector(profile)

#     try:
#         import csv

#         bucket_name = "bronze-raw"
#         object_key = "batch_ingest.csv"
#         csv_content = connector.s3.read_object(bucket_name, object_key)
#         # Parse CSV
#         records = []
#         reader = csv.DictReader(io.StringIO(csv_content))
#         for row in reader:
#             records.append(row)

#         return {
#             "status": "success",
#             "bucket": bucket_name,
#             "key": object_key,
#             "record_count": len(records),
#             "records": records,
#         }
#     except Exception as e:
#         logger.error(f"Failed to preview CSV: {e}")
#         if "NoSuchKey" in str(e):
#             return {
#                 "status": "error",
#                 "message": "CSV file not found. Generate it first.",
#             }
#         return {"status": "error", "message": str(e)}


# @app.post("/scenarios/publish_batch")
# def publish_batch():
#     """Publish the batch CSV from S3 to Kafka topic."""
#     profile = get_profile_from_db()
#     if not profile:
#         raise HTTPException(status_code=400, detail="Profile not configured")

#     connector = DataFabricConnector(profile)

#     try:
#         import csv

#         bucket_name = "bronze-raw"
#         object_key = "batch_ingest.csv"
#         csv_content = connector.s3.read_object(bucket_name, object_key)

#         # Parse CSV and publish to Kafka
#         topic_name = "manufacturing.telemetry.raw"

#         count = 0
#         reader = csv.DictReader(io.StringIO(csv_content))
#         if connector.kafka.push_messages(topic_name, [row for row in reader]):
#             count = len([row for row in reader])

#         # log_demo_event(
#         #     "default",
#         #     "batch_published",
#         #     f"Published {count} records from s3://{bucket_name}/{object_key} to {topic_name}",
#         # )

#         return {
#             "status": "success",
#             "message": f"Published {count} records to {topic_name}",
#             "bucket": bucket_name,
#             "key": object_key,
#             "record_count": count,
#         }
#     except Exception as e:
#         logger.error(f"Failed to publish batch: {e}")
#         if "NoSuchKey" in str(e):
#             return {
#                 "status": "error",
#                 "message": "CSV file not found. Generate it first.",
#             }
#         return {"status": "error", "message": str(e)}


# --- Scenario Runner Endpoints ---


@app.post("/profile/scenarios/run", response_model=ScenarioResult)
def run_scenario(request: ScenarioRequest):
    """Run a scenario playbook."""
    profile = get_profile_from_db()
    if not profile or not profile.get("cluster_host"):
        raise HTTPException(status_code=400, detail="Profile not configured")

    connector = DataFabricConnector(profile)
    logs = []
    data_generated = {}

    if request.scenario_type == "iot_streaming":
        # Simulate IoT devices sending data to Kafka (Bronze)
        # log_demo_event("default", "scenario", "Starting IoT streaming with Kafka...")
        logs.append("Initializing simulated IoT sensors...")

        for event in iot_streaming_scenario(connector, logs):
            if isinstance(event, dict):
                data_generated.update(event)
            else:
                logs.append(str(event))

        # log_demo_event("default", "scenario", "Curation job completed")

    elif request.scenario_type == "process_data":
        logs.append("Will be implemented!")

    elif request.scenario_type == "curate_data":
        logs.append("Will be implemented!")

    else:
        raise HTTPException(
            status_code=400, detail=f"Unknown scenario type: {request.scenario_type}"
        )

    return ScenarioResult(
        status="success",
        message=f"Scenario {request.scenario_type} completed successfully",
        logs=logs,
        data_generated=data_generated,
    )
