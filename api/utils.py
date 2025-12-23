from datetime import datetime
import logging

logger = logging.getLogger("utils")

REQUIRED_KEYS = [
    "event_id",
    "device_id",
    "timestamp",
    "temperature",
    "vibration",
    "status",
]


def validate_message(idx: int, message: dict) -> bool:
    valid = True
    # 1. Check all required keys exist
    missing = [k for k in REQUIRED_KEYS if k not in message]
    if missing:
        valid = False
        logger.warning(
            f"Message[{idx}] missing keys: {missing}; got keys={list(message.keys())}"
        )

    # 2. Validate timestamp ISO 8601
    ts = message["timestamp"]
    if not isinstance(ts, str):
        valid = False
        logger.warning(
            f"Message[{idx}] timestamp must be str in ISO format, got {type(ts).__name__}"
        )
    try:
        datetime.fromisoformat(ts)  # raises ValueError if invalid
    except ValueError:
        valid = False
        logger.warning(f"Message[{idx}] invalid timestamp (not ISO 8601): {ts!r}")

    # 3. Validate temperature: float between 60 and 95 inclusive
    temp = message["temperature"]
    try:
        temp_val = float(temp)
    except (TypeError, ValueError):
        valid = False
        logger.warning(f"Message[{idx}] temperature must be float-like, got {temp!r}")
    if not (60.0 <= temp_val <= 95.0):
        valid = False
        logger.warning(f"Message[{idx}] temperature out of range [60, 95]: {temp_val}")

    # 4. Validate vibration: float, must be <= 4.8
    vib = message["vibration"]
    try:
        vib_val = float(vib)
    except (TypeError, ValueError):
        valid = False
        logger.warning(f"Message[{idx}] vibration must be float-like, got {vib!r}")
    if vib_val > 4.8:
        valid = False
        logger.warning(f"Message[{idx}] vibration above limit 4.8: {vib_val}")

    return valid
