import logging
import traceback
from typing import Dict, Any, List
import pandas as pd
import pyarrow as pa
from services.base import BaseDataFabricService
from services.db import DB_PATH
from pyiceberg.catalog.sql import SqlCatalog
from pyiceberg.schema import Schema
from pyiceberg.types import (
    TimestampType,
    FloatType,
    StringType,
    NestedField,
    LongType,
    IntegerType,
)
from pyiceberg.exceptions import NamespaceAlreadyExistsError, NoSuchTableError

logger = logging.getLogger("api.services.iceberg")


def retry_iceberg(max_retries=3, delay=1):
    def decorator(func):
        import time

        def wrapper(*args, **kwargs):
            last_err = None
            for i in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_err = e
                    if "121" in str(e) or "Internal Server Error" in str(e):
                        logger.warning(
                            f"Iceberg operation failed (attempt {i+1}/{max_retries}): {e}. Retrying..."
                        )
                        time.sleep(delay * (i + 1))
                        continue
                    raise e
            raise last_err

        return wrapper

    return decorator


class IcebergService(BaseDataFabricService):
    def __init__(self, profile: Dict[str, Any]):
        super().__init__(profile)
        self.catalog = self._init_catalog()

    def _init_catalog(self) -> SqlCatalog:
        """Initialize the local SQL catalog."""
        warehouse_path = f"s3://gold-curated/iceberg/"

        # PyIceberg SQL Catalog configuration
        catalog_conf = {
            "uri": f"sqlite:///{DB_PATH}",
            "warehouse": warehouse_path,
            "s3.endpoint": f"https://{self.cluster_host}:9000",
            "s3.access-key-id": self.profile.get("username", "mapr"),
            "s3.secret-access-key": self.profile.get("password", "mapr"),
            "s3.region": "us-east-1",
            "s3.path-style-access": True,
            "s3.ssl.verify": False,
            "py-io-impl": "pyiceberg.io.pyarrow.PyArrowFileIO",
        }

        # Add S3 credentials if available (for temp key support)
        s3_creds = self.profile.get("s3_credentials")
        if s3_creds:
            import json

            try:
                if isinstance(s3_creds, str):
                    s3_creds = json.loads(s3_creds)
                catalog_conf["s3.access-key-id"] = s3_creds.get("accessKey")
                catalog_conf["s3.secret-access-key"] = s3_creds.get("secretKey")
            except:
                pass

        return SqlCatalog("demo_catalog", **catalog_conf)

    def test_iceberg(self) -> Dict[str, Any]:
        """Test catalog connectivity."""
        try:
            self.catalog.list_namespaces()
            return {"status": "success", "message": "Iceberg Local Catalog ready"}
        except Exception as e:
            logger.error(f"Iceberg catalog test failed: {e}")
            return {"status": "error", "message": f"Iceberg Catalog error: {str(e)}"}

    @retry_iceberg()
    def list_iceberg_tables(self) -> List[Dict[str, Any]]:
        """List tables across common namespaces for the dashboard."""
        all_tables = []
        try:
            namespaces = self.catalog.list_namespaces()
            for ns_tuple in namespaces:
                ns = ns_tuple[0]
                tables = self.catalog.list_tables(ns)
                for t_tuple in tables:
                    # t_tuple is (namespace, table_name)
                    identifier = f"{ns}.{t_tuple[1]}"
                    try:
                        table = self.catalog.load_table(identifier)
                        schema_summary = ", ".join(
                            [f"{f.name}: {f.field_type}" for f in table.schema().fields]
                        )
                        all_tables.append(
                            {
                                "name": identifier,
                                "location": table.location(),
                                "schema": schema_summary,
                                "namespace": ns,
                            }
                        )
                    except Exception as e:
                        logger.warning(
                            f"Could not load details for table {identifier}: {e}"
                        )
                        logger.debug(traceback.format_exc())
                        all_tables.append({"name": identifier})
        except Exception as e:
            logger.error(f"Error listing tables: {e}")
            logger.debug(traceback.format_exc())
        return all_tables

    def create_iceberg_table(
        self, table_identifier: str, schema_dict: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create an Iceberg table using PyIceberg.
        """
        parts = table_identifier.split(".")
        if len(parts) == 2:
            ns, table_name = parts
        else:
            logger.error(f"Invalid table identifier: {table_identifier}")
            return {
                "status": "error",
                "message": "Invalid table identifier. Use namespace.table",
            }

        # Ensure namespace exists
        try:
            self.catalog.create_namespace(ns)
            logger.info(f"Created namespace {ns}")
        except NamespaceAlreadyExistsError:
            pass
        except Exception as e:
            logger.error(f"Error creating namespace {ns}: {e}")

        # Map simple schema dict to PyIceberg Schema if needed,
        # but for this demo we'll use predefined schemas based on table name
        try:
            iceberg_schema = self._get_schema_for_table(table_identifier)

            # Check if table exists
            try:
                self.catalog.load_table(f"{ns}.{table_name}")
                logger.info(f"Table {ns}.{table_name} already exists")
                return {
                    "status": "success",
                    "outcome": "skipped",
                    "message": f"Table {ns}.{table_name} exists",
                }
            except NoSuchTableError:
                pass

            self.catalog.create_table(
                identifier=f"{ns}.{table_name}",
                schema=iceberg_schema,
                location=f"s3://gold-curated/iceberg/{ns}/{table_name}/",
            )

            logger.info(f"Table {ns}.{table_name} created")
            return {
                "status": "success",
                "outcome": "created",
                "message": f"Table {ns}.{table_name} created",
            }

        except Exception as e:
            logger.error(f"Error creating table {table_identifier}: {e}")
            logger.debug(traceback.format_exc())
            return {"status": "error", "message": str(e)}

    def _get_schema_for_table(self, table_identifier: str) -> Schema:
        """Helper to return PyIceberg Schema objects for known demo tables."""
        if "cleansed" in table_identifier:
            return Schema(
                NestedField(
                    field_id=1, name="event_id", field_type=StringType(), required=True
                ),
                NestedField(
                    field_id=2, name="device_id", field_type=StringType(), required=True
                ),
                NestedField(
                    field_id=3,
                    name="timestamp",
                    field_type=TimestampType(),
                    required=True,
                ),
                NestedField(
                    field_id=4,
                    name="temperature",
                    field_type=FloatType(),
                    required=True,
                ),
                NestedField(
                    field_id=5, name="vibration", field_type=FloatType(), required=True
                ),
                NestedField(
                    field_id=6, name="status", field_type=StringType(), required=True
                ),
            )
        elif "kpis" in table_identifier:
            return Schema(
                NestedField(
                    field_id=1,
                    name="window_start",
                    field_type=TimestampType(),
                    required=True,
                ),
                NestedField(
                    field_id=2,
                    name="window_end",
                    field_type=TimestampType(),
                    required=True,
                ),
                NestedField(
                    field_id=3,
                    name="total_events",
                    field_type=LongType(),
                    required=True,
                ),
                NestedField(
                    field_id=4, name="avg_temp", field_type=FloatType(), required=True
                ),
                NestedField(
                    field_id=5,
                    name="anomaly_count",
                    field_type=IntegerType(),
                    required=True,
                ),
            )
        return Schema(
            NestedField(field_id=1, name="id", field_type=StringType(), required=True)
        )

    @retry_iceberg()
    def get_table_data(
        self, table_identifier: str, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Scan table and return records."""
        try:
            table = self.catalog.load_table(table_identifier)
            # Scan with limit
            scan = table.scan(limit=limit)
            df = scan.to_pandas()
            # Convert pandas DF to list of dicts
            return df.to_dict(orient="records")
        except NoSuchTableError:
            logger.error(f"Table {table_identifier} not found")
            return []
        except Exception as e:
            logger.error(f"Error scanning table {table_identifier}: {e}")
            logger.debug(traceback.format_exc())
            return []

    @retry_iceberg()
    def append_data(
        self, table_identifier: str, records: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Append records to an Iceberg table."""
        try:
            if not records:
                return {"status": "success", "message": "No records to append"}

            table = self.catalog.load_table(table_identifier)
            df = pd.DataFrame(records)

            # Ensure timestamp columns are actually datetime objects if they exist
            # Note: Iceberg uses microsecond precision (us), but pandas defaults to nanoseconds (ns)
            if "timestamp" in df.columns:
                df["timestamp"] = pd.to_datetime(df["timestamp"]).dt.as_unit("us")
            if "window_start" in df.columns:
                df["window_start"] = pd.to_datetime(df["window_start"]).dt.as_unit("us")
            if "window_end" in df.columns:
                df["window_end"] = pd.to_datetime(df["window_end"]).dt.as_unit("us")

            # Convert to PyArrow Table
            arrow_table = pa.Table.from_pandas(df)

            # STRICT CAST: Match Iceberg table's Arrow schema exactly (fixes required vs optional and float vs double)
            target_schema = table.schema().as_arrow()
            # We need to handle nullability and exact types
            casted_table = arrow_table.cast(target_schema)

            # PyIceberg append
            table.append(casted_table)

            logger.info(
                f"Appended {len(records)} records to {table_identifier} using strict schema casting"
            )
            return {"status": "success", "message": f"Appended {len(records)} records"}
        except Exception as e:
            logger.error(f"Error appending to table {table_identifier}: {e}")
            logger.debug(traceback.format_exc())
            return {"status": "error", "message": str(e)}

    @retry_iceberg()
    def get_table_metrics(self, table_identifier: str) -> Dict[str, Any]:
        """Fetch real-time metrics for an Iceberg table."""
        metrics = {
            "name": table_identifier,
            "record_count": 0,
            "snapshot_count": 0,
            "current_snapshot_id": None,
            "last_updated": None,
        }
        try:
            table = self.catalog.load_table(table_identifier)
            # Record count (from latest snapshot properties if available, else scan)
            # PyIceberg doesn't expose total records easily without scan for now in some versions
            # But we can get snapshot info
            metrics["snapshot_count"] = len(table.history())
            current = table.current_snapshot()
            if current:
                metrics["current_snapshot_id"] = current.snapshot_id
                import datetime

                metrics["last_updated"] = datetime.datetime.fromtimestamp(
                    current.timestamp_ms / 1000.0
                ).isoformat()
                # Get record count from summary if present
                metrics["record_count"] = int(current.summary.get("total-records", 0))

            return metrics
        except Exception as e:
            logger.error(f"Error getting metrics for table {table_identifier}: {e}")
            logger.debug(traceback.format_exc())
            return metrics
