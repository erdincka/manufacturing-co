from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class ConnectionProfile(BaseModel):
    id: Optional[str] = None
    name: str
    cluster_host: str
    username: Optional[str] = None
    password: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    s3_credentials: Optional[str] = None
    polaris_credentials: Optional[str] = None

class ConnectionTestResult(BaseModel):
    status: str  # success, error, auth_failed, tls_error
    message: str
    details: Optional[Dict[str, Any]] = None

class ServiceStatus(BaseModel):
    service_name: str
    status: str  # available, missing, misconfigured
    message: str
    required: bool
    fix_guidance: Optional[str] = None

class BootstrapRequest(BaseModel):
    profile_id: str

class BootstrapResult(BaseModel):
    status: str
    volumes: List[Dict[str, Any]]
    topics: List[Dict[str, Any]]
    tables: List[Dict[str, Any]]
    logs: List[str]

class ScenarioRequest(BaseModel):
    scenario_type: str  # simulate_ingestion, process_data, curate_data

class ScenarioResult(BaseModel):
    status: str
    message: str
    logs: List[str]
    data_generated: Optional[Dict[str, Any]] = None
