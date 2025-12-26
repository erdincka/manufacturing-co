# Manufacturing Co Demo

This project consists of a Python API and a Next.js Frontend for demonstrating HPE Data Fabric capabilities.

## Production Readiness

The codebase has been cleaned and containerized for production:

- **API**: Python 3.11 with `uv` for dependency management, running as non-root.
- **Web**: Next.js 15 with standalone output for minimal image size, running as non-root.
- **Helm**: A complete Helm chart is provided in `helm/manufacturing-co`.

## Local Development (with Tilt)

```bash
tilt up
```

## Production Deployment (with Helm)

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
