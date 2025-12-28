# Manufacturing Co Demo

This project consists of a Python API and a Next.js Frontend for demonstrating HPE Data Fabric capabilities.

## Production Readiness

The codebase has been cleaned and containerized for production:

- **API**: Python 3.11 with `uv` for dependency management, running as non-root.
- **Web**: Next.js 15 with standalone output for minimal image size, running as non-root.
- **Helm**: A complete Helm chart is provided in `helm/manufacturing-co`.

## Deploy on PCAI

Use `Import Framework` wizard to deploy the application.

Use [logo](./manufacturing-co.jpeg) image for the logo, and [helm chart](./manufacturing-co-0.1.0.tgz) file as your package.

Once deployed, you should go to the "Admin" page and configure for your Data Fabric connection.

Data Fabric should have following services enabled/installed:

- REST API (port 8443) - installed by default, no need for manual configuration

- Object Storage (port 9000) - installed by default, no need for manual configuration (app will create temporary/short-lived s3 access_key and secret_key using REST API to connect, so your configured user should have access to that)

- Kafka REST API (port 8082) - Install mapr-kafka package if not already installed.

Follow the UI for full configuration:

- Test Connection (verify auth and enable connection profile)

- Save Profile (used by the app through its lifecycle, stored in PVC for persistance)

- Discover Services (check port availability and auth)

- Bootstrap resources (if missing app will enforce you to create them):
   
   - Create the S3 buckets and Kafka topics for each layer (bronze, silver and gold)

      - bronze-bucket
      - silver-bucket
      - gold-bucket

   - Create the Iceberg tables at each layer (telemetry.raw for bronze, telemetry.cleansed for silver and manufacturing.kpis for gold layer)

Once app shows "System Ready" on top header, you can navigate and create simulated data ingestion that will generate sample records (100 per run).


## Local Development (with Tilt)

```bash
tilt up
```

## Development Deployment (using Helm)

1. **Build and Push Images**:
   Build the images and push them to your registry.
   ```bash
   docker buildx build --platform linux/amd64 -t your-registry/backend:latest --push ./backend
   docker buildx build --platform linux/amd64 -t your-registry/frontend:latest --push ./frontend
   ```

2. **Configure values.yaml**:
   Update `helm/manufacturing-co/values.yaml` with your values.

3. **Install the Chart**:
   ```bash
   helm install manufacturing-co ./helm/manufacturing-co
   ```

## Project Structure

- `backend/`: Python FastAPI service.
- `frontend/`: Next.js frontend application.
- `helm/`: Kubernetes deployment configuration.
