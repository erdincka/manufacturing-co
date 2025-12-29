import logging
import time
import random
from datetime import datetime, timezone
from typing import Dict, List
from uuid import uuid4
from connector import DataFabricConnector
from utils import validate_message

logger = logging.getLogger("scenario_runner.iot_streaming")


def iot_streaming_scenario(
    connector: DataFabricConnector,
    logs: List,
):
    """
    Run demo scenario iot_streaming

    """
    topic_name = "manufacturing.telemetry.raw"
    count = 100
    logs.append(f"Ingesting {count} telemetry events to topic '{topic_name}'...")

    try:
        # Devices list
        devices = ["CNC-001", "CNC-002", "ROBOT-A", "ROBOT-B", "PRESS-04"]
        messages_to_publish = []
        for i in range(count):
            payload = {
                "event_id": str(uuid4()),
                "device_id": random.choice(devices),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "temperature": random.uniform(60, 95),
                "vibration": random.uniform(0.1, 5.0),
                "status": random.choice(
                    ["OK", "OK", "OK", "OK", "OK", "OK", "WARNING"]
                ),
            }
            messages_to_publish.append(payload)
        if connector.kafka.push_messages(topic_name, messages_to_publish):
            logs.append(f"✓ {count} events successfully published to Kafka")
            yield {"events_ingested": count, "target": topic_name}
        else:
            logs.append(f"✕ Failed to publish messages to {topic_name}")
            yield {"error": "Publish failed for the simulated IoT events"}
    except Exception as e:
        logger.error(f"Error during Kafka ingestion simulation: {e}")
        logs.append(f"✕ Failed to ingest data: {str(e)}")
        yield {"error": str(e)}

    logs.append("Reading batch from 'manufacturing.telemetry.raw'...")

    # Read messages from all partitions
    consumed_messages = []
    try:
        topic_name = "manufacturing.telemetry.raw"
        consumed_messages = connector.kafka.consume_messages(
            topic_name,
            group_id="manufacturing-consumer-group",
            commit_async=False,
        )
        logs.append(f"✓ Retrieved {len(consumed_messages)} events from {topic_name}")

    except Exception as e:
        logger.error(f"Error resetting offsets during process_data: {e}")
        logs.append(f"✕ Metadata update failed: {str(e)}")

    cleansed_records = []
    invalid_message_count = 0
    # Skip the rest if no messages retrieved
    if len(consumed_messages):
        logs.append("Applying schema validation and data cleansing...")
        invalid_message_count = 0
        for idx, message in enumerate(
            [record["value"] for record in consumed_messages]
        ):
            if validate_message(idx, message):
                cleansed_records.append(message)
            else:
                logs.append(f"Discarding invalid record {idx}: {message}")
                invalid_message_count += 1

        logs.append(
            f"Writing {len(cleansed_records)} cleansed records to 'silver-bucket.telemetry.cleansed' and discarding {invalid_message_count} invalid record(s)..."
        )

        connector.iceberg.append_data(
            "silver-bucket.telemetry.cleansed", cleansed_records
        )
        logs.append("✓ Committed transaction to Iceberg table")

    yield {
        "records_processed": len(cleansed_records),
        "invalidated_count": invalid_message_count,
        "target": "silver-bucket.telemetry.cleansed",
    }

    logs.append("Querying 'silver-bucket.telemetry.cleansed' for KPI calculation...")

    # Actual KPI calculation from cleansed records
    if cleansed_records:
        logs.append("Calculating hourly aggregates (Avg Temp, Vibration anomalies)...")

        total_events = len(cleansed_records)
        avg_temp = sum(r["temperature"] for r in cleansed_records) / total_events
        anomaly_count = sum(1 for r in cleansed_records if r["status"] == "WARNING")

        # Determine time window
        timestamps = [datetime.fromisoformat(r["timestamp"]) for r in cleansed_records]
        window_start = min(timestamps).isoformat()
        window_end = max(timestamps).isoformat()

        kpi_records = [
            {
                "window_start": window_start,
                "window_end": window_end,
                "total_events": total_events,
                "avg_temp": round(avg_temp, 2),
                "anomaly_count": anomaly_count,
            }
        ]

        logs.append(
            f"Updating 'gold-bucket.manufacturing.kpis' table with results: Avg Temp={round(avg_temp, 2)}, Anomaly Count={anomaly_count}..."
        )
        connector.iceberg.append_data("gold-bucket.manufacturing.kpis", kpi_records)
        logs.append("✓ KPI dashboard view refreshed")
        yield {"kpis_generated": 1, "target": "gold-bucket.manufacturing.kpis"}
    else:
        logs.append("No cleansed records available to calculate KPIs.")
