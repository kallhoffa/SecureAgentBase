---
name: infra-setup
description: SecureAgentBase infrastructure setup wizard and CLI. Use when provisioning a new VM, creating or connecting a Google Cloud project, creating a service account, configuring Firebase apps, setting up OIDC Workload Identity Federation, uploading GitHub repo variables/secrets, or debugging the VM startup flow. Explains the wizard steps and what each automation does.
---

# Infra Setup (SecureAgentBase Wizard + CLI)

SecureAgentBase provisions user agent infrastructure through a client-side wizard (`src/infra-setup.tsx` with step components in `src/framework/infra-setup/steps/`) and a CLI (`cli/`). This skill explains the flow, the automations, and the failure modes.

## Modes

- `VITE_APP_MODE=true` → SecureAgentBase product mode: landing page, infra-setup wizard, create-app. Only set in the `kallhoffa/SecureAgentBase` repo (as a GitHub variable).
- `VITE_APP_MODE` unset → template mode: generic "Welcome to {VITE_APP_NAME}" dashboard, Tasks demo, no infra-setup.

## Wizard steps

1. **Intro** — what's being set up.
2. **Google Cloud account** — connect via Google OAuth (short-lived, 1-hour token, never persisted to Firestore). If the token is missing/expired, the "Connect Google Cloud Account" button re-authenticates instantly. Provides programmatic auto-generation: pick a project (or `+ Create New Project`) and it creates the service account, assigns all six required IAM permissions, generates a JSON key, and loads it.
3. **GitHub setup** — repo + PAT.
4. **Firebase configuration** — queries the Firebase Management API to list or create the web app and fetch its SDK config, populating both staging and production projects. `+ Create New Project` works here too.
5. **OIDC / Workload Identity Federation** — creates GCP WIF infrastructure and uploads GitHub repo variables.
6. **Discord** — pasting the bot token auto-extracts the Client ID (base64 prefix decode); invite link pre-bakes `scope=bot applications.commands`.
7. **Deploy** — creates the VM with the startup script.

## Startup script mechanics

The startup script (`shared/startup-script.sh`, mirrored in `cli/src/lib/startup-script.sh` — keep in sync) runs on the VM and:

- Reads all config from **VM metadata** (`encryption_passphrase`, `github_repo`, `firebase_staging`, `firebase_production`, `github_pat`, `discord_bot_token`, `discord_guild_id`, `gcp_wif_provider`, `gcp_sa_staging`, `gcp_sa_production`, `gcp_sa_key`).
- Sanitizes metadata curls against HTML error responses (a failed curl returns a 404 HTML page that corrupts systemd parsers — strip it with Bash indirect-reference sanitization).
- Installs dependencies (`node`, `unzip`, etc.), installs `kimaki`, and configures the `kimaki.service` systemd unit. The unit must use `EnvironmentFile=/root/.kimaki/env` (chmod 600) — **never inline `Environment=` with secrets**, and never write secrets, project IDs, or metadata values to `/dev/ttyS0` (serial console is world-readable via GCP Console).
- Clones `$GITHUB_REPO` (metadata), clears `.git`, runs a fresh `git init`, and pushes an initial commit. Falls back to a bare `README.md` repo if the clone fails.
- Installs agent skills globally (see `.opencode/skills/README.md`) and writes a `CONTEXT.md` stub.

## Key failure modes (all fixed historically)

- Missing `encryption_passphrase` metadata → startup curl returns 404 HTML → systemd unit corrupted. Always pass it.
- `ExecStart` without a valid subcommand → service exits 1. The CLI runs with no subcommand.
- Missing `unzip` → `bun` installer crashes.
- Missing `KIMAKI_BOT_TOKEN` env var → kimaki falls back to interactive TTY onboarding → systemd daemon crashes. Export `Environment="KIMAKI_BOT_TOKEN=$DISCORD_BOT_TOKEN"` in the unit (via EnvironmentFile).

## OIDC / GitHub variable notes

- Public Firebase configs are uploaded as **GitHub Actions Variables** (`/repos/{owner}/{repo}/actions/variables`), read back in workflows via the `vars` context, **not** `secrets`.
- Uploading/replacing repo variables can return **204 No Content** with an empty body — don't call `.json()` on it.
- OIDC credentials are created asynchronously; pass the created data straight to the vars upload (do not read it back from React state in the same handler).
- Deployments target projects explicitly (`--project ${{ vars.FIREBASE_PROJECT_ID_... }}`), never local alias flags like `-P staging`.
