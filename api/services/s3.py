import logging
import json
import time
import sqlite3
from typing import Dict, Any, List, Optional
from services.base import BaseDataFabricService, DB_PATH

logger = logging.getLogger("api.services.s3")

try:
    import boto3
    from botocore.exceptions import ClientError
    from botocore.config import Config
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False

class S3Service(BaseDataFabricService):
    def __init__(self, profile: Dict[str, Any]):
        super().__init__(profile)
        self.s3_access_key = None
        self.s3_secret_key = None
        self._parse_credentials()

    def _parse_credentials(self):
        creds_data = self.profile.get("s3_credentials")
        if creds_data:
            try:
                if isinstance(creds_data, str):
                    creds_data = json.loads(creds_data)
                self.s3_access_key = creds_data.get("accessKey")
                self.s3_secret_key = creds_data.get("secretKey")
            except Exception as e:
                logger.warning(f"Failed to parse s3_credentials: {e}")

    def generate_s3_credentials(self) -> Dict[str, Any]:
        url = f"{self._get_base_url()}/rest/s3keys/gentempkey?cluster={self.cluster_host}&domainname=primary&accountname=default&username=mapr&duration=900"
        try:
            response = self.session.get(url, timeout=self.timeout, verify=False)
            if response.status_code == 200:
                return response.json()
            return {"status": "error", "message": f"HTTP {response.status_code}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def refresh_credentials(self):
        try:
            response = self.generate_s3_credentials()
            if response.get("status") == "OK" and response.get("data"):
                data = response.get("data")[0]
                new_creds = {
                    "accessKey": data.get("accesskey"),
                    "secretKey": data.get("secretkey"),
                    "expiryTime": data.get("expiryTime")
                }
                creds_json = json.dumps(new_creds)
                self.s3_access_key = new_creds["accessKey"]
                self.s3_secret_key = new_creds["secretKey"]
                self.profile["s3_credentials"] = creds_json
                
                # Persist to DB (User requested to keep this logic for demos)
                conn = sqlite3.connect(str(DB_PATH))
                conn.execute("UPDATE connection_profile SET s3_credentials = ? WHERE id = 'default'", (creds_json,))
                conn.commit()
                conn.close()
        except Exception as e:
            logger.error(f"Error refreshing S3 credentials: {e}")

    def ensure_valid_credentials(self):
        creds_str = self.profile.get("s3_credentials")
        if not creds_str:
            self.refresh_credentials()
            return

        try:
            creds = json.loads(creds_str) if isinstance(creds_str, str) else creds_str
            expiry = creds.get("expiryTime")
            if expiry and expiry < (int(time.time() * 1000) + 120000):
                self.refresh_credentials()
        except:
            self.refresh_credentials()

    def list_buckets(self) -> List[Dict[str, Any]]:
        self.ensure_valid_credentials()
        if not BOTO3_AVAILABLE: return []
        try:
            s3 = boto3.client("s3", endpoint_url=f"https://{self.cluster_host}:9000",
                             aws_access_key_id=self.s3_access_key or self.username,
                             aws_secret_access_key=self.s3_secret_key or self.password,
                             verify=False, config=Config(signature_version="s3v4"))
            response = s3.list_buckets()
            return [{"name": b["Name"]} for b in response.get("Buckets", [])]
        except Exception as e:
            logger.error(f"Error listing buckets: {e}")
            return []

    def create_bucket(self, bucket_name: str) -> Dict[str, Any]:
        self.ensure_valid_credentials()
        if not BOTO3_AVAILABLE: return {"status": "error", "message": "boto3 not available"}
        try:
            s3 = boto3.client("s3", endpoint_url=f"https://{self.cluster_host}:9000",
                             aws_access_key_id=self.s3_access_key or self.username,
                             aws_secret_access_key=self.s3_secret_key or self.password,
                             verify=False, config=Config(signature_version="s3v4"))
            
            # Idempotent check
            existing = [b["Name"] for b in s3.list_buckets().get("Buckets", [])]
            if bucket_name in existing:
                return {"status": "success", "outcome": "skipped", "message": f"Bucket {bucket_name} exists"}

            s3.create_bucket(Bucket=bucket_name)
            return {"status": "success", "outcome": "created", "message": f"Bucket {bucket_name} created"}
        except Exception as e:
            logger.error(f"Error creating bucket: {e}")
            return {"status": "error", "message": str(e)}

    def test_s3(self) -> Dict[str, Any]:
        self.ensure_valid_credentials()
        if not BOTO3_AVAILABLE: return {"status": "error", "message": "boto3 not available"}
        try:
            s3 = boto3.client("s3", endpoint_url=f"https://{self.cluster_host}:9000",
                             aws_access_key_id=self.s3_access_key or self.username,
                             aws_secret_access_key=self.s3_secret_key or self.password,
                             verify=False, config=Config(signature_version="s3v4", connect_timeout=5))
            s3.list_buckets()
            return {"status": "success", "message": "S3 API accessible"}
        except Exception as e:
            return {"status": "auth_failed" if "403" in str(e) else "error", "message": f"S3 error: {str(e)}"}
