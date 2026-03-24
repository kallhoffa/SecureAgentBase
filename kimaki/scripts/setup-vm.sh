#!/bin/bash

set -e

echo "=== Kimaki VM Setup ==="

PROJECT_ID="$1"
REGION="${2:-us-central1}"

if [ -z "$PROJECT_ID" ]; then
    echo "Usage: $0 <gcp-project-id> [region]"
    exit 1
fi

echo "Project: $PROJECT_ID"
echo "Region: $REGION"

echo ">>> Creating service account for Kimaki..."
gcloud iam service-accounts create kimaki-listener \
    --display-name="Kimaki Listener" \
    --project=$PROJECT_ID

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:kimaki-listener@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/run.invoker"

echo ">>> Enabling required APIs..."
gcloud services enable compute.googleapis.com run.googleapis.com --project=$PROJECT_ID

echo ">>> Creating e2-micro instance..."
gcloud compute instances create kimaki-vm \
    --zone=${REGION}-a \
    --machine-type=e2-micro \
    --image-family=cos-stable \
    --image-project=cos-cloud \
    --service-account=kimaki-listener@${PROJECT_ID}.iam.gserviceaccount.com \
    --scopes=cloud-platform \
    --tags=http-server \
    --metadata=startup-script-url=gs://${PROJECT_ID}/kimaki/startup.sh

echo ">>> Creating firewall rule for HTTP..."
gcloud compute firewall-rules create allow-http-kimaki \
    --allow=tcp:3000 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=http-server \
    --project=$PROJECT_ID

echo ">>> Kimaki VM setup complete!"
echo "External IP: $(gcloud compute instances describe kimaki-vm --zone=${REGION}-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"
echo ""
echo "Next steps:"
echo "1. Configure Discord webhook to point to your VM IP"
echo "2. Set environment variables:"
echo "   - DISCORD_WEBHOOK_URL"
echo "   - CLOUD_RUN_URL"
echo "   - SERVICE_ACCOUNT_PATH=/etc/secrets/service-account.json"
