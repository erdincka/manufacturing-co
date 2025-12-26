import logging
import socket
import requests
from requests.auth import HTTPBasicAuth
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Optional, Dict, Any

logger = logging.getLogger("backend.services.base")

DATAFABRIC_SERVICES = [
    {"port": 8443, "description": "REST API", "protocol": "https"},
    {"port": 8080, "description": "HBase REST", "protocol": "https"},
    {"port": 9000, "description": "Object Store", "protocol": "https"},
    {"port": 8243, "description": "Database JSON REST API", "protocol": "https"},
    {"port": 8082, "description": "Kafka REST API", "protocol": "https"},
]


class BaseDataFabricService:
    def __init__(self, profile: Dict[str, Any]):
        self.profile = profile
        self.cluster_host = profile.get("cluster_host")
        self.username = profile.get("username")
        self.password = profile.get("password")
        self.timeout = 10

        # Setup requests session
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=0.3,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)

        if self.username and self.password:
            self.session.auth = HTTPBasicAuth(self.username, self.password)

    def _get_base_url(self, protocol: str = "https", port: Optional[int] = None) -> str:
        if port is None:
            port = 8443
        return f"{protocol}://{self.cluster_host}:{port}"

    def _test_port_service(self, port: int, description: str) -> Dict[str, Any]:
        service_result = {
            "port": port,
            "description": description,
            "tcp_available": False,
            "https_available": False,
            "auth_status": None,
            "status_code": None,
            "error": None,
        }

        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            result = sock.connect_ex((self.cluster_host, port))
            sock.close()
            if result == 0:
                service_result["tcp_available"] = True
            else:
                service_result["error"] = "TCP connection refused"
                return service_result
        except Exception as e:
            service_result["error"] = f"TCP error: {str(e)}"
            return service_result

        url = f"https://{self.cluster_host}:{port}/"
        try:
            auth = (
                HTTPBasicAuth(self.username, self.password)
                if self.username and self.password
                else None
            )
            response = self.session.get(
                url, auth=auth, timeout=self.timeout, verify=False
            )
            service_result["status_code"] = response.status_code
            service_result["https_available"] = True

            if response.status_code == 200:
                service_result["auth_status"] = "success"
            elif response.status_code in [401, 403]:
                service_result["auth_status"] = "unauthorized"
            else:
                service_result["auth_status"] = "not_required"
        except Exception as e:
            service_result["error"] = f"HTTPS test error: {str(e)}"
            service_result["https_available"] = True  # Port was open

        return service_result
