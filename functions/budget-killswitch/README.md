# Budget Killswitch

A Google Cloud Function that monitors GCP billing and terminates resources when the budget threshold is exceeded.

## Overview

The Budget Killswitch provides a multi-layered defense against runaway cloud costs:

1. **Cloud Run termination** - Deletes all SecureAgent Brain containers
2. **VM stop** - Stops Kimaki and other compute VMs  
3. **Billing disable** - Detaches billing from project (final measure)
4. **Discord notification** - Alerts users of the situation

## Architecture

```
GCP Billing API
      ↓
Budget Alert (100%)
      ↓
Pub/Sub Topic: budget-alerts
      ↓
Cloud Function: budgetKillswitch
      ↓
├── terminateCloudRunServices()
├── stopVMs()
├── disableGCPBilling()
└── notifyDiscord()
```

## Setup

### 1. Deploy the Function

```bash
./functions/budget-killswitch/deploy.sh your-project-id us-central1
```

### 2. Configure Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GCP_PROJECT` | Yes | - | GCP project ID |
| `BILLING_THRESHOLD` | No | 1.0 | Dollar threshold to trigger killswitch |
| `DISCORD_WEBHOOK_URL` | No | - | Discord webhook for notifications |

### 3. Set Up Budget Alert

The deployment script creates a budget that triggers at 100% usage:

```bash
# Or manually via Cloud Console:
# 1. Go to Billing > Budgets & alerts
# 2. Create budget with 100% threshold
# 3. Link to Pub/Sub topic: projects/{PROJECT}/topics/budget-alerts
```

## Multi-Layer Defense

| Layer | Action | Destructive? |
|-------|--------|--------------|
| 1 | Stop Cloud Run services | No (can restart) |
| 2 | Stop VMs | No (can restart) |
| 3 | Disable billing | Yes (requires manual re-enable) |

The function attempts non-destructive measures first (stopping resources) before resorting to billing detachment.

## Security

- Function runs with minimal service account permissions
- Only deletes/terminates resources with "secureagent" or "kimaki" in the name
- Discord webhook URL should be stored as a secret
- Budget alert triggers at 100% to give early warning before final action

## Testing

```bash
# Test locally
gcloud functions call budgetKillswitch \
    --data='{"message":{"data":"eyJjb3N0QW1vdW50IjoxLjAwfQ=="}}' \
    --region=us-central1
```

The data is base64 encoded JSON: `{"costAmount": 1.00}`
