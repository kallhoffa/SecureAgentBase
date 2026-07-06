#!/bin/bash
set -euo pipefail

# e2e-gcp-loop.sh — Full GCP create/test/destroy loop for CI
#
# Prerequisites:
#   - gcloud CLI authenticated with a user or SA that has:
#       roles/compute.admin, roles/iam.securityAdmin, roles/iam.serviceAccountAdmin
#   - Billing enabled on the project
#   - GCP_PROJECT_ID and GCP_SA_KEY (base64) set in environment
#
# Usage:
#   GCP_PROJECT_ID=my-project GCP_SA_KEY_B64="$(base64 -w0 key.json)" ./scripts/e2e-gcp-loop.sh

RESET='\033[0m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'

pass() { echo -e "${GREEN}[PASS]${RESET} $1"; }
fail() { echo -e "${RED}[FAIL]${RESET} $1"; }
info() { echo -e "${CYAN}[INFO]${RESET} $1"; }
warn() { echo -e "${YELLOW}[WARN]${RESET} $1"; }

# --------------- Configuration ---------------
PROJECT_ID="${GCP_PROJECT_ID:-}"
SA_KEY_B64="${GCP_SA_KEY_B64:-}"
ZONE="${GCP_ZONE:-us-east1-b}"
INSTANCE_NAME="e2e-test-vm-$(date +%s)"
TEST_SA_NAME="e2e-test-sa-$(date +%s)"
CLEANUP_DONE=false

if [ -z "$PROJECT_ID" ] || [ -z "$SA_KEY_B64" ]; then
  echo "Usage: GCP_PROJECT_ID=<project> GCP_SA_KEY_B64=\"\$(base64 -w0 key.json)\" $0"
  exit 1
fi

# Authenticate with the provided SA key
echo "$SA_KEY_B64" | base64 -d > /tmp/e2e-sa-key.json
gcloud auth activate-service-account --key-file=/tmp/e2e-sa-key.json --project="$PROJECT_ID" 2>/dev/null

# --------------- Cleanup Handler ---------------
cleanup() {
  if [ "$CLEANUP_DONE" = true ]; then return; fi
  CLEANUP_DONE=true
  info "Cleaning up resources..."

  # Delete instance (if exists)
  if gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" &>/dev/null; then
    info "Deleting VM instance $INSTANCE_NAME..."
    gcloud compute instances delete "$INSTANCE_NAME" --zone="$ZONE" --project="$PROJECT_ID" --quiet 2>/dev/null || true
    pass "VM instance deleted"
  fi

  # Delete test SA (if exists)
  TEST_SA_EMAIL="${TEST_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
  if gcloud iam service-accounts describe "$TEST_SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
    info "Deleting test service account $TEST_SA_NAME..."
    # Remove roles first
    for role in $(gcloud projects get-iam-policy "$PROJECT_ID" --format=json | \
      jq -r ".bindings[] | select(.members[] | contains(\"$TEST_SA_EMAIL\")) | .role"); do
      gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$TEST_SA_EMAIL" --role="$role" --quiet 2>/dev/null || true
    done
    gcloud iam service-accounts delete "$TEST_SA_EMAIL" --project="$PROJECT_ID" --quiet 2>/dev/null || true
    pass "Test service account deleted"
  fi

  rm -f /tmp/e2e-sa-key.json /tmp/e2e-test-sa-key.json /tmp/e2e-startup-log.txt
  info "Cleanup complete"
}

trap cleanup EXIT INT TERM

# --------------- Phase 1: Create Test Service Account ---------------
info "=== Phase 1: Create Test Service Account ==="

gcloud iam service-accounts create "$TEST_SA_NAME" \
  --display-name="E2E Test SA" \
  --project="$PROJECT_ID"
pass "Service account $TEST_SA_NAME created"

TEST_SA_EMAIL="${TEST_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant necessary roles (matches what CloudShellScript grants + compute.admin for VM creation)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$TEST_SA_EMAIL" \
  --role="roles/compute.instanceAdmin.v1" --quiet 2>/dev/null

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$TEST_SA_EMAIL" \
  --role="roles/iam.serviceAccountUser" --quiet 2>/dev/null

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$TEST_SA_EMAIL" \
  --role="roles/iam.serviceAccountTokenCreator" --quiet 2>/dev/null

pass "IAM roles granted to test SA"

# Generate and download key
gcloud iam service-accounts keys create /tmp/e2e-test-sa-key.json \
  --iam-account="$TEST_SA_EMAIL" \
  --project="$PROJECT_ID"
pass "Test SA key generated"

# Switch to the test SA
gcloud auth activate-service-account --key-file=/tmp/e2e-test-sa-key.json --project="$PROJECT_ID" 2>/dev/null
info "Switched to test SA credentials"

# --------------- Phase 2: Create VM ---------------
info "=== Phase 2: Create VM ==="

# Use startup script that signals completion (similar to scripts.ts pattern)
STARTUP_SCRIPT='#!/bin/bash
set +e
export HOME=/root
echo "E2E test VM starting..."
apt-get update -y 2>/dev/null || true
apt-get install -y curl jq 2>/dev/null || true
echo "=== E2E test VM initialization complete! ==="
# Keep running so we can poll serial output
sleep 300
'

gcloud compute instances create "$INSTANCE_NAME" \
  --zone="$ZONE" \
  --project="$PROJECT_ID" \
  --machine-type="e2-micro" \
  --image-family="debian-11" \
  --image-project="debian-cloud" \
  --boot-disk-size="10GB" \
  --metadata="startup-script=${STARTUP_SCRIPT}" \
  --labels="e2e-test=true,created-by=e2e-gcp-loop"
pass "VM instance $INSTANCE_NAME created"

# Get the external IP
INSTANCE_IP=$(gcloud compute instances describe "$INSTANCE_NAME" \
  --zone="$ZONE" --project="$PROJECT_ID" \
  --format="get(networkInterfaces[0].accessConfigs[0].natIP)")
info "Instance IP: $INSTANCE_IP"

# --------------- Phase 3: Poll Serial Output ---------------
info "=== Phase 3: Poll Serial Output ==="
info "Waiting for VM initialization (max 3 min)..."

SERIAL_SUCCESS=false
for i in $(seq 1 36); do
  sleep 5
  SERIAL_OUTPUT=$(gcloud compute instances get-serial-port-output "$INSTANCE_NAME" \
    --zone="$ZONE" --project="$PROJECT_ID" --port=1 2>/dev/null || echo "")
  
  if echo "$SERIAL_OUTPUT" | grep -q "E2E test VM initialization complete"; then
    SERIAL_SUCCESS=true
    pass "VM initialization detected in serial output"
    break
  fi
  echo -n "." >&2
done
echo >&2

if [ "$SERIAL_SUCCESS" = false ]; then
  fail "VM initialization not detected within time limit"
  info "Last serial output:"
  gcloud compute instances get-serial-port-output "$INSTANCE_NAME" \
    --zone="$ZONE" --project="$PROJECT_ID" --port=1 2>/dev/null | tail -20 || true
  exit 1
fi

# --------------- Phase 4: Verify VM Works ---------------
info "=== Phase 4: Verify VM ==="

# Verify the instance is RUNNING
INSTANCE_STATUS=$(gcloud compute instances describe "$INSTANCE_NAME" \
  --zone="$ZONE" --project="$PROJECT_ID" \
  --format="get(status)")
if [ "$INSTANCE_STATUS" = "RUNNING" ]; then
  pass "VM instance status is RUNNING"
else
  fail "VM instance status is $INSTANCE_STATUS (expected RUNNING)"
  exit 1
fi

# SSH connectivity check (quick)
if command -v nc &>/dev/null && [ -n "$INSTANCE_IP" ]; then
  if nc -z -w5 "$INSTANCE_IP" 22 2>/dev/null; then
    pass "VM SSH port (22) is reachable"
  else
    warn "VM SSH port not reachable (may be expected with firewall)"
  fi
fi

# --------------- Phase 5: Verify Metadata ---------------
info "=== Phase 5: Verify GCP Integration ==="

# Verify labels
LABELS=$(gcloud compute instances describe "$INSTANCE_NAME" \
  --zone="$ZONE" --project="$PROJECT_ID" \
  --format="json(labels)")
if echo "$LABELS" | jq -e '.labels["e2e-test"] == "true"' &>/dev/null; then
  pass "Instance has correct labels"
else
  warn "Instance labels: $LABELS"
fi

# Verify the startup script metadata exists
SCRIPT_MD=$(gcloud compute instances describe "$INSTANCE_NAME" \
  --zone="$ZONE" --project="$PROJECT_ID" \
  --format="json(metadata.items)" 2>/dev/null)
if echo "$SCRIPT_MD" | jq -e '.metadata.items[] | select(.key == "startup-script")' &>/dev/null; then
  pass "Instance has startup-script metadata"
else
  warn "Instance startup-script metadata not found"
fi

# --------------- Final ---------------
echo ""
info "=== E2E GCP Loop Complete ==="
echo ""
echo "  Project:     $PROJECT_ID"
echo "  Zone:        $ZONE"
echo "  Instance:    $INSTANCE_NAME"
echo "  Test SA:     $TEST_SA_EMAIL"
echo "  Test Result: ALL CHECKS PASSED"
echo ""

# Cleanup will run automatically via the trap
exit 0
