#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Manual deploy to Cloud Run (for initial setup / debugging)
#
# Usage:
#   GCP_PROJECT=lucid-production ./scripts/gcp-deploy.sh
# ============================================================

GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT env var}"
GCP_REGION="${GCP_REGION:-us-central1}"
REPO_NAME="${REPO_NAME:-lucid-worker}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"

REGISTRY="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$REPO_NAME"
IMAGE_URL="$REGISTRY/worker:sha-$IMAGE_TAG"

echo "=== Manual Cloud Run Deploy ==="
echo "  Image: $IMAGE_URL"
echo ""

# Build
echo "[1/4] Building Docker image..."
docker build \
  --file worker/Dockerfile \
  --build-arg NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-}" \
  --tag "$IMAGE_URL" \
  .

# Push
echo "[2/4] Pushing to Artifact Registry..."
gcloud auth configure-docker "$GCP_REGION-docker.pkg.dev" --quiet
docker push "$IMAGE_URL"

# Deploy worker
echo "[3/4] Deploying lucid-worker..."
gcloud run deploy lucid-worker \
  --project="$GCP_PROJECT" \
  --region="$GCP_REGION" \
  --image="$IMAGE_URL" \
  --no-cpu-throttling \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=1 \
  --max-instances=10 \
  --concurrency=1 \
  --timeout=3600 \
  --port=8080 \
  --no-allow-unauthenticated \
  --set-env-vars="WORKER_MODE=worker,NODE_ENV=production" \
  --set-secrets="SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,LUCID_API_BASE_URL=LUCID_API_BASE_URL:latest,LUCID_API_KEY=LUCID_API_KEY:latest,WORKER_TRIGGER_SECRET=WORKER_TRIGGER_SECRET:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,MESSAGE_ENCRYPTION_MASTER_KEY=MESSAGE_ENCRYPTION_MASTER_KEY:latest,TELEGRAM_HOSTED_BOT_TOKEN=TELEGRAM_HOSTED_BOT_TOKEN:latest"

# Deploy discord gateway
echo "[4/4] Deploying lucid-discord-gw..."
gcloud run deploy lucid-discord-gw \
  --project="$GCP_PROJECT" \
  --region="$GCP_REGION" \
  --image="$IMAGE_URL" \
  --no-cpu-throttling \
  --cpu=1 \
  --memory=512Mi \
  --min-instances=1 \
  --max-instances=1 \
  --concurrency=1 \
  --timeout=3600 \
  --port=8080 \
  --no-allow-unauthenticated \
  --set-env-vars="WORKER_MODE=discord,NODE_ENV=production" \
  --set-secrets="SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest"

echo ""
echo "Done! Check status:"
echo "  gcloud run services describe lucid-worker --region=$GCP_REGION --format='value(status.url)'"
echo "  gcloud run services describe lucid-discord-gw --region=$GCP_REGION --format='value(status.url)'"
