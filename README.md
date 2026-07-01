# SecureAgentBase

A React + Firebase application framework designed for autonomous agent deployment. Ships with authentication, Firestore CRUD, an automated GCP/GitHub infra-setup wizard, and a generic dashboard + Tasks demo so a fresh app boots with real content instead of a blank page.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run setup (REQUIRED) — configures Firebase, creates projects, generates .env.local
npm run setup

# 3. Start development server
npm run dev
```

> **IMPORTANT**: Run `npm run setup` before deploying or testing authentication. If `.env.local` contains placeholder values like `your_api_key_here`, Firebase Auth will fail with a 400 Bad Request error.

## What's Included

- **React 19** with Vite for fast development
- **Firebase Authentication** (email/password + Google)
- **Firestore** for real-time data
- **TailwindCSS** for styling
- **Sentry** error tracking (optional)
- **GitHub Actions** CI/CD with OIDC auth (no long-lived secrets)
- **Infrastructure Setup Flow** (`/infra-setup`) — 7-step automated wizard that creates the GCP service accounts, Firebase projects, WIF/OIDC provider, GitHub variables, and a Kimaki-managed VM, end-to-end from the browser
- **Two render modes** (driven by `VITE_APP_MODE`):
  - `true` → the SecureAgentBase product (landing page, infra-setup wizard, create-app flow)
  - unset → template mode (generic "Welcome to {app name}" dashboard + Tasks CRUD demo)

## Project Structure

```
src/
├── App.tsx                     # Routes (switches on VITE_APP_MODE)
├── index.tsx                   # Entry: Firebase init, Sentry, providers
├── firebase.ts                 # Firebase config (reads suffixed env vars)
├── posts.tsx                   # Landing page (app mode)
├── post.tsx                    # Single post + replies
├── compose-post.tsx
├── compose-reply.tsx
├── about.tsx
├── login.tsx / signup.tsx
├── profile.tsx
├── navigation-bar.tsx
├── environment-banner.tsx
├── infra-setup.tsx             # 7-step wizard (trimmed; steps extracted)
├── create-app.tsx
├── github-callback.tsx
├── template/                   # Template mode pages
│   ├── index.jsx
│   └── pages/
│       ├── Dashboard.jsx       # Generic landing
│       └── Tasks.jsx           # Firestore CRUD demo
├── framework/
│   ├── config/
│   ├── firestore-utils/
│   │   └── remote-config.ts
│   ├── hooks/
│   └── infra-setup/            # Extracted wizard modules
│       ├── api.ts              # GCP + GitHub API helpers, OIDC setup
│       ├── crypto.ts           # Config encryption (WebCrypto)
│       ├── scripts.ts          # VM startup script + Cloud Shell script
│       └── steps/              # Step1–Step7 + StepHeader components
└── firestore-utils/
    ├── auth-context.tsx
    └── notification-context.tsx
```

## Build / Test / Lint

```bash
npm run dev          # dev server (port 3000)
npm run build        # production build → build/
npm run preview      # preview production build
npm run test         # Vitest watch mode
npm run test:ci      # Vitest once (CI)
npm run e2e          # Playwright e2e
npm run e2e:smoke    # smoke tests only
npm run lint         # ESLint on src/
npm run check        # test:ci + lint + build (full)
```

Run a single test: `npm run test -- --filter "test-name-pattern"`

## Deployment

Both stages authenticate to GCP via **Workload Identity Federation (OIDC)** — no long-lived GCP service-account keys in GitHub.

### Staging (automatic on push to `main`)
Build → deploy → smoke tests → full e2e. Hosting: `https://<project-id>-staging.web.app`

Manual:
```bash
firebase deploy --only hosting,firestore --project <staging-project-id>
```

### Production (on GitHub release)
```bash
git tag v0.17.0
git push origin v0.17.0
gh release create v0.17.0 --title "v0.17.0" --notes "..."
```

Hosting: `https://<project-id>.web.app`

## Environment Variables

All prefixed `VITE_` (client-side). The build reads suffixed Firebase config based on `VITE_APP_ENV`:

| Variable | Purpose |
|---|---|
| `VITE_APP_ENV` | `development` \| `staging` \| `production` — selects Firebase config suffix |
| `VITE_FIREBASE_API_KEY_STAGING` / `_PRODUCTION` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN_STAGING` / `_PRODUCTION` | Auth domain |
| `VITE_FIREBASE_PROJECT_ID_STAGING` / `_PRODUCTION` | Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET_STAGING` / `_PRODUCTION` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID_STAGING` / `_PRODUCTION` | Sender ID |
| `VITE_FIREBASE_APP_ID_STAGING` / `_PRODUCTION` | App ID |
| `VITE_FIREBASE_MEASUREMENT_ID_STAGING` / `_PRODUCTION` | GA4 measurement ID |
| `VITE_APP_MODE` | `true` → SecureAgentBase product; unset → template mode |
| `VITE_APP_NAME` | Title shown in nav + dashboard |
| `VITE_SENTRY_DSN` | Sentry DSN (optional) |

See `.env.example` for the full template. In CI, these are injected from GitHub Actions **variables** (not secrets — Firebase web config is client-side by design).

## Customization

- **App name / title**: set `VITE_APP_NAME` (cosmetic only) — mode is controlled by `VITE_APP_MODE`
- **Template dashboard + Tasks**: edit `src/template/pages/Dashboard.jsx` and `Tasks.jsx`
- **Posts / replies**: `src/posts.tsx`, `src/post.tsx`, `src/compose-post.tsx`, `src/compose-reply.tsx`
- **Firestore rules**: `firestore.rules`

## VM Package Bundle (Fast Deployment)

The infra-setup wizard includes an optional fast-deployment mode that downloads a pre-bundled, GPG-signed `.tar.gz` of Debian packages from GCS instead of installing via `apt`. This cuts VM startup time roughly in half.

### GPG Signing & Automated Bundle Updates

Packages are signed with GPG for integrity. The bundle is rebuilt weekly via GitHub Actions.

#### One-Time Setup

1. **Generate GPG key pair:**
   ```bash
   gpg --batch --gen-key <<EOF
   Key-Type: 1
   Key-Length: 4096
   Subkey-Type: 1
   Subkey-Length: 4096
   Name-Real: SecureAgent Bundle Signer
   Name-Email: bundles@secureagent.app
   Expire-Date: 1y
   %no-protection
   %commit
   EOF
   ```

2. **Export keys:**
   ```bash
   gpg --armor --export bundles@secureagent.app > public.gpg
   gpg --armor --export-secret-key bundles@secureagent.app > private.gpg
   ```

3. **Create GCS bucket:**
   ```bash
   gsutil mb gs://secureagent-base-bundles
   gsutil iam ch allUsers:objectViewer gs://secureagent-base-bundles
   ```

4. **Create service account for GCS uploads:**
   ```bash
   gcloud iam service-accounts create bundle-uploader --display-name="Bundle Uploader"
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:bundle-uploader@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/storage.objectAdmin"
   gcloud iam service-accounts keys create bundle-uploader.json \
     --iam-account=bundle-uploader@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

5. **Add GitHub secrets:**
   - `GPG_PRIVATE_KEY` — contents of `private.gpg`
   - `GPG_PASSPHRASE` — empty or your passphrase
   - `GCS_BUCKET` — `secureagent-base-bundles`
   - `GCP_SA_KEY` — contents of `bundle-uploader.json`

6. **Embed public key** in `BUNDLE_SIGNER_KEY` constant (`src/framework/infra-setup/scripts.ts`).

#### GitHub Actions Workflow

Create `.github/workflows/update-bundle.yml`:

```yaml
name: Update Package Bundle
on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * 0'  # Weekly (Sunday midnight UTC)
jobs:
  build-and-sign:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Import GPG key
        run: echo "$GPG_PRIVATE_KEY" | gpg --import --no-tty
      - name: Set up GCS auth
        run: |
          echo "$GCP_SA_KEY" > /tmp/gcs-sa.json
          gcloud auth activate-service-account --key-file=/tmp/gcs-sa.json
      - name: Build bundle
        run: |
          docker run --rm -v "$PWD/bundle:/output" debian:stable bash -c "
            apt-get update && apt-get install -y dpkg-dev
            mkdir -p /output/packages
            cd /var/cache/apt/archives
            apt-get download nodejs npm git curl wget gnupg jq ca-certificates apt-transport-https
            cp *.deb /output/packages/
          "
          tar -czvf debian-packages.tar.gz bundle/packages/
      - name: Sign bundle
        run: |
          gpg --batch --yes --pinentry-mode loopback \
              --passphrase "$GPG_PASSPHRASE" \
              --armor --detach-sign \
              --local-user bundles@secureagent.app \
              debian-packages.tar.gz
      - name: Upload to GCS
        run: |
          gsutil cp debian-packages.tar.gz gs://$GCS_BUCKET/
          gsutil cp debian-packages.tar.gz.asc gs://$GCS_BUCKET/
```

#### Bundle Contents

Pre-downloaded `.deb` packages: `nodejs`, `npm`, `git`, `curl`, `wget`, `gnupg`, `jq`, `ca-certificates`, `apt-transport-https`

> Users should build and host their own bundle rather than relying on the maintainer's GCS bucket for trust/security reasons.

## Documentation

- [AGENTS.md](./AGENTS.md) — developer guide for agents
- [LIFECYCLE.md](./LIFECYCLE.md) — engineering philosophy

## License

Apache 2.0 — see [LICENSE](./LICENSE)