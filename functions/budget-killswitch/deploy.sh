#!/bin/bash

set -e

PROJECT_ID="$1"
FUNCTION_REGION="${2:-us-central1}"

if [ -z "$PROJECT_ID" ]; then
    echo "Usage: $0 <gcp-project-id> [region]"
    exit 1
fi

echo "=== Budget Killswitch Setup ==="
echo "Project: $PROJECT_ID"
echo "Region: $FUNCTION_REGION"

echo ">>> Enabling APIs..."
gcloud services enable \
    cloudfunctions.googleapis.com \
    pubsub.googleapis.com \
    cloudbuild.googleapis.com \
    --project=$PROJECT_ID

echo ">>> Creating budget alert Pub/Sub topic..."
gcloud pubsub topics create budget-alerts --project=$PROJECT_ID || true

echo ">>> Setting budget..."
gcloud beta billing budgets create budget-for-killswitch \
    --billing-account=$(gcloud beta billing accounts list --format='value(name)' | head -1) \
    --display-name="SecureAgent Budget" \
    --threshold-rule=percent=100 \
    --stop-setup-on-0-usage \
    --pubsub-topic=projects/$PROJECT_ID/topics/budget-alerts \
    --filter-projects=$PROJECT_ID \
    --project=$PROJECT_ID || true

echo ">>> Deploying Cloud Function..."
cd functions/budget-killswitch

npm install

gcloud functions deploy budgetKillswitch \
    --gen2 \
    --runtime=nodejs20 \
    --region=$FUNCTION_REGION \
    --source=. \
    --entry-point=budgetKillswitch \
    --trigger-topic=budget-alerts \
    --service-account=killswitch@$PROJECT_ID.iam.gserviceaccount.com \
    --memory=256MB \
    --timeout=540s \
    --max-instances=1 \
    --project=$PROJECT_ID

echo ">>> Setting environment variables..."
gcloud functions deploy budgetKillswitch \
    --update-env-vars="GCP_PROJECT=$PROJECT_ID,BILLING_THRESHOLD=1.0" \
    --project=$PROJECT_ID

echo ">>> Budget Killswitch deployed!"
echo ""
echo "The function will:"
echo "1. Trigger at 100% budget"
echo "2. Delete Cloud Run services"
echo "3. Stop VMs"
echo "4. Disable billing"
echo "5. Notify via Discord (if webhook configured)"
