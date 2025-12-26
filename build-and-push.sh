#!/bin/bash
# Build and push Docker images to Docker Hub
# Usage: ./build-and-push.sh [version]
# Example: ./build-and-push.sh v1.0.0

set -e

VERSION=${1:-latest}
REGISTRY="erdincka/manufacturing-co"

echo "🏗️  Building images with version: $VERSION"

# Build backend
echo "📦 Building backend..."
cd backend

docker buildx build --platform linux/amd64 -t ${REGISTRY}-backend:${VERSION} -t ${REGISTRY}-backend:latest --push .

# Build frontend
echo "📦 Building frontend..."
cd ../frontend
docker buildx build --platform linux/amd64 -t ${REGISTRY}-frontend:${VERSION} -t ${REGISTRY}-frontend:latest --push .

cd ..

echo ""
echo "✅ All images pushed successfully!"
echo ""
echo "📝 Images available:"
echo "   - ${REGISTRY}-backend:${VERSION}"
echo "   - ${REGISTRY}-backend:latest"
echo "   - ${REGISTRY}-frontend:${VERSION}"
echo "   - ${REGISTRY}-frontend:latest"
