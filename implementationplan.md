# SecureAgentBase: Master Implementation Specification (v3.0)

**Target Audience:** LLM Coding Agents tasked with building the SecureAgentBase platform.  
**System Goal:** A "No-Terminal" orchestrator allowing non-technical users to create, own, and build full-stack apps via Discord.

---

## 1. System Architecture

The platform enables users to create apps entirely through Discord - no terminal required. All provisioning happens from the browser via OAuth APIs.

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
User (Browser)
    │
    ├─→ GitHub OAuth ──→ Create public repo (Apache 2.0)
    │                   ├─→ Install GitHub App
    │                   └─→ Add Actions workflow
    │
    └─→ GCP OAuth ──→ Create e2-micro VM └─→ Deploy
                        Kimaki listener

User (Discord)
    │
    ├─→ Kimaki (e2-micro) receives command
    │       │
    │       ├─→ Rate limiting check
    │       │
    │       └─→ Trigger GitHub Actions workflow
    │               │
    │               ├─→ Architect creates spec
    │               ├─→ Critic reviews
    │               ├─→ Coder implements
    │               ├─→ Verifier tests
    │               └─→ Creates PR
    │
    └─→ On PR merge → Deploy to staging (Firebase)
            │
            └─→ On release → Deploy to production (Firebase)
```

---

## 2. End-to-End User Flow

### 2.1 Create New App

User clicks "Create New App" in the web UI:

1. **GitHub OAuth** - User authorizes, app creates a new public repo with Apache 2.0 license
2. **GitHub App Install** - App installs GitHub App on the new repo with `contents:write` permission
3. **GCP OAuth** - User authorizes, app provisions e2-micro VM via Compute API
4. **Kimaki Deploy** - App pushes Kimaki config to VM, starts listener
5. **Workflow Setup** - App adds Actions workflow to the new repo
6. **Discord Config** - User creates Discord channel/bot, configures in app

### 2.2 Build Flow

User interacts via Discord:

1. User sends prompt in Discord channel (e.g., "Add a login page")
2. Kimaki receives webhook, validates rate limits
3. Kimaki triggers GitHub Actions via API (`workflow_dispatch`)
4. Actions clone repo, run Multi-Agent pipeline
5. Pipeline creates feature branch, opens PR
6. Kimaki posts PR link to Discord

### 2.3 Deploy Flow

1. **Staging**: On PR merge to `main` → Actions deploys to Firebase staging
2. **Production**: On GitHub release → Actions deploys to Firebase production

---

## 3. Browser-Based Provisioning

All resource creation happens from the user's browser using OAuth access tokens.

### 3.1 GitHub Provisioning

```javascript
// Create repo via Octokit
const repo = await octokit.repos.createForAuthenticatedUser({
  name: appName,
  description: 'Created with SecureAgentBase',
  license_template: 'apache-2.0',
  private: false,
  auto_init: true
});

// Install GitHub App
await octokit.apps.installations.createInstallationAccessToken({
  installation_id: installationId,
  repositories: [repo.data.name]
});
```

### 3.2 GCP Provisioning

Using Google Identity Services OAuth:

```javascript
// Initialize OAuth client
google.accounts.oauth2.initTokenClient({
  client_id: GCP_CLIENT_ID,
  scope: 'https://www.googleapis.com/auth/compute',
  callback: (response) => {
    // response.access_token available
  }
});

// Create e2-micro VM
await gcp.compute.instances.insert({
  project: projectId,
  zone: 'us-central1-a',
  resource: {
    name: 'kimaki-vm',
    machineType: 'zones/us-central1-a/machineTypes/e2-micro',
    // ... boot disk, network, startup script
  }
});
```

---

## 4. The Listener (Kimaki)

Runs on free GCP e2-micro VM. Responsibilities:

### 4.1 Core Functions

- **Discord Webhook Receiver**: Receive commands from Discord channel
- **Rate Limiting**: Enforce token quota (50k/hr) and build limits (5/hr)
- **Actions Trigger**: Call GitHub API to trigger workflow dispatch
- **Discord Notifier**: Post results back to Discord

### 4.2 Rate Limits

| Limit | Value | Window |
|-------|-------|--------|
| Tokens | 50,000 | Per hour |
| Builds | 5 | Per hour |

### 4.3 Discord Commands

```
@kimaki help           - Show available commands
@kimaki build <prompt> - Build a feature
@kimaki status         - Show current build status
@kimaki stop           - Cancel current build
```

---

## 5. The Brain (GitHub Actions)

The Multi-Agent pipeline runs in GitHub Actions on public repos (free).

### 5.1 Workflow Trigger

```yaml
on:
  workflow_dispatch:
    inputs:
      prompt:
        description: 'Feature to build'
        required: true
      userId:
        description: 'Discord user ID'
        required: true
```

### 5.2 Specialized Agents

* **The Architect**: Receives user prompt, creates `specification.md`
* **The Critic**: Reviews spec for security/sustainability issues, rejects bad designs
* **The Coder**: Implements approved spec in the repo
* **The Verifier**: Runs tests, retries on failure

### 5.3 Agent Prompts

Prompts are defined in `.github/agent-prompts/`:
- `architect.md` - System prompt for spec creation
- `critic.md` - System prompt for adversarial review
- `coder.md` - System prompt for implementation
- `verifier.md` - System prompt for testing

---

## 6. Deployment Pipeline

Each user app gets its own GitHub Actions workflows.

### 6.1 Staging Deploy

```yaml
on:
  pull_request:
    branches: [main]
    types: [closed]

jobs:
  deploy-staging:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install && npm run build
      - uses: w9jds/firebase-action@master
        with:
          args: deploy --only hosting --project=${{ vars.STAGING_PROJECT_ID }}
```

### 6.2 Production Deploy

```yaml
on:
  release:
    types: [published]

jobs:
  deploy-production:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install && npm run build
      - uses: w9jds/firebase-action@master
        with:
          args: deploy --only hosting --project=${{ vars.PRODUCTION_PROJECT_ID }}
```

---

## 7. Implementation Safety & Git Integrity

### 7.1 Bypass Prevention

- **Branch Protection**: All repos have protected `main` branch
- **Required Checks**: CI must pass before merge
- **Branch-by-Default**: All AI work on feature branches
- **No Auto-Merge**: Agent never auto-merges

### 7.2 Conflict Resolution

If agent encounters merge conflict with user code:
- Push changes to `conflict-resolution/feature-name` branch
- Notify user via Discord: "Conflict detected in `file.tsx`. Please merge manually."

---

## 8. Security Model

### 8.1 OAuth Scopes

| Provider | Scopes |
|----------|---------|
| GitHub | `repo`, `read:user` |
| GCP | `cloud-platform` (limited via VM service account) |

### 8.2 Service Account (for VM)

The e2-micro VM runs with a dedicated service account:
- `roles/compute.instanceAdmin.v1`
- `roles/iam.serviceAccountUser`

### 8.3 GitHub App

Uses GitHub App with repo-scoped permissions instead of PAT tokens.

---

## 9. Cost Analysis

| Component | Free Tier | Notes |
|-----------|-----------|-------|
| **e2-micro VM** | 1/month always free | Listener only |
| **GitHub Actions** | Unlimited | Public repos |
| **Firestore** | 1GB storage | Config storage |
| **Firebase Hosting** | 1GB/10GB transfer | User apps |
| **Firebase Auth** | Unlimited | User auth |

**Total: $0/month** (per user app)

---

## 10. Execution Instructions for the Building Agent

### Phase 1: Web App Enhancement (✅ IN PROGRESS)
1. **[DONE]** Add "Create New App" UI flow (`/create-app`)
2. **[DONE]** Add Infrastructure Setup UI flow (`/infra-setup`)
3. **[DONE]** Implement Service Account JSON Auth for GCP APIs
4. **[DONE]** Implement GCP API Enablement + e2-micro VM Provisioning via JWT auth
5. **[DONE]** Add Discord configuration UI step
6. *[BLOCKED]* Fix Firebase env vars (User must run `npm run setup`)
7. *[TODO]* Implement GitHub OAuth + repo creation
8. *[TODO]* Finalize App Template generation

### Phase 2: Kimaki Listener (⏳ PENDING)
1. Update existing Kimaki code for new architecture
2. Add GitHub Actions API trigger (`workflow_dispatch`)
3. Add Discord command parsing
4. Test webhook integration
5. Implement endpoints for web UI to communicate with Kimaki (e.g. provisioning Discord bots)

### Phase 3: GitHub Actions Workflow (⏳ PENDING)
1. Create agent workflow template (`.github/workflows/agent.yml`)
2. Add Multi-Agent pipeline (Architect, Critic, Coder, Verifier)
3. Write agent system prompts (`.github/agent-prompts/`)
4. Automate adding these to user repos during provisioning

### Phase 4: End-to-End Testing (⏳ PENDING)
1. Test full user flow in dev mode
2. Verify Discord commands work
3. Verify deployments trigger on PR/release
4. Verify rate limiting mechanisms work

---

## 11. Current Status & Known Issues

1. **Authentication:** The app is deployed to `agentbase-8c022.web.app` but Firebase authentication is broken in production because `.env.local` was pushed with placeholder values (`your_api_key_here`). **Fix:** Run `npm run setup` locally and redeploy.
2. **Infra Setup:** The `/infra-setup` page is fully functional. It successfully takes a GCP Service Account JSON key, exchanges it for an OAuth token, enables required GCP APIs (Compute, Resource Manager, Service Usage), and provisions the Kimaki listener VM (e2-micro) autonomously.
3. **Kimaki API:** Step 7 in `/infra-setup` calls out to the Kimaki VM (`http://<vm_ip>:3000/api/create-discord-bot`) which doesn't exist yet on the VM side. Needs Phase 2 completion.

---

## 11. File Structure

```
secureagentbase/
├── src/
│   ├── infra-setup.jsx      # GCP + GitHub provisioning UI
│   ├── github-callback.jsx  # OAuth callback handler
│   ├── create-app.jsx       # "Create New App" flow
│   └── ...
├── kimaki/
│   ├── src/index.js         # Discord listener
│   ├── Dockerfile
│   └── scripts/
│       └── setup-vm.sh      # VM startup (reference)
└── .github/
    └── workflows/
        ├── agent.yml        # Multi-agent pipeline
        ├── staging-deploy.yml
        └── prod-deploy.yml
```

---

## 12. Open Questions

- [ ] Discord bot creation: Manual or API-based?
- [ ] App template: Clone from template or start empty?
- [ ] Custom domains: In scope or Firebase defaults only?
- [ ] Framework updates: How to sync framework updates to user repos?
