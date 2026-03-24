# Kimaki Discord Listener

The low-memory Discord webhook receiver that triggers the Cloud Run Brain. Runs on a free GCP e2-micro VM.

## Overview

Kimaki runs on the always-free e2-micro VM and:
- Receives Discord webhooks from user commands
- Enforces rate limiting (50k tokens/hr, 5 builds/hr)
- Triggers the Cloud Run Brain for code generation
- Posts results back to Discord

## Rate Limits

| Limit | Value | Window |
|-------|-------|--------|
| Tokens | 50,000 | Per hour |
| Builds | 5 | Per hour |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_WEBHOOK_URL` | Yes | Discord webhook for posting responses |
| `CLOUD_RUN_URL` | Yes | URL of the deployed Brain service |
| `SERVICE_ACCOUNT_PATH` | No | Path to GCP service account JSON (default: `/etc/secrets/service-account.json`) |
| `PORT` | No | Server port (default: 3000) |

## Quick Start (VM)

```bash
# Upload startup script to GCS
gsutil cp scripts/startup.sh gs://YOUR_PROJECT/kimaki/

# Run setup
./scripts/setup-vm.sh your-project-id us-central1

# SSH to VM and clone
git clone https://github.com/yourorg/kimaki.git /opt/kimaki

# Install dependencies
cd /opt/kimaki && npm install --production

# Start service
sudo cp kimaki.service /etc/systemd/system/
sudo systemctl enable kimaki
sudo systemctl start kimaki
```

## Quick Start (Docker)

```bash
docker build -t kimaki-listener .
docker run -d \
  --name kimaki \
  -p 3000:3000 \
  -e DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... \
  -e CLOUD_RUN_URL=https://... \
  kimaki-listener
```

## Discord Setup

1. Create a Discord channel (e.g., `kimaki-commands`)
2. Create a Discord app and get webhook URL
3. Configure webhook to POST to: `http://YOUR_VM_IP:3000/webhook/discord`

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/discord` | POST | Receive Discord commands |
| `/health` | GET | Health check |
| `/stats` | GET | View rate limit stats |

## Architecture

```
Discord → Kimaki (e2-micro) → Cloud Run Brain → GitHub PR
         ↓
      Rate Limit Check
         ↓
      Token Quota Check
```

## Security

- Runs on minimal e2-micro (1 vCPU, 1GB RAM)
- Service account has only `roles/run.invoker` (no broad permissions)
- Rate limiting prevents abuse
- All webhooks validated before processing
