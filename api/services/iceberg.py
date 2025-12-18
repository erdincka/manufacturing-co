import logging
import json
from typing import Dict, Any, List, Optional
from services.base import BaseDataFabricService
import requests

logger = logging.getLogger("api.services.iceberg")

class IcebergService(BaseDataFabricService):
    def __init__(self, profile: Dict[str, Any]):
        super().__init__(profile)
        self.polaris_credentials = profile.get("polaris_credentials")
        self.headers = self._get_polaris_headers()

    CATALOG_NAME = "manufacturing"

    def _get_polaris_headers(self) -> Optional[Dict[str, str]]:
        if not self.polaris_credentials: return None
        try:
            creds = self.polaris_credentials.split(" root principal credentials: ")[1]
            realm = self.polaris_credentials.split(" root principal credentials: ")[0].split(": ")[1]
            client_id = creds.split(":")[0]
            client_secret = creds.split(":")[1]
            if not client_id or not client_secret: return None
            url = f"https://{self.cluster_host}:8181/api/catalog/v1/oauth/tokens"
            data = {"grant_type": "client_credentials", "scope": "PRINCIPAL_ROLE:ALL"}
            resp = self.session.post(url, data=data, auth=(client_id, client_secret), verify=False, timeout=5)
            if resp.status_code == 200:
                return {
                    "Authorization": f"Bearer {resp.json()['access_token']}",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    'Polaris-Realm': realm
                }
            return None
        except Exception as e:
            logger.error(f"Polaris token error: {e}")
            return None

    def _check_catalog_exists(self) -> bool:
        """Check if the catalog exists without side effects."""
        if not self.headers: return False
        try:
            url = f"https://{self.cluster_host}:8181/api/management/v1/catalogs/{self.CATALOG_NAME}"
            resp = requests.get(url, headers=self.headers, verify=False, timeout=5, auth=None)
            return resp.status_code == 200
        except Exception:
            return False

    def _check_namespace_exists(self, namespace: str) -> bool:
        """Check if the namespace exists without side effects."""
        if not self.headers: return False
        try:
            url = f"https://{self.cluster_host}:8181/api/catalog/v1/{self.CATALOG_NAME}/namespaces/{namespace}"
            resp = requests.get(url, headers=self.headers, verify=False, timeout=5, auth=None)
            return resp.status_code == 200
        except Exception:
            return False

    def _ensure_catalog_exists(self) -> bool:
        """Ensure the manufacturing catalog exists, creating it if necessary."""
        if not self.headers: return False
        try:
            # Check if catalog exists
            url = f"https://{self.cluster_host}:8181/api/management/v1/catalogs/{self.CATALOG_NAME}"
            resp = requests.get(url, headers=self.headers, verify=False, timeout=5, auth=None)
            
            if resp.status_code == 200:
                # logger.debug("Catalog exists at %s", url)
                # logger.debug("API Headers: %s", self.headers)
                return True
            
            # Create catalog if not found
            if resp.status_code == 404:
                logger.info(f"Catalog {self.CATALOG_NAME} not found, creating...")
                create_url = f"https://{self.cluster_host}:8181/api/management/v1/catalogs"
                # payload matches user's recent edit
                payload = {
                    "catalog": {
                        "name": self.CATALOG_NAME,
                        "type": "INTERNAL",
                        "properties": {
                            "default-base-location": f"s3://gold-curated/iceberg/"
                        },
                        "storageConfigInfo": {
                            "storageType": "S3",
                            "allowedLocations": [
                                "s3://gold-curated/iceberg/",
                                "s3://silver-processed/iceberg/"
                            ],
                            "region": "eu-west-1",
                            "defaultLocation": "s3://gold-curated/iceberg/"
                        }
                    }
                }
                resp = requests.post(create_url, headers=self.headers, json=payload, verify=False, timeout=5, auth=None)
                if resp.status_code in [200, 201]:
                    logger.info(f"Catalog {self.CATALOG_NAME} created successfully")
                    return True
                logger.error(f"Failed to create catalog: {resp.status_code} {resp.text}")
            return False
        except Exception as e:
            logger.error(f"Error ensuring catalog exists: {e}")
            return False

    def _ensure_namespace_exists(self, namespace: str) -> bool:
        """Ensure a namespace exists within the catalog, creating it if necessary."""
        if not self.headers: return False
        try:
            # Check namespace
            url = f"https://{self.cluster_host}:8181/api/catalog/v1/{self.CATALOG_NAME}/namespaces/{namespace}"
            resp = requests.get(url, headers=self.headers, verify=False, timeout=5, auth=None)
            
            if resp.status_code == 200:
                return True
                
            # Create namespace if not found
            if resp.status_code == 404:
                if not self._ensure_catalog_exists():
                    return False
                    
                logger.info(f"Namespace {namespace} not found in {self.CATALOG_NAME}, creating...")
                create_url = f"https://{self.cluster_host}:8181/api/catalog/v1/{self.CATALOG_NAME}/namespaces"
                payload = {
                    "namespace": [namespace],
                    "properties": {}
                }
                resp = requests.post(create_url, headers=self.headers, json=payload, verify=False, timeout=5, auth=None)
                if resp.status_code in [200, 201]:
                    logger.info(f"Namespace {namespace} created successfully")
                    return True
                logger.error(f"Failed to create namespace {namespace}: {resp.status_code} {resp.text}")
            return False
        except Exception as e:
            logger.error(f"Error ensuring namespace {namespace} exists: {e}")
            return False

    def test_iceberg(self) -> Dict[str, Any]:
        if not self.headers:
            return {"status": "auth_failed", "message": "Missing Polaris credentials"}
        
        if self._ensure_catalog_exists():
            return {"status": "success", "message": "Polaris Catalogue ready"}
        return {"status": "error", "message": "Polaris Catalogue unavailable"}

    def list_iceberg_tables(self) -> List[Dict[str, Any]]:
        """List tables across common namespaces for the dashboard."""
        if not self.headers: return []
        
        # We check a few known namespaces for the demo
        namespaces = ["telemetry", "kpis"]
        all_tables = []
        
        for ns in namespaces:
            if not self._check_catalog_exists() or not self._check_namespace_exists(ns):
                continue
            try:
                url = f"https://{self.cluster_host}:8181/api/catalog/v1/{self.CATALOG_NAME}/namespaces/{ns}/tables"
                resp = requests.get(url, headers=self.headers, verify=False, auth=None)
                if resp.status_code == 200:
                    data = resp.json()
                    # Polaris nesting: identifiers key contains a list of identifiers
                    # Each identifier is {"namespace": [...], "name": "..."}
                    for t in data.get("identifiers", []):
                        all_tables.append({"name": f"{ns}.{t.get('name')}"})
            except Exception as e:
                logger.debug(f"Error listing tables in {ns}: {e}")
        
        return all_tables

    def create_iceberg_table(self, table_identifier: str, schema: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a table. 
        table_identifier can be "namespace.table" or "catalog.namespace.table"
        """
        if not self.headers:
            return {"status": "error", "message": "No Polaris credentials"}
        
        # Parse identifier
        parts = table_identifier.split(".")
        if len(parts) >= 3:
            # catalog.namespace.table
            ns = parts[1]
            table_name = parts[2]
        elif len(parts) == 2:
            # namespace.table
            ns = parts[0]
            table_name = parts[1]
        else:
            # table only
            logger.error(f"Invalid table identifier: {table_identifier}")
            return {"status": "error", "message": "Invalid table identifier"}
            # ns = "default"
            # table_name = parts[0]

        # Ensure infrastructure
        if not self._ensure_namespace_exists(ns):
            logger.error(f"Failed to ensure namespace {ns}")
            return {"status": "error", "message": f"Failed to ensure namespace {ns}"}

        try:
            # Idempotent check
            existing = [t["name"] for t in self.list_iceberg_tables()]
            if f"{ns}.{table_name}" in existing:
                logger.info(f"Table {ns}.{table_name} exists")
                return {"status": "success", "outcome": "skipped", "message": f"Table {ns}.{table_name} exists"}

            url = f"https://{self.cluster_host}:8181/api/catalog/v1/{self.CATALOG_NAME}/namespaces/{ns}/tables"
            payload = {
                "name": table_name,
                "schema": schema,
                "storageOptions": {
                    "location": f"s3://gold-curated/iceberg/{ns}/{table_name}/"
                }
            }
            resp = requests.post(url, headers=self.headers, json=payload, verify=False, auth=None)
            
            if resp.status_code in [200, 201, 204]:
                logger.info(f"Table {ns}.{table_name} created")
                return {"status": "success", "outcome": "created", "message": f"Table {ns}.{table_name} created"}
            
            logger.error(f"Create table failed: {resp.status_code} {resp.text}")
            return {"status": "error", "message": f"Create table failed: {resp.status_code}"}
        except Exception as e:
            logger.error(f"Error creating table: {e}")
            return {"status": "error", "message": str(e)}
