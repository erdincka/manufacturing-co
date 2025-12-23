# Dockerfile
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy requirements first for better caching
COPY requirements.txt .

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies using uv
# --system is used because we are in a container and don't need a venv
RUN uv pip install --system -r requirements.txt

# Create data directory for SQLite
RUN mkdir -p /app/data

# Copy the rest of the application
COPY . .

EXPOSE 8000

# Workaround for Data Fabric endpoints
ENV AWS_REQUEST_CHECKSUM_CALCULATION=when_required
ENV AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]