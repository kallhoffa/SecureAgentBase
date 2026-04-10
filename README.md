# SecureAgentBase

A React + Firebase application framework designed for autonomous agent deployment. Includes authentication, a Q&A feature (posts with replies), and an "Infrastructure Setup" flow for automating GCP and GitHub resources.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run setup (REQUIRED)
# This will configure Firebase, create projects, and generate .env.local
npm run setup

# 3. Start development server
npm run dev
```

> **⚠️ IMPORTANT**: You *must* run `npm run setup` before deploying or testing authentication. If `.env.local` contains placeholder values like `your_api_key_here`, Firebase Auth will fail with a 400 Bad Request error.

## What's Included

- **React 19** with Vite for fast development
- **Firebase Authentication** (email/password + Google)
- **Firestore** for real-time data
- **Infrastructure Setup Flow** (`/infra-setup`) - 7-step automated wizard:
  1. Account (Firebase Auth)
  2. Service Account (GCP JSON key upload)
  3. GCP Project (select/create project)
  4. Firebase Setup (staging + production configs)
  5. GitHub Auth (PAT for VM access)
  6. Discord Bot (bot token + add to server)
  7. Create VM (automated - forks repo, sets up GitHub Actions, downloads Kimaki, creates Discord channel)
- **TailwindCSS** for styling
- **GitHub Actions** CI/CD for automated deployment

## Project Structure

```
src/
├── posts.jsx           # Home page - list all posts
├── post.jsx            # Single post view + replies
├── infra-setup.jsx     # Automated infrastructure provisioning wizard
├── create-app.jsx      # New app creation flow
├── github-callback.jsx # OAuth handler
├── login.jsx          # Sign in page
├── profile.jsx        # User profile page
├── firestore-utils/
│   ├── auth-context.jsx    # Firebase auth provider
│   └── post-storage.js     # Post/reply CRUD
└── framework/              # Reusable framework code
```

## Deployment

### Staging (Automatic)
Push to `main` branch → CI runs tests → Deploys to staging automatically.

Alternatively, deploy manually:
```bash
firebase use staging
firebase deploy --only hosting,firestore
```

### Production
Create a GitHub release:
```bash
git tag v0.1.0
git push origin v0.1.0
```

## Customization

### Change App Name
Edit `src/navigation-bar.jsx` and `index.html`

### Customize Posts/Replies
- `src/posts.jsx` - Post list page
- `src/post.jsx` - Single post view
- `src/firestore-utils/post-storage.js` - Data layer

### Firestore Rules
Edit `firestore.rules` to customize permissions

## Documentation

- [AGENTS.md](./AGENTS.md) - Developer guide for agents
- [LIFECYCLE.md](./LIFECYCLE.md) - Engineering philosophy

## VM Package Bundle (Fast Deployment)

The infra-setup wizard includes an optional fast deployment mode that downloads pre-bundled packages from GCS instead of installing via apt/npm. This can reduce VM setup time by ~60%.

### GPG Signing & Automated Bundle Updates

To ensure bundle integrity, packages are signed with GPG. The bundle is automatically updated via GitHub Actions.

#### One-Time Setup

1. **Generate GPG key pair:**
   ```bash
   gpg --batch --gen-key <<EOF
   Key-Type: 1
   Key-Length: 4096
   Subkey-Type: 1
   Subkey-Length: 4096
   Name-Real: SecureAgent Bundle Signer
   Name-Email: bundles@example.com
   Expire-Date: 1y
   %no-protection
   %commit
   EOF
   ```

2. **Export keys:**
   ```bash
   gpg --armor --export bundles@example.com > public.gpg
   gpg --armor --export-secret-key bundles@example.com > private.gpg
   ```

3. **Create GCS bucket:**
   ```bash
   gsutil mb gs://secureagent-base-bundles
   gsutil iam ch allUsers:objectViewer gs://secureagent-base-bundles
   ```

4. **Create service account for GCS uploads:**
   ```bash
   gcloud iam service-accounts create bundle-uploader \
     --display-name="Bundle Uploader"
   
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:bundle-uploader@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/storage.objectAdmin"
   
   gcloud iam service-accounts keys create bundle-uploader.json \
     --iam-account=bundle-uploader@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

5. **Add GitHub Secrets:**
   - `GPG_PRIVATE_KEY`: Contents of private.gpg
   - `GPG_PASSPHRASE`: Empty or your passphrase
   - `GCS_BUCKET`: secureagent-base-bundles
   - `GCP_SA_KEY`: Contents of bundle-uploader.json

6. **Extract public key for embedding:**
   ```bash
   cat public.gpg | tr -d '\n' | sed 's/BEGIN PGP PUBLIC KEY BLOCK/BEGIN PGP PUBLIC KEY BLOCK/'
   # Add this to BUNDLE_SIGNER_KEY constant in infra-setup.jsx
   ```

#### GitHub Actions Workflow

Create `.github/workflows/update-bundle.yml`:

```yaml
name: Update Package Bundle

on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * 0'  # Weekly (Sunday midnight)

jobs:
  build-and-sign:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Import GPG key
        run: |
          echo "$GPG_PRIVATE_KEY" | gpg --import --no-tty

      - name: Set up GCS auth
        run: |
          echo '$GCP_SA_KEY' > /tmp/gcs-sa.json
          gcloud auth activate-service-account --key-file=/tmp/gcs-sa.json

      - name: Build bundle
        run: |
          docker run --rm -v $PWD/bundle:/output debian:stable bash -c "
            apt-get update && apt-get install -y dpkg-dev
            mkdir -p /output/packages
            cd /var/cache/apt/archives
            apt-get download nodejs npm git curl wget gnupg jq ca-certificates apt-transport-https
            cp *.deb /output/packages/
          "

      - name: Create bundle
        run: |
          tar -czvf debian-packages.tar.gz bundle/packages/

      - name: Sign bundle
        run: |
          gpg --batch --yes --pinentry-mode loopback \
              --passphrase "$GPG_PASSPHRASE" \
              --armor --detach-sign \
              --local-user bundles@example.com \
              debian-packages.tar.gz

      - name: Upload to GCS
        run: |
          gsutil cp debian-packages.tar.gz gs://$GCS_BUCKET/
          gsutil cp debian-packages.tar.gz.asc gs://$GCS_BUCKET/
```

#### Bundle Contents

The bundle includes pre-downloaded .deb packages for:
- nodejs
- npm
- git
- curl
- wget
- gnupg
- jq
- ca-certificates
- apt-transport-https

## License

Apache 2.0

---

## TODO

### High Priority
- [ ] **End-to-end testing** - Test with real GCP/Firebase/GitHub/Discord integration
- [ ] **Document bundle setup** - Users should build their own bundles. Don't rely on maintainer's GCS bucket for security/trust reasons
- [ ] **Add bundle download to workflows** - Add step to deploy workflows for faster VM startup. Users configure their own `GCS_BUCKET` secret

### Known Issues
- ⚠️ Secrets embedded in GCP VM metadata (visible in Console/logs)
- ⚠️ Weak passphrase requirements (min 4 characters, no strength validation)
- ⚠️ No unit tests (only placeholder test exists)
- ⚠️ `infra-setup.jsx` is 3400+ lines, needs refactoring
- ⚠️ No rate limiting on auth endpoints
