import logging
import os
from typing import Dict, Any, List, Optional
from services.base import BaseDataFabricService, DB_PATH
from pyiceberg.catalog.sql import SqlCatalog
from pyiceberg.schema import Schema
from pyiceberg.types import (
    TimestampType,
    FloatType,
    StringType,
    NestedField,
    LongType,
    IntegerType
)
from pyiceberg.exceptions import NamespaceAlreadyExistsError, NoSuchTableError

logger = logging.getLogger("api.services.iceberg")

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
            "s3.verify": "false",
            "s3.region": "us-east-1",
            "s3.path-style-access": "true",
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
                    all_tables.append({"name": f"{ns}.{t_tuple[1]}"})
        except Exception as e:
            logger.error(f"Error listing tables: {e}")
        return all_tables

    def create_iceberg_table(self, table_identifier: str, schema_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create an Iceberg table using PyIceberg.
        """
        parts = table_identifier.split(".")
        if len(parts) == 2:
            ns, table_name = parts
        else:
            logger.error(f"Invalid table identifier: {table_identifier}")
            return {"status": "error", "message": "Invalid table identifier. Use namespace.table"}

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
                return {"status": "success", "outcome": "skipped", "message": f"Table {ns}.{table_name} exists"}
            except NoSuchTableError:
                pass

            self.catalog.create_table(
                identifier=f"{ns}.{table_name}",
                schema=iceberg_schema,
                location=f"s3://gold-curated/iceberg/{ns}/{table_name}/"
            )
            
            logger.info(f"Table {ns}.{table_name} created")
            return {"status": "success", "outcome": "created", "message": f"Table {ns}.{table_name} created"}
            
        except Exception as e:
            logger.error(f"Error creating table {table_identifier}: {e}")
            return {"status": "error", "message": str(e)}

    def _get_schema_for_table(self, table_identifier: str) -> Schema:
        """Helper to return PyIceberg Schema objects for known demo tables."""
        if "cleansed" in table_identifier:
            return Schema(
                NestedField(field_id=1, name="event_id", field_type=StringType(), required=True),
                NestedField(field_id=2, name="device_id", field_type=StringType(), required=True),
                NestedField(field_id=3, name="timestamp", field_type=TimestampType(), required=True),
                NestedField(field_id=4, name="temperature", field_type=FloatType(), required=True),
                NestedField(field_id=5, name="vibration", field_type=FloatType(), required=True),
                NestedField(field_id=6, name="status", field_type=StringType(), required=True),
            )
        elif "kpis" in table_identifier:
            return Schema(
                NestedField(field_id=1, name="window_start", field_type=TimestampType(), required=True),
                NestedField(field_id=2, name="window_end", field_type=TimestampType(), required=True),
                NestedField(field_id=3, name="total_events", field_type=LongType(), required=True),
                NestedField(field_id=4, name="avg_temp", field_type=FloatType(), required=True),
                NestedField(field_id=5, name="anomaly_count", field_type=IntegerType(), required=True),
            )
        return Schema(NestedField(field_id=1, name="id", field_type=StringType(), required=True))
