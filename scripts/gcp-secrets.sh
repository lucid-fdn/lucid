#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Populate GCP Secret Manager with worker env vars
#
# Usage:
#   GCP_PROJECT=lucid-production ./scripts/gcp-secrets.sh
#
# For each secret, you'll be prompted to enter the value.
# Skip any secret by pressing Enter (empty value is ignored).
# ============================================================

GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT env var}"

SECRETS=(
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  LUCID_API_BASE_URL
  LUCID_API_KEY
  WORKER_TRIGGER_SECRET
  ENCRYPTION_KEY
  MESSAGE_ENCRYPTION_MASTER_KEY
  TELEGRAM_HOSTED_BOT_TOKEN
  FALLBACK_PROVIDER_URL
  FALLBACK_PROVIDER_KEY
  FALLBACK_PROVIDER_MODEL
)

echo "=== Populate GCP Secret Manager ==="
echo "  Project: $GCP_PROJECT"
echo ""
echo "Enter values for each secret. Press Enter to skip."
echo ""

for secret in "${SECRETS[@]}"; do
  read -rsp "$secret: " value
  echo ""

  if [ -z "$value" ]; then
    echo "  Skipped $secret"
    continue
  fi

  # Create secret if it doesn't exist
  if ! gcloud secrets describe "$secret" --project="$GCP_PROJECT" &>/dev/null; then
    gcloud secrets create "$secret" --project="$GCP_PROJECT" --replication-policy="automatic"
  fi

  # Add new version
  echo -n "$value" | gcloud secrets versions add "$secret" --project="$GCP_PROJECT" --data-file=-
  echo "  Set $secret"
done

echo ""
echo "Done. Verify with: gcloud secrets list --project=$GCP_PROJECT"
