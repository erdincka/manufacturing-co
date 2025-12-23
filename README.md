# HPE Data Fabric Manufacturing Demo

This demo showcases a modern **Medallion Architecture** (Bronze, Silver, Gold layers) for manufacturing telemetry data, powered by **HPE Data Fabric**.

## Overview

The application simulates IoT telemetry from a manufacturing floor, processing it through various stages of refinement using HPE Data Fabric's unified data services:

1.  **Bronze (Raw)**: IoT telemetry ingested into **HPE Data Fabric Event Data Streams** (Kafka-compatible).
2.  **Silver (Processed)**: Cleansed and validated data stored in **Apache Iceberg** tables on **HPE Data Fabric Object Store**.
3.  **Gold (Curated)**: Aggregated KPIs (Key Performance Indicators) for business dashboards, also stored in Iceberg tables.

## Key Features & HPE Data Fabric Capabilities

### 1. Unified Data Services
This demo utilizes four core services of HPE Data Fabric seamlessly:
-   **Volumes**: POSIX-compliant storage for system data and database state.
-   **Event Data Streams (Streams)**: Distributed, durable messaging for real-time telemetry ingestion.
-   **Object Store (S3)**: S3-compatible object storage used as the underlying storage for Apache Iceberg tables.
-   **Iceberg Native Support**: High-performance open table format management via PyIceberg, storing data directly on the Data Fabric Object Store.

### 2. Medallion Architecture Flow
-   **Ingestion (Bronze)**: Simulates hardware sensors (CNC machines, robots) sending temperature and vibration data to a Kafka topic.
-   **Processing (Silver)**: A processing job consumes raw events from the stream, applies schema validation, and commits the data to an Iceberg table.
-   **Curation (Gold)**: Aggregates silver-layer data into hourly windowed KPIs like average temperature and anomaly counts.

### 3. Security & Connectivity
-   **Automated Credential Management**: Demonstrates automatic generation and rotation of temporary S3 credentials via the Data Fabric REST API.
-   **Self-Healing Connections**: The API monitors service availability and handles transient connectivity issues with intelligent retries.

## Getting Started

### Prerequisites
-   A running HPE Data Fabric cluster.
-   Access to the cluster REST API (port 8443) and Kafka/S3 ports.

### Running the Demo
1.  **Configure**: Enter your Cluster Host and Credentials on the Settings page.
2.  **Bootstrap**: Use the "Bootstrap Demo" button to automatically create all necessary Data Fabric resources (Volumes, Topics, Buckets, Tables).
3.  **Simulate**:
    -   Run **Simulate Ingestion** to generate raw events.
    -   Run **Process Data** to move data from Bronze to Silver.
    -   Run **Curate Data** to generate Gold-layer KPIs.
4.  **Explore**: Use the dashboard to browse files in volumes, messages in Kafka topics, and data in Iceberg tables.

---

## Technical Architecture

-   **Frontend**: Next.js (React) with a premium, responsive dashboard UI.
-   **Backend**: FastAPI (Python) implementing the Data Fabric SDK logic.
-   **Storage**: SQLite for local demo state, HPE Data Fabric for mission-critical data.
