# SecureAgent Brain

The ephemeral Cloud Run container that executes the Multi-Agent Pipeline (MAS) for autonomous code generation.

## Overview

The Brain is triggered by the Kimaki Discord Listener when a user submits a prompt. It runs in a 4GB+ Cloud Run container with:
- Node.js 20
- TypeScript Language Server (LSP)
- ESLint
- Anthropic Claude SDK
- GitHub Octokit

## Architecture

```
User (Discord) → Kimaki Listener → Cloud Run (Brain) → GitHub PR
```

## Agents

### The Architect
- Receives user prompt
- Creates `specification.md`
- Rejects insecure designs

### The Critic
- Adversarial review of spec
- Checks security & sustainability
- Blocks bad designs

### The Coder
- Implements approved spec
- Uses project conventions
- One retry on test failure

### The Verifier
- Runs `npm test` / `npm run build`
- Reports pass/fail to Coder

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `GITHUB_TOKEN` | Yes | GitHub token with repo access |
| `REPO_OWNER` | Yes | Repository owner |
| `REPO_NAME` | Yes | Repository name |
| `WORKING_BRANCH` | No | Branch for AI changes (default: feat/ai-feature) |

## Deployment

```bash
# Build and deploy to Cloud Run
gcloud builds submit --config cloudbuild.yaml

# Or manually
docker build -t gcr.io/PROJECT_ID/secureagent-brain .
docker push gcr.io/PROJECT_ID/secureagent-brain
gcloud run deploy secureagent-brain \
  --image gcr.io/PROJECT_ID/secureagent-brain \
  --platform managed \
  --region us-central1 \
  --memory 4Gi \
  --cpu 2 \
  --min-instances 0 \
  --max-instances 1
```

## Local Testing

```bash
ANTHROPIC_API_KEY=sk-... \
GITHUB_TOKEN=ghp_... \
REPO_OWNER=user \
REPO_NAME=myapp \
node src/index.js "Add a login page"
```

## Security

- Container runs with `--memory=4Gi` to prevent OOM
- Ephemeral: starts on demand, terminates after execution
- GitHub App tokens provide repo-scoped access (not full account)
- All commits happen on feature branches, never direct to main
