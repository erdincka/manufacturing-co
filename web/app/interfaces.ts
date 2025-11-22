export interface Machine {
    id: string;
    name: string;
    type: string;
    status: 'running' | 'idle' | 'maintenance' | 'error';
    health_score: number;
    temperature: number;
    vibration: number;
    last_maintenance: string;
}



export interface InventoryItem {
    id: string;
    product_id: string;
    quantity: number;
    warehouse_location: string;
    last_updated: string;
    product_name?: string;
    sku?: string;
}

export interface ProductionLog {
    id: string;
    machine_id: string;
    product_id: string;
    quantity_produced: number;
    defects_count: number;
    timestamp: string;
    machine_name?: string;
    product_name?: string;
}

export interface DashboardStats {
    machine_status: { status: string; count: number }[];
    production_24h: { total_produced: number; total_defects: number };
    low_stock_count: number;
}