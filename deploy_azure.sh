#!/bin/bash
set -e

TAG="${1:-v19}"

echo "Deploying backend to Azure Container Apps with tag: $TAG..."
cd backend

echo "Building Docker image: owngalleryacr2026.azurecr.io/own-gallery-django:$TAG..."
docker build -t "owngalleryacr2026.azurecr.io/own-gallery-django:$TAG" .

echo "Pushing Docker image to ACR..."
docker push "owngalleryacr2026.azurecr.io/own-gallery-django:$TAG"

echo "Updating Azure Container Apps to use $TAG..."
az containerapp update \
    --name own-gallery-api \
    --resource-group own-gallery-rg \
    --image "owngalleryacr2026.azurecr.io/own-gallery-django:$TAG"

az containerapp update \
    --name own-gallery-celery \
    --resource-group own-gallery-rg \
    --image "owngalleryacr2026.azurecr.io/own-gallery-django:$TAG"

echo "Backend deployment triggered successfully!"


