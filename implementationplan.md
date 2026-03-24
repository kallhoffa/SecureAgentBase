# SecureAgentBase: Master Implementation Specification (v3.0)

**Target Audience:** LLM Coding Agents tasked with building the SecureAgentBase platform.  
**System Goal:** A "No-Terminal" orchestrator allowing non-technical users to create, own, and build full-stack apps via Discord.

---

## 1. System Architecture

The platform enables users to create apps entirely through Discord - no terminal required. All provisioning happens from the browser.

### 1.1 Components

| Component | Technology | Cost |
|-----------|------------|------|
| **Orchestrator** | Vite + React 19 (Firebase Hosting) | Free |
| **Listener** | Kimaki on GCP e2-micro VM | Free |
| **Brain** | GitHub Actions (public repos) | Free |
| **Database** | Firestore | Free |
| **Auth** | Firebase Auth | Free |

### 1.2 Data Flow

```
User (Browser) ──> GCP VM ──> Firebase Hosting
     │              │
     │              ▼
     │         GitHub Actions
     │              │
     ▼              ▼
Discord Bot    Kimaki (Discord listener)
```

---

## 2. Infrastructure Setup Flow (7 Steps)

The `/infra-setup` page guides users through a 7-step setup wizard:

### Step 1: Account
- User signs in with Firebase authentication
- Creates their user profile

### Step 2: Service Account
- User creates GCP service account with required roles
- Downloads JSON key, pastes into app
- App validates authentication

### Step 3: GCP Project
- User enters GCP project ID
- Optionally auto-detected from service account

### Step 4: Firebase Setup
- User creates staging and production Firebase projects manually
- Pastes Firebase SDK configs
- App stores project IDs for GitHub Secrets

### Step 5: GitHub Auth
- User creates GitHub PAT with `repo` scope
- VM uses PAT to:
  - Fork SecureAgentBase
  - Set GitHub Secrets
  - Push GitHub Actions workflows

### Step 6: Discord Bot
- User creates Discord bot in Developer Portal
- Adds bot to their Discord server
- Pastes bot token
- VM uses this to send welcome message

### Step 7: Create VM
- App enables required GCP APIs
- Creates VM with comprehensive startup script
- VM automatically:
  1. Forks SecureAgentBase
  2. Sets GitHub Secrets
  3. Creates GitHub Actions workflows
  4. Downloads Kimaki
  5. Creates #secureagent channel
  6. Sends welcome message

---

## 3. VM Startup Script

```bash
#!/bin/bash
set -e

# Read secrets from VM metadata
DISCORD_TOKEN=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/attributes/discord_bot_token")
GITHUB_PAT=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/attributes/github_pat")
FIREBASE_STAGING=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/attributes/firebase_staging_project_id")
FIREBASE_PRODUCTION=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/attributes/firebase_production_project_id")

# Install dependencies
apt-get update && apt-get install -y nodejs npm git curl wget gh jq

# Authenticate GitHub
echo "$GITHUB_PAT" | gh auth login --with-token

# Get GitHub username
GH_USER=$(gh api user --jq .login)

# Fork SecureAgentBase
gh repo fork kallhoffa/SecureAgentBase --clone

# Set GitHub Secrets for Firebase deployment
cd SecureAgentBase
gh secret set FIREBASE_STAGING_PROJECT_ID -b"$FIREBASE_STAGING"
gh secret set FIREBASE_PRODUCTION_PROJECT_ID -b"$FIREBASE_PRODUCTION"

# Create GitHub Actions workflow for staging
mkdir -p .github/workflows
cat > .github/workflows/deploy-staging.yml << 'EOF'
name: Deploy Staging
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test:ci
      - run: npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_STAGING_PROJECT_ID }}
          projectId: ${{ secrets.FIREBASE_STAGING_PROJECT_ID }}
          entryPoint: .
EOF

# Create GitHub Actions workflow for production
cat > .github/workflows/deploy-production.yml << 'EOF'
name: Deploy Production
on:
  release:
    types: [published]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test:ci
      - run: npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_PRODUCTION_PROJECT_ID }}
          projectId: ${{ secrets.FIREBASE_PRODUCTION_PROJECT_ID }}
          entryPoint: .
EOF

# Push workflows to GitHub
git config user.email "bot@secureagent"
git config user.name "SecureAgent"
git add .github/workflows/
git commit -m "Add deploy workflows"
git push

# Download and configure Kimaki
cd /opt
npx -y kimaki@latest project add SecureAgentBase

# Wait for Kimaki to start
sleep 30

# Get bot's guild ID
GUILD_ID=$(curl -s "https://discord.com/api/v10/users/@me/guilds" \
  -H "Authorization: Bot $DISCORD_TOKEN" | jq -r '.[0].id')

# Create #secureagent channel
CHANNEL=$(curl -s -X POST "https://discord.com/api/v10/guilds/$GUILD_ID/channels" \
  -H "Authorization: Bot $DISCORD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"Name": "secureagent", "type": 0}')
CHANNEL_ID=$(echo $CHANNEL | jq -r '.id')

# Send welcome message
sleep 5
curl -s -X POST "https://discord.com/api/v10/channels/$CHANNEL_ID/messages" \
  -H "Authorization: Bot $DISCORD_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"✅ **SecureAgent Setup Complete!**\n\n📦 **Your Infrastructure:**\n• GitHub Repo: https://github.com/$GH_USER/SecureAgentBase\n• Staging: https://$FIREBASE_STAGING.web.app\n• Production: https://$FIREBASE_PRODUCTION.web.app\n\n🚀 Kimaki is now listening for commands.\"}"

echo "Setup complete!"
```

---

## 4. Secrets Storage

**NOT stored in agentbase Firestore:**
- Discord bot token
- GitHub PAT
- Service account key
- Firebase configs

**Stored in user's GitHub Secrets:**
- `DISCORD_BOT_TOKEN`
- `GITHUB_TOKEN`
- `FIREBASE_STAGING_PROJECT_ID`
- `FIREBASE_PRODUCTION_PROJECT_ID`

**Stored in VM metadata (transient):**
- All secrets passed during VM creation
- Deleted when VM is terminated

---

## 5. GCP Service Account Roles

- Compute Admin
- Service Account User
- Project Billing Manager
- Service Usage Admin

---

## 6. Troubleshooting Guide

### VM Creation Fails
1. Check billing is enabled on GCP project
2. Verify service account has required roles
3. Check quota limits in GCP console
4. Review startup script logs: `sudo cat /var/log/syslog | grep startup`

### GitHub Fork Fails
1. Verify PAT has `repo` scope
2. Check if repo already forked: `gh repo list`
3. Ensure no rate limiting issues

### Discord Message Fails
1. Verify bot is in the server
2. Check bot has "Send Messages" permission
3. Validate bot token is correct

### Kimaki Not Responding
1. Check Kimaki is running: `ps aux | grep kimaki`
2. View logs: `cat /var/log/kimaki.log`
3. Restart: `cd /opt && npx -y kimaki@latest`

---

## 7. Current Status

### Completed
- ✅ Infrastructure Setup UI (7 steps)
- ✅ GCP Service Account validation
- ✅ API enablement
- ✅ VM provisioning
- ✅ GitHub PAT storage in GitHub Secrets
- ✅ Firebase project ID storage
- ✅ Comprehensive startup script
- ✅ Discord welcome message

### Pending
- ⏳ End-to-end testing with real GCP/Firebase/GitHub/Discord

---

## 8. File Structure

```
secureagentbase/
├── src/
│   ├── infra-setup.jsx      # 7-step infrastructure setup UI
│   ├── github-callback.jsx  # OAuth callback handler
│   └── ...
├── implementationplan.md     # This document
└── AGENTS.md                 # Developer guide
```

---

## 9. Key References

- [Kimaki GitHub](https://github.com/remorses/kimaki)
- [Firebase Hosting Deploy Action](https://github.com/FirebaseExtended/action-hosting-deploy)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Discord API Documentation](https://discord.com/developers/docs)
