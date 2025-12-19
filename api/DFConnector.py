import logging
import json
from typing import List, Optional, Dict, Any
from datetime import datetime

from models import (
    ConnectionProfile,
    ConnectionTestResult,
    ServiceStatus,
    BootstrapResult,
    ScenarioRequest,
    ScenarioResult
)
from services.base import DATAFABRIC_SERVICES, BaseDataFabricService
from services.volume import VolumeService
from services.kafka import KafkaService
from services.s3 import S3Service
from services.iceberg import IcebergService

logger = logging.getLogger("api.connector")

class DataFabricConnector:
    """SDK façade for HPE Data Fabric services."""

    def __init__(self, profile: Dict[str, Any]):
        self.profile = profile
        self.base = BaseDataFabricService(profile)
        self.volume = VolumeService(profile)
        self.kafka = KafkaService(profile)
        self.s3 = S3Service(profile)
        self.iceberg = IcebergService(profile)

    def test_connection(self) -> Dict[str, Any]:
        """Test basic connectivity to Data Fabric REST API."""
        result = self.base._test_port_service(8443, "REST API")
        
        if result["auth_status"] == "success":
            status = "success"
            message = "Connected to Data Fabric REST API"
        elif result["auth_status"] == "unauthorized":
            status = "auth_failed"
            message = "Authentication failed"
        else:
            status = "error"
            message = "Endpoint unreachable"

        return {
            "status": status,
            "message": message,
            "cluster_info": {"host": self.base.cluster_host, "port": 8443},
            "service": result
        }

    def discover_all_services(self) -> Dict[str, Any]:
        """Discover and test all Data Fabric services."""
        services = []
        for svc_info in DATAFABRIC_SERVICES:
            desc = svc_info["description"]
            if desc == "Object Store":
                svc_res = self.s3.test_s3()
            else:
                svc_res = self.base._test_port_service(svc_info["port"], desc)
            
            # Map test result to common format
            services.append({
                "port": svc_info["port"],
                "description": desc,
                "protocol": svc_info["protocol"],
                "tcp_available": svc_res.get("tcp_available", True if svc_res.get("status") == "success" else False),
                "https_available": svc_res.get("https_available", True if svc_res.get("status") == "success" else False),
                "auth_status": svc_res.get("auth_status", "success" if svc_res.get("status") == "success" else "unknown"),
                "error": svc_res.get("message") if svc_res.get("status") != "success" else None
            })

        auth_count = sum(1 for s in services if s["auth_status"] == "success")
        return {
            "status": "success" if auth_count > 0 else "partial",
            "message": f"Tested {len(services)} services, {auth_count} authenticated",
            "cluster_info": {"host": self.base.cluster_host},
            "services": services
        }

    # Delegation to specialized services
    def list_volumes(self): return self.volume.list_volumes()
    def create_volume(self, *args, **kwargs): return self.volume.create_volume(*args, **kwargs)
    
    def test_kafka(self): return self.kafka.test_kafka()
    def list_topics(self): return self.kafka.list_topics()
    def create_topic(self, *args, **kwargs): return self.kafka.create_topic(*args, **kwargs)
    
    def list_buckets(self): return self.s3.list_buckets()
    def test_s3(self): return self.s3.test_s3()
    def generate_s3_credentials(self): return self.s3.generate_s3_credentials()
    def create_bucket(self, *args, **kwargs): return self.s3.create_bucket(*args, **kwargs)
    
    def test_iceberg(self): return self.iceberg.test_iceberg()
    def list_iceberg_tables(self): return self.iceberg.list_iceberg_tables()
    def create_iceberg_table(self, *args, **kwargs): return self.iceberg.create_iceberg_table(*args, **kwargs)
