import logging
from pathlib import Path
import os
import sqlite3

logger = logging.getLogger("backend")

# --- Database Configuration (SQLite for demo config) ---
# Use /app/data in container, ./data locally
DB_DIR = Path(os.getenv("DB_DIR", "/app/data"))
try:
    DB_DIR.mkdir(parents=True, exist_ok=True)
except Exception as e:
    logger.warning(f"Could not create DB_DIR {DB_DIR}: {e}")

DB_PATH = DB_DIR / "demo_config.db"


def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize SQLite database for single connection profile and demo state."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Single connection profile table (using fixed ID)
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS connection_profile (
            id TEXT PRIMARY KEY DEFAULT 'default',
            name TEXT NOT NULL DEFAULT 'Data Fabric Connection',
            cluster_host TEXT,
            username TEXT,
            password TEXT,
            created_at TEXT,
            updated_at TEXT,
            configured BOOLEAN DEFAULT 0,
            s3_credentials TEXT
        )
    """
    )

    # Service status cache
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS service_status (
            service_name TEXT PRIMARY KEY,
            status TEXT,
            message TEXT,
            checked_at TEXT
        )
    """
    )

    # Bootstrap state
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS bootstrap_state (
            id TEXT PRIMARY KEY DEFAULT 'default',
            topics_created INTEGER DEFAULT 0,
            tables_created INTEGER DEFAULT 0,
            bootstrapped_at TEXT
        )
    """
    )

    conn.commit()
    conn.close()
    logger.info("Database initialized.")
