import logging
import os
import random
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import uuid4

import mysql.connector
import requests
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from mysql.connector import Error
from pydantic import BaseModel

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api")

class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("GET /health") == -1

logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

app = FastAPI(title="Manufacturing Co API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Configuration ---
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "mysql"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "db_user"),
    "password": os.getenv("DB_PASSWORD", "Admin123."),
    "database": os.getenv("DB_NAME", "db"),
}

def get_db_connection():
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        return connection
    except Error as e:
        logger.error(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")

# --- Models ---

class Machine(BaseModel):
    id: Optional[str] = None
    name: str
    type: str
    status: str  # running, idle, maintenance, error
    health_score: int
    temperature: float
    vibration: float
    last_maintenance: datetime

class Product(BaseModel):
    id: Optional[str] = None
    name: str
    sku: str
    category: str
    unit_price: float

class InventoryItem(BaseModel):
    id: Optional[str] = None
    product_id: str
    quantity: int
    warehouse_location: str
    last_updated: datetime

class ProductionLog(BaseModel):
    id: Optional[str] = None
    machine_id: str
    product_id: str
    quantity_produced: int
    defects_count: int
    timestamp: datetime

class SettingsUpdate(BaseModel):
    llm_endpoint: Optional[str] = None
    llm_api_key: Optional[str] = None
    remote_db_url: Optional[str] = None

class TestConnectionRequest(BaseModel):
    connection_string: str

class TestLLMRequest(BaseModel):
    endpoint: str
    api_key: str

# --- Database Initialization & Seeding ---

def init_db():
    """Initialize database tables and seed data if empty."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create Tables
    tables = [
        """
        CREATE TABLE IF NOT EXISTS machines (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            type VARCHAR(100),
            status VARCHAR(50),
            health_score INT,
            temperature FLOAT,
            vibration FLOAT,
            last_maintenance DATETIME
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS products (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            sku VARCHAR(100) UNIQUE,
            category VARCHAR(100),
            unit_price FLOAT
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS inventory (
            id VARCHAR(36) PRIMARY KEY,
            product_id VARCHAR(36),
            quantity INT,
            warehouse_location VARCHAR(100),
            last_updated DATETIME,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS production_logs (
            id VARCHAR(36) PRIMARY KEY,
            machine_id VARCHAR(36),
            product_id VARCHAR(36),
            quantity_produced INT,
            defects_count INT,
            timestamp DATETIME,
            FOREIGN KEY (machine_id) REFERENCES machines(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS system_settings (
            setting_key VARCHAR(50) PRIMARY KEY,
            setting_value TEXT
        )
        """
    ]
    
    try:
        for table_sql in tables:
            cursor.execute(table_sql)
        conn.commit()
        logger.info("Tables initialized.")
        
        # Check if we need to seed
        cursor.execute("SELECT COUNT(*) FROM machines")
        if cursor.fetchone()[0] == 0:
            seed_data(cursor)
            conn.commit()
            logger.info("Database seeded with sample data.")
            
    except Error as e:
        logger.error(f"Error initializing DB: {e}")
    finally:
        cursor.close()
        conn.close()

def seed_data(cursor):
    # Seed Machines
    machines = [
        ("Robotic Arm A1", "Assembly Robot", "running", 98, 45.5, 0.02),
        ("CNC Miller X200", "CNC", "running", 92, 62.1, 0.15),
        ("Conveyor Belt Main", "Logistics", "idle", 100, 25.0, 0.01),
        ("Paint Sprayer B2", "Finishing", "maintenance", 75, 22.0, 0.00),
        ("Welding Station C1", "Assembly", "running", 88, 180.5, 0.05),
        ("Packaging Unit P4", "Packaging", "error", 45, 55.0, 0.80),
    ]
    
    machine_ids = []
    for m in machines:
        m_id = str(uuid4())
        machine_ids.append(m_id)
        cursor.execute(
            "INSERT INTO machines (id, name, type, status, health_score, temperature, vibration, last_maintenance) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            (m_id, m[0], m[1], m[2], m[3], m[4], m[5], datetime.now() - timedelta(days=random.randint(1, 30)))
        )

    # Seed Products
    products = [
        ("Auto Chassis Type-A", "CHS-001", "Metal Parts", 450.00),
        ("Engine Block V6", "ENG-V6", "Engine", 1200.00),
        ("Transmission Box", "TRN-200", "Drivetrain", 800.00),
        ("Brake Caliper", "BRK-055", "Brakes", 150.00),
        ("Dashboard Panel", "INT-PNL", "Interior", 200.00),
    ]
    
    product_ids = []
    for p in products:
        p_id = str(uuid4())
        product_ids.append(p_id)
        cursor.execute(
            "INSERT INTO products (id, name, sku, category, unit_price) VALUES (%s, %s, %s, %s, %s)",
            (p_id, p[0], p[1], p[2], p[3])
        )

    # Seed Inventory
    for p_id in product_ids:
        cursor.execute(
            "INSERT INTO inventory (id, product_id, quantity, warehouse_location, last_updated) VALUES (%s, %s, %s, %s, %s)",
            (str(uuid4()), p_id, random.randint(50, 500), f"Zone-{random.choice(['A','B','C'])}-{random.randint(1,20)}", datetime.now())
        )

    # Seed Production Logs
    for _ in range(50):
        cursor.execute(
            "INSERT INTO production_logs (id, machine_id, product_id, quantity_produced, defects_count, timestamp) VALUES (%s, %s, %s, %s, %s, %s)",
            (str(uuid4()), random.choice(machine_ids), random.choice(product_ids), random.randint(10, 100), random.randint(0, 5), datetime.now() - timedelta(hours=random.randint(1, 48)))
        )

@app.on_event("startup")
async def startup_event():
    # Re-apply the log filter
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())
    # Initialize DB
    init_db()

# --- Endpoints ---

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/machines", response_model=List[Machine])
def get_machines():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM machines")
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@app.get("/products", response_model=List[Product])
def get_products():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM products")
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@app.get("/inventory", response_model=List[dict])
def get_inventory():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT i.*, p.name as product_name, p.sku 
            FROM inventory i 
            JOIN products p ON i.product_id = p.id
        """
        cursor.execute(query)
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@app.get("/production/recent", response_model=List[dict])
def get_recent_production():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT pl.*, m.name as machine_name, p.name as product_name 
            FROM production_logs pl
            JOIN machines m ON pl.machine_id = m.id
            JOIN products p ON pl.product_id = p.id
            ORDER BY pl.timestamp DESC
            LIMIT 20
        """
        cursor.execute(query)
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@app.get("/dashboard/stats")
def get_dashboard_stats():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        stats = {}
        
        # Machine Status Counts
        cursor.execute("SELECT status, COUNT(*) as count FROM machines GROUP BY status")
        stats['machine_status'] = cursor.fetchall()
        
        # Total Production (Last 24h)
        cursor.execute("""
            SELECT SUM(quantity_produced) as total_produced, SUM(defects_count) as total_defects 
            FROM production_logs 
            WHERE timestamp > NOW() - INTERVAL 24 HOUR
        """)
        prod_stats = cursor.fetchone()
        stats['production_24h'] = prod_stats
        
        # Low Stock Items
        cursor.execute("""
            SELECT COUNT(*) as count FROM inventory WHERE quantity < 100
        """)
        stats['low_stock_count'] = cursor.fetchone()['count']
        
        return stats
    finally:
        cursor.close()
        conn.close()

# --- Settings & Integration Endpoints ---

@app.get("/settings")
def get_settings():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM system_settings")
        rows = cursor.fetchall()
        settings = {row['setting_key']: row['setting_value'] for row in rows}
        
        # Mask API Key for security
        if 'llm_api_key' in settings and settings['llm_api_key']:
            settings['llm_api_key'] = '********' + settings['llm_api_key'][-4:] if len(settings['llm_api_key']) > 4 else '********'
            
        return settings
    finally:
        cursor.close()
        conn.close()

@app.put("/settings")
def update_settings(settings: SettingsUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        data = settings.dict(exclude_unset=True)
        for key, value in data.items():
            if value is not None:
                # Upsert
                cursor.execute(
                    "INSERT INTO system_settings (setting_key, setting_value) VALUES (%s, %s) ON DUPLICATE KEY UPDATE setting_value = %s",
                    (key, value, value)
                )
        conn.commit()
        return {"status": "updated"}
    except Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@app.post("/test/db")
def test_db_connection(req: TestConnectionRequest):
    # Basic validation for MySQL connection strings for this demo
    # Format expected: mysql://user:pass@host:port/db
    # We will try to parse and connect using mysql.connector for validation
    try:
        # Very naive parsing for demo purposes. 
        # In production, use sqlalchemy.engine.make_url or similar.
        if not req.connection_string.startswith("mysql://"):
             raise HTTPException(status_code=400, detail="Only mysql:// schemes supported for this demo")
        
        # Strip scheme
        clean = req.connection_string.replace("mysql://", "")
        if "@" not in clean:
             raise HTTPException(status_code=400, detail="Invalid format")
        
        creds, location = clean.split("@")
        user_pass = creds.split(":")
        host_db = location.split("/")
        
        if len(user_pass) != 2 or len(host_db) != 2:
             raise HTTPException(status_code=400, detail="Invalid format")
             
        user, password = user_pass
        host_port = host_db[0].split(":")
        host = host_port[0]
        port = int(host_port[1]) if len(host_port) > 1 else 3306
        database = host_db[1]

        logger.debug(f"Testing DB connection: {host}:{port}/{database}")
        # Attempt connection
        test_conn = mysql.connector.connect(
            host=host,
            user=user,
            password=password,
            database=database,
            port=port,
            connection_timeout=5
        )
        test_conn.close()
        return {"status": "success", "message": "Connection successful"}
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")

@app.post("/test/llm")
def test_llm_connection(req: TestLLMRequest):
    try:
        # Simple ping to the endpoint. 
        # Assuming OpenAI-compatible format or just a health check if it's a generic URL.
        # For this demo, we'll just check if it's reachable.
        
        headers = {"Authorization": f"Bearer {req.api_key}", "Content-Type": "application/json"}
        logger.debug(headers)
        # Try to get model list if it looks like OpenAI compatible
        if "/v1" in req.endpoint:
            logger.debug(f"Testing LLM endpoint: {req.endpoint}/models")
            response = requests.get(f"{req.endpoint}/models", headers=headers, timeout=5)
        else:
            logger.debug(f"Testing LLM endpoint: {req.endpoint}")
            # Generic GET/POST check
            response = requests.get(req.endpoint, headers=headers, timeout=5)
            
        if response.status_code >= 400:
             raise HTTPException(status_code=400, detail=f"API returned {response.status_code}: {response.text}")
             
        return {"status": "success", "message": "Endpoint reachable"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")
