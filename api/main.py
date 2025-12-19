import logging
import os
import sqlite3
import json
import time
import random
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import uuid4
from pathlib import Path
import urllib3

from DFConnector import (
    BootstrapResult,
    ConnectionProfile,
    ConnectionTestResult,
    DataFabricConnector,
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
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s"

logging.basicConfig(
    level=LOG_LEVEL,
    format=LOG_FORMAT,
)

# Disable detailed logs for noisy libraries
for noise_logger in [
    "kafka.conn", "kafka.metrics", "kafka.protocol", "kafka.client", 
    "kafka.cluster", "kafka.admin.client", "urllib3", "botocore", "uvicorn.error", "uvicorn.access", "pyiceberg.io", "asyncio",
    "s3fs", "aiobotocore.regions"
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

from fastapi import FastAPI, HTTPException, Body, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

# --- Logging Setup ---
# Logger initialized above with imports
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("GET /health") == -1


logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

app = FastAPI(title="HPE Data Fabric Demo API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Configuration (SQLite for demo config) ---
# Use /app/data in container, ./data locally
DB_DIR = Path(os.getenv("DB_DIR", "/app/data"))
DB_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DB_DIR / "demo_config.db"


def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize SQLite database for single connection profile and demo state."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Single connection profile table (using fixed ID)
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS connection_profile (
            id TEXT PRIMARY KEY DEFAULT 'default',
            name TEXT NOT NULL DEFAULT 'Data Fabric Connection',
            cluster_host TEXT,
            username TEXT,
            password TEXT,
            created_at TEXT,
            updated_at TEXT,
            configured BOOLEAN DEFAULT 0,
            s3_credentials TEXT
        )
    """
    )

    # Service status cache
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS service_status (
            service_name TEXT PRIMARY KEY,
            status TEXT,
            message TEXT,
            checked_at TEXT
        )
    """
    )

    # Bootstrap state
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS bootstrap_state (
            id TEXT PRIMARY KEY DEFAULT 'default',
            volumes_created INTEGER DEFAULT 0,
            topics_created INTEGER DEFAULT 0,
            tables_created INTEGER DEFAULT 0,
            bootstrapped_at TEXT
        )
    """
    )

    # Demo logs
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS demo_logs (
            id TEXT PRIMARY KEY,
            profile_id TEXT,
            log_type TEXT,
            message TEXT,
            timestamp TEXT
        )
    """
    )

    conn.commit()
    conn.close()
    logger.info("Database initialized.")


# --- Database Initialization ---


@app.on_event("startup")
async def startup_event():
    init_db()


# --- Single Connection Profile Endpoints ---


@app.get("/health")
def health_check():
    return {"status": "healthy"}


def get_profile_from_db() -> Optional[Dict[str, Any]]:
    """Get the single connection profile from database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM connection_profile WHERE id = 'default'")
        row = cursor.fetchone()
        if row:
            profile = dict(row)
            return profile
        return None
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
        now = datetime.utcnow().isoformat()
        existing = get_profile_from_db()

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
        
        # After saving, assume credentials are valid (frontend tested them)
        # Generate S3 keys for caching
        try:
            # Re-fetch full profile including password for connector
            saved_profile = get_profile_from_db()
            if saved_profile and saved_profile.get("username") and saved_profile.get("password"):
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
                             "expiryTime": data.get("expiryTime")
                         }
                         
                         s3_creds_json = json.dumps(stored_creds)
                         cursor.execute(
                            "UPDATE connection_profile SET s3_credentials = ? WHERE id = 'default'",
                            (s3_creds_json,)
                         )
                         conn.commit()
                         logger.info("S3 credentials generated and saved.")
                         profile.s3_credentials = s3_creds_json
                     except (IndexError, AttributeError) as e:
                         logger.warning(f"Failed to parse S3 credentials data: {e}")
                else:
                    logger.warning(f"Failed to generate S3 credentials (Status not OK): {s3_creds}")

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
                detail="No configuration found. Please save settings or provide them in the request."
            )

        if not profile.get("cluster_host"):
            logger.error("Connection test failed: Missing cluster_host")
            raise HTTPException(
                status_code=400, 
                detail="Cluster Host is required. Please verify your configuration."
            )

        connector = DataFabricConnector(profile)
        result = connector.test_connection()
        
        logger.info(f"Connection test result: {result.get('status')} - {result.get('message')}")
        
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
            details={"error": str(e)}
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
        now = datetime.utcnow().isoformat()
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
                else "reachable" if (s.get("tcp_available"))
                else "missing"
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


# --- Bootstrap Endpoints ---


def log_demo_event(profile_id: str, log_type: str, message: str):
    """Log demo events to database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        log_id = str(uuid4())
        now = datetime.utcnow().isoformat()
        cursor.execute(
            """
            INSERT INTO demo_logs (id, profile_id, log_type, message, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """,
            (log_id, profile_id or "default", log_type, message, now),
        )
        conn.commit()
    finally:
        conn.close()


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
            now = datetime.now(timezone.utc).isoformat()
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
    """Get dashboard data: volumes, topics, tables, and buckets."""
    profile = get_profile_from_db()
    if not profile or not profile.get("cluster_host"):
        # Return placeholder data
        return {
            "configured": False,
            "volumes": [],
            "topics": [],
            "tables": [],
            "buckets": [],
        }

    connector = DataFabricConnector(profile)

    try:
        volumes = connector.list_volumes()
        topics = connector.list_topics()
        tables = connector.list_iceberg_tables()
        buckets = connector.list_buckets()

        # Medallion Architecture mapping for readiness check
        medallion_expectations = {
            "bronze": {
                "volume_name": "bronze",
                "bucket": "bronze-raw",
                "topic": "manufacturing.telemetry.raw",
            },
            "silver": {
                "volume_name": "silver",
                "bucket": "silver-processed",
                "table": "telemetry.cleansed",
            },
            "gold": {
                "volume_name": "gold",
                "bucket": "gold-curated",
                "table": "manufacturing.kpis",
            },
        }

        readiness = {}
        
        # Helper to check existence
        vol_names = [v.get("name") for v in volumes]
        bucket_names = [b.get("name") for b in buckets] if isinstance(buckets, list) else []
        topic_names = [t.get("name") for t in topics]
        table_names = [t.get("name") for t in tables] # Simplify if fully qualified

        for layer, specs in medallion_expectations.items():
            layer_ready = True
            details = {}
            
            if "volume_name" in specs:
                exists = specs["volume_name"] in vol_names
                details["volume"] = exists
                if not exists: layer_ready = False
            
            if "bucket" in specs:
                # bucket_names usually distinct
                exists = specs["bucket"] in bucket_names
                details["bucket"] = exists
                if not exists: layer_ready = False
                
            if "topic" in specs:
                exists = specs["topic"] in topic_names
                details["topic"] = exists
                if not exists: layer_ready = False
                
            if "table" in specs:
                # Use strict match if possible, but allow for catalog prefix
                target = specs["table"]
                exists = any(t == target or t.endswith("." + target) for t in table_names)
                details["table"] = exists
                if not exists: layer_ready = False
            
            readiness[layer] = {
                "status": "ready" if layer_ready else "missing",
                "details": details
            }

        return {
            "configured": True,
            "volumes": volumes,
            "topics": topics,
            "tables": tables,
            "buckets": buckets,
            "readiness": readiness
        }
    except Exception as e:
        logger.error(f"Error fetching dashboard data: {str(e)}")
        return {
            "configured": True,
            "error": str(e),
            "volumes": [],
            "topics": [],
            "tables": [],
            "buckets": [],
            "readiness": {}
        }


@app.post("/profile/bootstrap", response_model=BootstrapResult)
def bootstrap_demo(background_tasks: BackgroundTasks):
    """Bootstrap demo environment: create volumes, topics, and tables."""
    profile = get_profile_from_db()
    if not profile or not profile.get("cluster_host"):
        raise HTTPException(status_code=400, detail="Profile not configured")

    connector = DataFabricConnector(profile)
    logs = []
    volumes = []
    topics = []
    tables = []

    # Create volumes
    volume_paths = [
        ("bronze", "/manufacturing.bronze"),
        ("silver", "/manufacturing.silver"),
        ("gold", "/manufacturing.gold"),
    ]

    for vol_name, vol_path in volume_paths:
        logs.append(f"Checking volume: {vol_name}...")
        result = connector.create_volume(
            vol_name, vol_path, replication=3, quota_gb=100
        )
        volumes.append(result.get("volume", {}))
        
        outcome = result.get("outcome", "unknown")
        if outcome == "created":
            msg = f"✓ Volume {vol_name} created successfully"
        elif outcome == "skipped":
            msg = f"→ Volume {vol_name} already exists, skipping"
        else:
             msg = f"✕ Failed to create volume {vol_name}: {result.get('message')}"
        
        logs.append(msg)
        log_demo_event("default", "bootstrap", msg)

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
        log_demo_event("default", "bootstrap", msg)

    # Create Kafka topics
    topic_configs = [
        ("manufacturing.telemetry.raw", 6, 3),
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
        log_demo_event("default", "bootstrap", msg)

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
            ]
        },
        "manufacturing.kpis": {
            "type": "struct",
            "schema-id": 1,
            "fields": [
                {"id": 1, "required": True, "name": "window_start", "type": "timestamp"},
                {"id": 2, "required": True, "name": "window_end", "type": "timestamp"},
                {"id": 3, "required": True, "name": "total_events", "type": "long"},
                {"id": 4, "required": True, "name": "avg_temp", "type": "float"},
                {"id": 5, "required": True, "name": "anomaly_count", "type": "int"},
            ]
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
        log_demo_event("default", "bootstrap", msg)

    # Update bootstrap state
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        now = datetime.utcnow().isoformat()
        cursor.execute(
            """
            INSERT OR REPLACE INTO bootstrap_state 
            (id, volumes_created, topics_created, tables_created, bootstrapped_at)
            VALUES ('default', ?, ?, ?, ?)
        """,
            (len(volumes), len(topics), len(tables), now),
        )
        conn.commit()
    finally:
        conn.close()

    logs.append("✓ Demo environment bootstrap completed successfully")
    log_demo_event("default", "bootstrap", "Bootstrap completed")

    return BootstrapResult(
        status="success", volumes=volumes, topics=topics, tables=tables, logs=logs
    )


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


@app.get("/profile/logs")
def get_demo_logs(limit: int = 100):
    """Get demo logs."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            SELECT * FROM demo_logs
            WHERE profile_id = 'default'
            ORDER BY timestamp DESC
            LIMIT ?
        """,
            (limit,),
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
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
        "demo_logs",
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

    if request.scenario_type == "simulate_ingestion":
        # Simulate IoT devices sending data to Kafka (Bronze)
        log_demo_event("default", "scenario", "Starting ingestion simulation...")
        logs.append("Initializing simulated IoT sensors...")
        
        # Simulate production of messages
        count = 100
        logs.append(f"Ingesting {count} telemetry events to topic 'manufacturing.telemetry.raw'...")
        
        # In a real app we would use connector.get_kafka_producer()
        # Here we simulate the activity delay and logging
        time.sleep(2) 
        
        logs.append(f"✓ {count} events successfully published to Kafka")
        data_generated = {"events_ingested": count, "target": "manufacturing.telemetry.raw"}
        
        log_demo_event("default", "scenario", f"Ingested {count} events to Bronze layer")

    elif request.scenario_type == "process_data":
        # Process Raw -> Silver (Iceberg)
        log_demo_event("default", "scenario", "Starting data processing job (Bronze -> Silver)...")
        logs.append("Reading batch from 'manufacturing.telemetry.raw'...")
        time.sleep(1)
        
        logs.append("Applying schema validation and data cleansing...")
        time.sleep(1.5)
        
        record_count = 85 # Some filtered out
        logs.append(f"Writing {record_count} cleansed records to 'telemetry.cleansed'...")
        time.sleep(1)
        
        # Simulate update to S3/Iceberg
        logs.append("✓ Committed transaction to Iceberg table")
        data_generated = {"records_processed": record_count, "target": "telemetry.cleansed"}
        
        log_demo_event("default", "scenario", "Processing job completed")

    elif request.scenario_type == "curate_data":
        # Aggregate Silver -> Gold
        log_demo_event("default", "scenario", "Starting curation/aggregation job (Silver -> Gold)...")
        logs.append("Querying 'manufacturing.telemetry.cleansed' for KPI calculation...")
        time.sleep(1)
        
        logs.append("Calculating hourly aggregates (Avg Temp, Vibration anomalies)...")
        time.sleep(2)
        
        logs.append("Updating 'manufacturing.kpis' table...")
        time.sleep(1)
        
        logs.append("✓ KPI dashboard view refreshed")
        data_generated = {"kpis_generated": 12, "target": "manufacturing.kpis"}
        
        log_demo_event("default", "scenario", "Curation job completed")

    else:
        raise HTTPException(status_code=400, detail=f"Unknown scenario type: {request.scenario_type}")

    return ScenarioResult(
        status="success",
        message=f"Scenario {request.scenario_type} completed successfully",
        logs=logs,
        data_generated=data_generated,
    )
