import logging
from typing import List, Dict, Any, Optional
from services.base import BaseDataFabricService

logger = logging.getLogger("api.services.volume")

class VolumeService(BaseDataFabricService):
    def list_volumes(self) -> List[Dict[str, Any]]:
        try:
            rest_url = f"{self._get_base_url()}/rest/volume/list?limit=5000"
            response = self.session.get(rest_url, timeout=self.timeout, verify=False)

            if response.status_code == 200:
                data = response.json()
                volumes = []
                for item in data.get("data", []):
                    if not item.get("isInternal"):
                        name = item.get("volumename", "")
                        mountdir = item.get("mountdir", "")
                        volumes.append({
                            "name": name,
                            "path": mountdir or f"/{name}",
                            "size_gb": float(item.get("quota", 0)) / 1024 if item.get("quota") else 0,
                            "used_gb": float(item.get("used", 0)) / (1024**3),
                        })
                return volumes
            return []
        except Exception as e:
            logger.error(f"Error listing volumes: {e}")
            return []

    def create_volume(self, name: str, path: str, replication: int = 3, quota_gb: int = 100) -> Dict[str, Any]:
        logger.info(f"Creating volume: {name} at {path}")
        try:
            rest_url = (
                f"{self._get_base_url()}/rest/volume/create?name={name}&path={path}"
                f"&minreplication=1&nsminreplication=1&nsreplication={replication}"
                f"&replication={replication}&advisoryquota={quota_gb}G"
            )
            response = self.session.post(rest_url, timeout=self.timeout, verify=False)
            
            if response.status_code in [200, 201]:
                resp_json = response.json()
                if resp_json.get("status") == "ERROR":
                    error_msg = resp_json.get("errors", [{}])[0].get("desc", "Unknown error")
                    if "already in use" in error_msg.lower():
                        logger.info(f"Volume {name} already in use, skipping creation.")
                        return {
                            "status": "success", "outcome": "skipped", "message": f"Volume {name} exists",
                            "volume": {"name": name, "path": path}
                        }
                    return {
                        "status": "error", "outcome": "failed", "message": f"Failed: {error_msg}",
                        "volume": {"name": name, "path": path}
                    }
                return {
                    "status": "success", "outcome": "created", "message": f"Volume {name} created",
                    "volume": {"name": name, "path": path, "replication": replication, "quota_gb": quota_gb}
                }
            elif response.status_code == 400 and "FileAlreadyExistsException" in response.text:
                return {
                    "status": "success", "outcome": "skipped", "message": f"Volume {name} exists",
                    "volume": {"name": name, "path": path}
                }
            return {
                "status": "error", "outcome": "failed", "message": f"HTTP {response.status_code}",
                "volume": {"name": name, "path": path}
            }
        except Exception as e:
            logger.error(f"Error creating volume: {e}")
            return {"status": "error", "message": str(e), "volume": {"name": name, "path": path}}
