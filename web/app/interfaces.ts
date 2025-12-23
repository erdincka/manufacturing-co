export interface ConnectionProfile {
    id?: string;
    name: string;
    cluster_host: string;
    username?: string;
    password?: string;
    created_at?: string;
    updated_at?: string;
    polaris_credentials?: string;
}

export interface ConnectionTestResult {
    status: string;
    message: string;
    details?: any;
}

export interface ServiceDetail {
    port: number;
    description: string;
    protocol: string;
    tcp_available: boolean;
    https_available: boolean;
    auth_status: 'success' | 'unauthorized' | 'not_required' | 'unknown' | null;
    error?: string;
    status_code?: number;
}

export interface ServiceStatus {
    service_name: string;
    status: 'available' | 'missing' | 'misconfigured';
    message: string;
    required: boolean;
    fix_guidance?: string;
}

export interface ReadinessScore {
    score: number;
    total_required: number;
    available_required: number;
    services: ServiceStatus[];
}

// Medallion Readiness
export interface LayerReadiness {
    status: 'ready' | 'missing';
    details: {
        bucket?: boolean;
        topic?: boolean;
        table?: boolean;
    };
}

export interface DashboardData {
    configured: boolean;
    topics: any[];
    tables: any[];
    buckets: any[];
    readiness?: {
        bronze: LayerReadiness;
        silver: LayerReadiness;
        gold: LayerReadiness;
    };
    error?: string;
}

export interface BootstrapResult {
    status: string;
    topics: any[];
    tables: any[];
    logs: string[];
}

export interface BootstrapStatus {
    bootstrapped: boolean;
    topics_created?: number;
    tables_created?: number;
    bootstrapped_at?: string;
}

export interface DemoLog {
    id: string;
    profile_id: string;
    log_type: string;
    message: string;
    timestamp: string;
}

export interface ScenarioRequest {
    profile_id: string;
    scenario_type: 'iot_streaming' | 'process_data' | 'curate_data';
}

export interface ScenarioResult {
    status: string;
    message: string;
    logs: string[];
    data_generated?: any;
}
