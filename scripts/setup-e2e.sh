#!/bin/bash
set -euo pipefail

# setup-e2e.sh — One-time setup for e2e regression testing
#
# Creates a dedicated e2e service account in your GCP project,
# generates a JSON key, and uploads it + required config to GitHub.
#
# Usage:
#   ./scripts/setup-e2e.sh
#
# Prerequisites:
#   - gh CLI authenticated with repo admin access
#   - gcloud CLI authenticated with project owner/editor
#   - GCP project with billing enabled

RESET='\033[0m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'

pass()  { echo -e "${GREEN}[PASS]${RESET} $1"; }
fail()  { echo -e "${RED}[FAIL]${RESET} $1"; exit 1; }
info()  { echo -e "${CYAN}[INFO]${RESET} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET} $1"; }
ask()   { read -p "$1: " REPLY; echo "$REPLY"; }

echo "╔══════════════════════════════════════════════════════╗"
echo "║   E2E Test Infrastructure Setup                     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

PROJECT_ID=$(ask "GCP project ID for e2e tests (must have billing enabled)")
GH_REPO="${GITHUB_REPOSITORY:-}"
if [ -z "$GH_REPO" ]; then
  GH_REPO=$(ask "GitHub repo (e.g. kallhoffa/SecureAgentBase)")
fi

SA_NAME="e2e-test-runner"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# ── Phase 1: Create service account ──
info "Creating e2e service account: $SA_NAME"
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  warn "Service account already exists, reusing..."
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="E2E Test Runner" \
    --project="$PROJECT_ID"
  pass "Service account created"
fi

# ── Phase 2: Grant IAM roles ──
info "Granting IAM roles..."
ROLES=(
  "roles/compute.admin"
  "roles/compute.instanceAdmin.v1"
  "roles/iam.securityAdmin"
  "roles/serviceusage.serviceUsageAdmin"
  "roles/iam.serviceAccountAdmin"
  "roles/iam.serviceAccountUser"
  "roles/iam.serviceAccountTokenCreator"
)
for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" --quiet 2>/dev/null
  pass "  Granted $role"
done

# ── Phase 3: Generate and upload key ──
info "Generating JSON key..."
KEY_FILE="/tmp/e2e-sa-key-$(date +%s).json"
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT_ID"
pass "Key generated at $KEY_FILE"

info "Uploading key to GitHub secret E2E_SA_KEY_B64..."
gh secret set E2E_SA_KEY_B64 --repo "$GH_REPO" --body "$(base64 -w0 "$KEY_FILE")"
pass "Secret E2E_SA_KEY_B64 set"

info "Setting variable E2E_GCP_PROJECT_ID..."
gh variable set E2E_GCP_PROJECT_ID --repo "$GH_REPO" --body "$PROJECT_ID"
pass "Variable E2E_GCP_PROJECT_ID set"

# ── Phase 4: Set Firebase test user password ──
TEST_PASS=$(openssl rand -base64 18)
info "Setting E2E_TEST_PASSWORD secret..."
gh secret set E2E_TEST_PASSWORD --repo "$GH_REPO" --body "$TEST_PASS"
pass "Secret E2E_TEST_PASSWORD set"

# ── Phase 5: Set Firebase configs for step injection ──
info "Setting optional Firebase config secrets..."
# These are read from the existing staging deploy vars if available
FIREBASE_API_KEY=$(gh variable list --repo "$GH_REPO" --json name,value | jq -r '.[] | select(.name == "FIREBASE_API_KEY_STAGING") | .value' 2>/dev/null || echo "")
if [ -n "$FIREBASE_API_KEY" ]; then
  gh secret set E2E_FIREBASE_STAGING_B64 --repo "$GH_REPO" \
    --body "$(echo "{\"apiKey\":\"$FIREBASE_API_KEY\",\"projectId\":\"$PROJECT_ID\"}" | base64 -w0)"
  pass "E2E_FIREBASE_STAGING_B64 set"

  gh secret set E2E_FIREBASE_PROD_B64 --repo "$GH_REPO" \
    --body "$(echo "{\"apiKey\":\"$FIREBASE_API_KEY\",\"projectId\":\"$PROJECT_ID\"}" | base64 -w0)"
  pass "E2E_FIREBASE_PROD_B64 set"
else
  warn "Could not read FIREBASE_API_KEY_STAGING from GitHub vars — skipping Firebase config secrets"
  warn "Set E2E_FIREBASE_STAGING_B64 and E2E_FIREBASE_PROD_B64 manually if needed"
fi

# ── Clean up local key ──
rm -f "$KEY_FILE"
pass "Local key file deleted"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   Setup Complete!                                   ║"
echo "║                                                     ║"
echo "║   GCP Project:  $PROJECT_ID"
echo "║   Service Acct: $SA_EMAIL"
echo "║   Test user:    e2e@agentbase-staging.iam.gserviceaccount.com"
echo "║                                                     ║"
echo "║   Next push to main will run:                       ║"
echo "║     • 7 unauthenticated wizard UI tests             ║"
echo "║     • 2 full wizard flow tests (with SA key)        ║"
echo "║     • 1 GCP create/test/destroy loop                ║"
echo "║                                                     ║"
echo "║   Teardown is automatic:                            ║"
echo "║     • trap handler in e2e-gcp-loop.sh               ║"
echo "║     • if: always() cleanup step in CI               ║"
echo "╚══════════════════════════════════════════════════════╝"
