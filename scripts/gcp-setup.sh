#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# GCP Setup for Lucid Worker — Cloud Run Migration
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - Billing account linked to a GCP project
#
# Usage:
#   GCP_PROJECT=lucid-production ./scripts/gcp-setup.sh
# ============================================================

GCP_PROJECT="${GCP_PROJECT:?Set GCP_PROJECT env var (e.g. lucid-production)}"
GCP_REGION="${GCP_REGION:-us-central1}"
REPO_NAME="${REPO_NAME:-lucid-worker}"
GITHUB_ORG="${GITHUB_ORG:-daishizenSensei}"
GITHUB_REPO="${GITHUB_REPO:-LucidMerged}"

echo "=== GCP Setup for Lucid Worker ==="
echo "  Project:  $GCP_PROJECT"
echo "  Region:   $GCP_REGION"
echo "  Repo:     $REPO_NAME"
echo ""

# Set default project
gcloud config set project "$GCP_PROJECT"

# 1. Enable required APIs
echo "[1/6] Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com

# 2. Create Artifact Registry repo
echo "[2/6] Creating Artifact Registry repo..."
gcloud artifacts repositories describe "$REPO_NAME" \
  --location="$GCP_REGION" 2>/dev/null || \
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$GCP_REGION" \
  --description="Lucid Worker Docker images"

# 3. Create a service account for GitHub Actions
SA_NAME="github-actions-deploy"
SA_EMAIL="$SA_NAME@$GCP_PROJECT.iam.gserviceaccount.com"

echo "[3/6] Creating service account for GitHub Actions..."
gcloud iam service-accounts describe "$SA_EMAIL" 2>/dev/null || \
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions Deploy"

# Grant roles
for role in roles/run.admin roles/artifactregistry.writer roles/secretmanager.secretAccessor roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --condition=None \
    --quiet
done

# Grant default compute SA access to secrets (Cloud Run uses this SA at runtime)
PROJECT_NUMBER=$(gcloud projects describe "$GCP_PROJECT" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$GCP_PROJECT" \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None \
  --quiet

# 4. Set up Workload Identity Federation (keyless auth for GitHub Actions)
echo "[4/6] Setting up Workload Identity Federation..."
POOL_NAME="github-pool"
PROVIDER_NAME="github-provider"

# Create pool (idempotent)
gcloud iam workload-identity-pools describe "$POOL_NAME" \
  --location="global" 2>/dev/null || \
gcloud iam workload-identity-pools create "$POOL_NAME" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Create provider (idempotent)
gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --workload-identity-pool="$POOL_NAME" \
  --location="global" 2>/dev/null || \
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
  --workload-identity-pool="$POOL_NAME" \
  --location="global" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$GITHUB_ORG/$GITHUB_REPO'"

# Allow GitHub Actions to impersonate the service account
POOL_ID=$(gcloud iam workload-identity-pools describe "$POOL_NAME" --location="global" --format="value(name)")
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/$POOL_ID/attribute.repository/$GITHUB_ORG/$GITHUB_REPO" \
  --quiet

# 5. Get the Workload Identity Provider resource name (needed for GitHub Actions)
echo "[5/6] Fetching Workload Identity Provider name..."
WIF_PROVIDER=$(gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --workload-identity-pool="$POOL_NAME" \
  --location="global" \
  --format="value(name)")

# 6. Print summary
echo ""
echo "[6/6] Setup complete! Add these as GitHub repo secrets:"
echo ""
echo "  GCP_PROJECT_ID       = $GCP_PROJECT"
echo "  GCP_REGION           = $GCP_REGION"
echo "  GCP_SA_EMAIL         = $SA_EMAIL"
echo "  GCP_WIF_PROVIDER     = $WIF_PROVIDER"
echo "  GCP_ARTIFACT_REPO    = $GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$REPO_NAME"
echo ""
echo "Image URL pattern:"
echo "  $GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$REPO_NAME/worker:<tag>"
