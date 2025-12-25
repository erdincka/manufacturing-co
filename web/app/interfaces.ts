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
    details?: unknown;
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

export interface Topic {
    name: string;
    partitions: number;
    replication?: number;
}

export interface Table {
    name: string;
    namespace: string;
    schema?: string;
}

export interface Bucket {
    name: string;
}

export interface DashboardData {
    configured: boolean;
    topics: Topic[];
    tables: Table[];
    buckets: Bucket[];
    readiness?: {
        bronze: LayerReadiness;
        silver: LayerReadiness;
        gold: LayerReadiness;
    };
    error?: string;
}

export interface BootstrapResult {
    status: string;
    topics: Topic[];
    tables: Table[];
    logs: string[];
}

export interface BootstrapStatus {
    bootstrapped: boolean;
    topics_created?: number;
    tables_created?: number;
    bootstrapped_at?: string;
}

export interface ScenarioRequest {
    profile_id: string;
    scenario_type: 'iot_streaming' | 'process_data' | 'curate_data';
}

export interface ScenarioResult {
    status: string;
    message: string;
    logs: string[];
    data_generated?: unknown;
    invalidated_count?: number;
}

export interface DetailedTopicMetrics {
    topic: string;
    total_messages: number;
    in_queue: number;
    processed: number;
    invalidated_count?: number;
    latest_message_timestamp?: string;
    last_processed_timestamp?: string;
    lag_seconds: number;
    processing_rate: number;
    queue_depth_percent: number;
    [key: string]: string | number | undefined; // Allow dynamic access for the loop in LayerPanels
}

export interface TelemetryRecord {
    device_id: string;
    temperature: number;
    timestamp: string;
    [key: string]: string | number | boolean | null | undefined;
}

export interface KpiRecord {
    total_events: number;
    avg_temp: number;
    anomaly_count: number;
    window_start?: string;
    window_end?: string;
}

export interface BucketObject {
    key: string;
    size: number;
    last_modified: string;
}

export interface BucketDetails {
    object_count: number;
    total_size: number;
    objects: BucketObject[];
}

export interface TopicDetails {
    messages_count: number;
    in_queue: number;
    partitions: number;
    consumers: number;
    delay_seconds: number;
    recent_message: string | object | null;
}

export interface TableDetails {
    metrics: {
        record_count: number;
        snapshot_count: number;
        last_updated: string;
    };
    data: Record<string, string | number | boolean | null | undefined>[];
}
