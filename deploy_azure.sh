#!/bin/bash
set -e

echo "Deploying backend to Azure Container Apps..."
cd backend

# Note: The docker build and push for v16 is already running in the background!
# docker build -t owngalleryacr2026.azurecr.io/own-gallery-django:v16 .
# docker push owngalleryacr2026.azurecr.io/own-gallery-django:v16

echo "Updating Azure Container Apps to use the latest image (v16)..."
az containerapp update \
    --name own-gallery-api \
    --resource-group own-gallery-rg \
    --image owngalleryacr2026.azurecr.io/own-gallery-django:v16

az containerapp update \
    --name own-gallery-celery \
    --resource-group own-gallery-rg \
    --image owngalleryacr2026.azurecr.io/own-gallery-django:v16

echo "Backend deployment triggered successfully!"

