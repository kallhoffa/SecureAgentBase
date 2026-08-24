#!/bin/bash
# SecureAgentBase VM Startup Script
# Shared between web wizard (src/framework/infra-setup/scripts.ts) and CLI (cli/src/lib/startup-script.ts)
# Keep in sync — do not edit one without the other.
set +e
export HOME=/root
export DEBIAN_FRONTEND=noninteractive
# Fetch GitHub repo from metadata or use fallback
GITHUB_REPO=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/github_repo" -H "Metadata-Flavor: Google")
if [ -n "$GITHUB_REPO" ]; then
  REPO_OWNER=$(echo "$GITHUB_REPO" | cut -d'/' -f1)
  REPO_NAME=$(echo "$GITHUB_REPO" | cut -d'/' -f2)
  if [[ ! "$REPO_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || [[ ! "$REPO_OWNER" =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "WARNING: Invalid github_repo metadata, using SecureAgentBase as default"
    REPO_OWNER="kallhoffa"
    REPO_NAME="SecureAgentBase"
  fi
else
  echo "WARNING: No github_repo metadata set, using SecureAgentBase as default"
  REPO_OWNER="kallhoffa"
  REPO_NAME="SecureAgentBase"
fi
FIREBASE_STAGING=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/firebase_staging" -H "Metadata-Flavor: Google")
FIREBASE_PRODUCTION=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/firebase_production" -H "Metadata-Flavor: Google")
DISCORD_GUILD_ID=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/discord_guild_id" -H "Metadata-Flavor: Google")
GCP_WIF_PROVIDER=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcp_wif_provider" -H "Metadata-Flavor: Google")
GCP_SA_STAGING=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcp_sa_staging" -H "Metadata-Flavor: Google")
GCP_SA_PRODUCTION=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcp_sa_production" -H "Metadata-Flavor: Google")
FIREBASE_STAGING_CONFIG=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/firebase_staging_config" -H "Metadata-Flavor: Google")
FIREBASE_PRODUCTION_CONFIG=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/firebase_production_config" -H "Metadata-Flavor: Google")
VITE_APP_NAME=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/vite_app_name" -H "Metadata-Flavor: Google")
# Secret values (GITHUB_PAT / DISCORD_BOT_TOKEN) are NOT carried in VM metadata —
# they are fetched from Secret Manager below via the metadata-server identity.
# The agent SA is identity-only (map #36 decision #6): no gcp_sa_key
# metadata, no key file on disk — the SA authenticates via the metadata server.

# Clean up any potential HTML responses from failed requests or unconfigured metadata
for var in FIREBASE_STAGING FIREBASE_PRODUCTION DISCORD_GUILD_ID GCP_WIF_PROVIDER GCP_SA_STAGING GCP_SA_PRODUCTION FIREBASE_STAGING_CONFIG FIREBASE_PRODUCTION_CONFIG VITE_APP_NAME; do
  val=${!var}
  if [[ "$val" =~ "<html" || "$val" =~ "<!" || "$val" =~ "<HTML" ]]; then
    eval "$var=\"\""
  fi
done

# Idempotency guard — GCP re-runs the startup script on EVERY boot, not just first boot.
# Skip all provisioning steps if this VM was already set up, so reboots are harmless.
if [ -f /root/.kimaki/.provisioned ]; then
  echo "Already provisioned, skipping startup script"
  echo "ALREADY_PROVISIONED" > /dev/ttyS0 2>/dev/null || true
  exit 0
fi

echo "REPO_OWNER=$REPO_OWNER | FIREBASE_STAGING=$FIREBASE_STAGING"

# Disk space guard — warn via serial console well before the disk fills up.
# Large installs (apt, node tarball, npm -g) silently fail with ENOSPC at 100%.
check_disk() {
  DISK_USED_PCT=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
  DISK_AVAIL_MB=$(df -P / | awk 'NR==2 {print int($4/1024)}')
  if [ -n "$DISK_USED_PCT" ] && [ "$DISK_USED_PCT" -ge 85 ]; then
    echo "KIMAKI_DISK_ALERT:${DISK_USED_PCT}pct used on root filesystem (${DISK_AVAIL_MB} MB free)" > /dev/ttyS0 2>/dev/null || true
    echo "WARNING: disk ${DISK_USED_PCT}% full, only ${DISK_AVAIL_MB} MB free" >&2
  fi
}
check_disk

sudo apt-get update -y > /dev/null 2>&1 || true
sudo apt-get install -y curl git jq apt-transport-https ca-certificates gnupg2 ufw unzip > /dev/null 2>&1 || true

# Swap file — small VMs (e.g. e2-small, 3.8 GB RAM) ship with NO swap, so a
# memory spike (npm installs, vitest, vite builds, opencode) can hard-freeze
# the box: the OOM killer cannot make progress without swap and the kernel
# stalls with no console output. Create a 2G swapfile once; it persists across
# reboots via /etc/fstab, and a re-run of this script (every boot) is a no-op.
if [ ! -f /swapfile ]; then
  echo "Creating 2G swapfile..."
  sudo fallocate -l 2G /swapfile 2>/dev/null \
    || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null \
    || true
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile > /dev/null 2>&1 || true
  sudo swapon /swapfile > /dev/null 2>&1 || true
  grep -q '^/swapfile' /etc/fstab 2>/dev/null \
    || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
fi
# Idempotent: if the file pre-existed but swap is currently off, turn it on.
grep -q '^/swapfile' /proc/swaps 2>/dev/null || sudo swapon /swapfile > /dev/null 2>&1 || true
grep -q '^/swapfile' /proc/swaps 2>/dev/null && echo "Swap enabled: $(grep '^/swapfile' /proc/swaps)"

# Upgrade git to >= 2.32 from the git-core PPA. The default Ubuntu 20.04/22.04
# repos ship git <= 2.30, which lacks `git add --sparse` — the opencode/kimaki
# agent snapshot flow fails every session with exit 129: "unknown option 'sparse'".
# Hardened keyring + sources.list.d pattern, same as the GitHub CLI install below.
# If the PPA fetch fails, everything is `|| true` and the default-repo git stays.
sudo mkdir -p /usr/share/keyrings
curl -fsSL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xE1DD270288B4E6030699E45FA1715D88E1DF1F24" | sudo gpg --dearmor -o /usr/share/keyrings/git-core-ppa.gpg > /dev/null 2>&1 || true
UBUNTU_CODENAME=$(. /etc/os-release && echo "${VERSION_CODENAME:-focal}")
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/git-core-ppa.gpg] https://ppa.launchpadcontent.net/git-core/ppa/ubuntu ${UBUNTU_CODENAME} main" | sudo tee /etc/apt/sources.list.d/git-core-ppa.list > /dev/null 2>&1 || true
sudo apt-get update -y > /dev/null 2>&1 || true
# Re-install so apt picks the higher PPA version (upgrades the git from above).
sudo apt-get install -y git > /dev/null 2>&1 || true

# Fetch secrets from Secret Manager via the metadata-server identity (map #36).
# No secret values ride in VM metadata; the VM's attached service account holds
# per-secret roles/secretmanager.secretAccessor. IAM grants are eventually
# consistent — fresh grants can 403 for several minutes, so retry with backoff.
# A missing secret (404) fails fast: provisioning continues without it, exactly
# as it did when the metadata value was absent.
GCP_PROJECT_ID=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/project/project-id" -H "Metadata-Flavor: Google")
fetch_sm_secret() {
  local secret_id="$1"
  [ -z "$GCP_PROJECT_ID" ] && return 1
  local token
  for i in $(seq 1 14); do
    # --max-time bounds each attempt: a stalled metadata/API endpoint must
    # not hang the boot indefinitely (the retry loop below covers flakes).
    token=$(curl -sf --max-time 15 "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" -H "Metadata-Flavor: Google" | jq -r '.access_token // empty')
    if [ -n "$token" ]; then
      local resp code body
      resp=$(curl -s --max-time 15 -w '\n%{http_code}' -H "Authorization: Bearer $token" \
        "https://secretmanager.googleapis.com/v1/projects/${GCP_PROJECT_ID}/secrets/${secret_id}/versions/latest:access")
      code=$(printf '%s' "$resp" | tail -n1)
      body=$(printf '%s' "$resp" | head -n -1)
      if [ "$code" = "200" ]; then
        printf '%s' "$body" | jq -r '.payload.data // empty' | base64 -d 2>/dev/null
        return 0
      fi
      if [ "$code" = "404" ]; then
        # Secret not configured — do not stall the boot waiting for it.
        return 1
      fi
      # 403/5xx — IAM propagation or transient error, retry with backoff.
    fi
    sleep $((i * 3))
  done
  return 1
}
GITHUB_PAT=$(fetch_sm_secret "github-pat")
DISCORD_BOT_TOKEN=$(fetch_sm_secret "discord-bot-token")
echo "Secrets fetched from Secret Manager: GITHUB_PAT=$([ -n "$GITHUB_PAT" ] && echo set || echo missing) DISCORD_BOT_TOKEN=$([ -n "$DISCORD_BOT_TOKEN" ] && echo set || echo missing)"

# Install Node.js 20.x — pinned binary release with checksum verification
NODE_VERSION="20.18.0"
NODE_TARBALL="node-v${NODE_VERSION}-linux-x64.tar.gz"
curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}" -o "/tmp/${NODE_TARBALL}" > /dev/null 2>&1 || true
curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/SHASUMS256.txt > /dev/null 2>&1 || true
if (cd /tmp && sha256sum -c SHASUMS256.txt --ignore-missing --status 2>/dev/null); then
  tar -xzf "/tmp/${NODE_TARBALL}" -C /usr/local --strip-components=1 2>/dev/null
  export PATH="/usr/local/bin:$PATH"
  echo "Node.js ${NODE_VERSION} installed from binary"
else
  echo "WARNING: Node.js checksum verification failed, falling back to apt"
  apt-get install -y nodejs > /dev/null 2>&1 || true
fi

# Install GitHub CLI
type gh >/dev/null 2>&1 || (curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt-get update -y > /dev/null 2>&1 && sudo apt-get install -y gh > /dev/null 2>&1) || true

# Install Kimaki (skip if already installed — re-running npm -g installs crashes with ENOTEMPTY)
if command -v kimaki >/dev/null 2>&1; then
  echo "kimaki already installed, skipping global install"
else
  npm install -g kimaki@latest > /dev/null 2>&1 || true
fi

# Clone the SecureAgentBase template repository into Kimaki's projects dir
# so kimaki can detect/register it as a project
mkdir -p /root/.kimaki/projects
cd /root/.kimaki/projects

# Force HTTP/1.1 to avoid GitHub HTTP/2 curl 92 errors on large repos
git config --global http.version HTTP/1.1
git config --global http.postBuffer 524288000

# Reuse an existing clone on re-runs ("destination path already exists" otherwise)
if [ -d "$REPO_NAME/.git" ]; then
  echo "Project already cloned, reusing existing checkout"
  cd "$REPO_NAME"
  REPO_CLONED=true
else
  REPO_CLONED=false
  for i in 1 2 3; do
    if git clone --depth 1 "https://github.com/$REPO_OWNER/$REPO_NAME.git" "$REPO_NAME" > /dev/null 2>&1; then
      REPO_CLONED=true
      break
    fi
    sleep 5
  done

  # If clone failed, fall back to creating directory manually
  if [ "$REPO_CLONED" != "true" ]; then
    mkdir -p "$REPO_NAME"
    cd "$REPO_NAME"
    git init
    echo "placeholder" > README.md
    cat > .gitignore << 'GITEOF'
node_modules/
.env*
dist/
build/
*.log
GITEOF
  else
    cd "$REPO_NAME"
    rm -rf .git
    git init
  fi
fi

git checkout -b main

# Clean up wizard-specific files — users don't need the infra setup wizard
rm -rf src/infra-setup.tsx src/create-app.tsx
rm -rf src/framework/infra-setup/
rm -rf src/admin/
rm -rf cli/
rm -rf tests/e2e/wizard.spec.js
rm -rf src/_tests_/WizardSteps.test.jsx src/_tests_/create-app.test.tsx src/_tests_/StepHeader.test.jsx src/_tests_/api.test.ts src/_tests_/crypto.test.ts src/_tests_/scripts.test.ts
rm -f WIZARD_DEV_NOTES.md

# Fix App.tsx: remove wizard/admin imports and routes
if [ -f src/App.tsx ]; then
  # Remove import lines for InfraSetup, CreateApp, AdminPanel
  sed -i "/import InfraSetup from '.\\/infra-setup';/d" src/App.tsx
  sed -i "/import CreateApp from '.\\/create-app';/d" src/App.tsx
  sed -i "/import AdminPanel from '.\\/admin\\/AdminPanel';/d" src/App.tsx
  # Remove Route elements for /infra-setup, /create-app, /admin/*
  sed -i '/<Route path="\\/infra-setup".*\\/>/d' src/App.tsx
  sed -i '/<Route path="\\/create-app".*\\/>/d' src/App.tsx
  sed -i '/<Route path="\\/admin/d' src/App.tsx
  # Clean up orphaned {isAppMode && ()} blocks left behind after Route deletion
  perl -i -0pe 's/\\{isAppMode && \\(\\s*\\n\\s*\\)\\}//gs' src/App.tsx
  echo "App.tsx cleaned of wizard/admin references"
fi

# Fix navigation-bar.tsx: remove admin link and useIsAdmin import
if [ -f src/navigation-bar.tsx ]; then
  sed -i "/import { useIsAdmin } from '.\\/admin\\/useIsAdmin';/d" src/navigation-bar.tsx
  sed -i "/const { isAdmin } = useIsAdmin(db);/d" src/navigation-bar.tsx
  # Delete from {isAdmin && to the next closing )} on its own line
  sed -i '/{isAdmin &&/,/^[[:space:]]*)}/d' src/navigation-bar.tsx
  echo "navigation-bar.tsx cleaned of admin references"
fi

# Write a CONTEXT.md scaffold for the domain-modeling/setup-project skills
if [ ! -f CONTEXT.md ]; then
  cat > CONTEXT.md << 'CONTEXTEOF'
# Context

Glossary of this project's domain terms, maintained by the `domain-modeling` skill. Architectural decisions live in `docs/adr/`; run `/setup-project` to scaffold the issue tracker and ADR workflow.
CONTEXTEOF
fi

# Configure git
git config user.email "agent@secureagentbase.com"
git config user.name "SecureAgent Manager"

# Add and commit all files
git add .
git commit -m "Initial commit of SecureAgentBase template"

# Create GitHub repo and push
# Write diagnostics to /dev/ttyS0 (serial port 1) for external debugging
# and compact markers at the end that survive buffer overflow
check_disk
PUSH_RESULT="NOT_ATTEMPTED"
if [ -n "$GITHUB_PAT" ]; then
  # Clear stale gh credentials first — a revoked PAT or old token causes 401s that
  # persist across boots because gh caches the failed login state.
  gh auth logout --hostname github.com 2>/dev/null || true
  echo "$GITHUB_PAT" | gh auth login --with-token 2>/dev/null
  gh auth setup-git 2>/dev/null || true

  # Probe PAT permissions — write a compact summary to serial so diagnostics
  # can confirm the PAT has repo + actions scope (survives buffer overflow)
  PAT_PERMS=""
  if gh api repos/"${REPO_OWNER}/${REPO_NAME}" >/dev/null 2>&1; then
    PAT_PERMS="repo:ok"
  else
    PAT_PERMS="repo:FAIL"
  fi
  if gh variable list -R "${REPO_OWNER}/${REPO_NAME}" >/dev/null 2>&1; then
    PAT_PERMS="${PAT_PERMS},actions:ok"
  else
    PAT_PERMS="${PAT_PERMS},actions:FAIL"
  fi
  echo "PAT_PERMS: ${PAT_PERMS}" > /dev/ttyS0 2>/dev/null || true

      # Create new repo or force-push if it already exists
      if gh repo view "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null; then
        git remote remove origin 2>/dev/null || true
        git remote add origin "https://github.com/${REPO_OWNER}/${REPO_NAME}.git" || true
        if git push -u origin main --force 2>&1; then
          PUSH_RESULT="PUSH_OK"
        else
          PUSH_RESULT="PUSH_FAILED"
        fi
      else
        if gh repo create "${REPO_OWNER}/${REPO_NAME}" --public --source=. --push 2>&1; then
          PUSH_RESULT="CREATE_OK"
        else
          # Fallback: try force-push (repo may exist but PAT can't view it)
          git remote remove origin 2>/dev/null || true
          git remote add origin "https://github.com/${REPO_OWNER}/${REPO_NAME}.git" || true
          if git push -u origin main --force 2>&1; then
            PUSH_RESULT="FALLBACK_PUSH_OK"
          else
            PUSH_RESULT="ALL_PUSH_FAILED"
          fi
        fi
      fi

      # Write push result marker to serial port (compact, survives buffer overflow)
      echo "PUSH_RESULT=$PUSH_RESULT" > /dev/ttyS0 2>/dev/null || true

      # Set GitHub variables
      gh auth status 2>/dev/null || true

  # Set Firebase project IDs as VARIABLES (workflow reads vars.FIREBASE_PROJECT_ID_STAGING)
  gh variable set FIREBASE_PROJECT_ID_STAGING --body "$FIREBASE_STAGING" -R "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || echo "WARN: Failed to set FIREBASE_PROJECT_ID_STAGING"
  gh variable set FIREBASE_PROJECT_ID_PRODUCTION --body "$FIREBASE_PRODUCTION" -R "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || echo "WARN: Failed to set FIREBASE_PROJECT_ID_PRODUCTION"

  # Set OIDC variables (required by google-github-actions/auth)
  [ -n "$GCP_WIF_PROVIDER" ] && gh variable set GCP_WIF_PROVIDER --body "$GCP_WIF_PROVIDER" -R "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true
  [ -n "$GCP_SA_STAGING" ] && gh variable set GCP_SA_STAGING --body "$GCP_SA_STAGING" -R "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true
  [ -n "$GCP_SA_PRODUCTION" ] && gh variable set GCP_SA_PRODUCTION --body "$GCP_SA_PRODUCTION" -R "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true

  # Set VITE app variables
  [ -n "$VITE_APP_NAME" ] && gh variable set VITE_APP_NAME --body "$VITE_APP_NAME" -R "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true

  # Set Firebase config variables from JSON configs (parse with jq)
  # Convert camelCase field names to SCREAMING_SNAKE_CASE for GitHub variable names
  if [ -n "$FIREBASE_STAGING_CONFIG" ] && echo "$FIREBASE_STAGING_CONFIG" | jq -e . >/dev/null 2>&1; then
    for field in apiKey authDomain projectId storageBucket messagingSenderId appId measurementId; do
      val=$(echo "$FIREBASE_STAGING_CONFIG" | jq -r ".${field} // empty" 2>/dev/null)
      if [ -n "$val" ]; then
        upper_field=$(echo "${field}" | sed 's/\([a-z]\)\([A-Z]\)/\1_\2/g' | tr '[:lower:]' '[:upper:]')
        gh variable set "FIREBASE_${upper_field}_STAGING" --body "$val" -R "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true
      fi
    done
  fi

  if [ -n "$FIREBASE_PRODUCTION_CONFIG" ] && echo "$FIREBASE_PRODUCTION_CONFIG" | jq -e . >/dev/null 2>&1; then
    for field in apiKey authDomain projectId storageBucket messagingSenderId appId measurementId; do
      val=$(echo "$FIREBASE_PRODUCTION_CONFIG" | jq -r ".${field} // empty" 2>/dev/null)
      if [ -n "$val" ]; then
        upper_field=$(echo "${field}" | sed 's/\([a-z]\)\([A-Z]\)/\1_\2/g' | tr '[:lower:]' '[:upper:]')
        gh variable set "FIREBASE_${upper_field}_PRODUCTION" --body "$val" -R "${REPO_OWNER}/${REPO_NAME}" 2>/dev/null || true
      fi
    done
  fi

  echo "VAR_RESULT=DONE" > /dev/ttyS0 2>/dev/null || true
  echo "GitHub variables set successfully" > /dev/null 2>&1
fi

# Install Kimaki globally and create its configuration
KIMAKI_CONFIG_DIR=/root/.kimaki
mkdir -p $KIMAKI_CONFIG_DIR
echo "$REPO_NAME" > "$KIMAKI_CONFIG_DIR/.project_name"
cat > $KIMAKI_CONFIG_DIR/config.yml << 'KIMAKICONF'
# Kimaki config - auto-generated
openai_api_key: ""
github_token: ""
KIMAKICONF

# Write opencode.json with provider timeout settings (chatty upstream models)
cat > "/root/.kimaki/projects/$REPO_NAME/opencode.json" << 'OPENCODEEOF'
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode-go/kimi-k2.6",
  "provider": {
    "opencode-go": {
      "options": {
        "timeout": 300000,
        "headerTimeout": 120000,
        "chunkTimeout": 120000
      }
    }
  }
}
OPENCODEEOF

# Install agent skills globally — opencode and Claude Code auto-discover these dirs.
SKILLS_DIR=/root/.config/opencode/skills
mkdir -p "$SKILLS_DIR" /tmp/sab-skills-tmp
# 1) Matt Pocock engineering skills (MIT licensed): tdd, code-review, diagnosing-bugs, research, prototype, etc.
if [ ! -d "$SKILLS_DIR/tdd" ] && git clone --depth 1 https://github.com/mattpocock/skills.git /tmp/sab-skills-tmp/matt-skills > /dev/null 2>&1; then
  cp -r /tmp/sab-skills-tmp/matt-skills/skills/engineering/. "$SKILLS_DIR/" 2>/dev/null || true
fi
# 2) SecureAgentBase skills: reuse the local project copy, else clone the template repo.
if [ -d "/root/.kimaki/projects/$REPO_NAME/.opencode/skills" ]; then
  cp -r "/root/.kimaki/projects/$REPO_NAME/.opencode/skills/." "$SKILLS_DIR/" 2>/dev/null || true
elif git clone --depth 1 https://github.com/kallhoffa/SecureAgentBase.git /tmp/sab-skills-tmp/sab > /dev/null 2>&1; then
  cp -r /tmp/sab-skills-tmp/sab/.opencode/skills/. "$SKILLS_DIR/" 2>/dev/null || true
fi
# 3) Claude Code compatibility mirror.
mkdir -p /root/.claude/skills
cp -r "$SKILLS_DIR/." /root/.claude/skills/ 2>/dev/null || true
rm -rf /tmp/sab-skills-tmp

# Write sensitive env vars to a restricted file, referenced by systemd
cat > /root/.kimaki/env << ENVEOF
GITHUB_PAT=$GITHUB_PAT
KIMAKI_BOT_TOKEN=$DISCORD_BOT_TOKEN
DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN
DISCORD_GUILD_ID=$DISCORD_GUILD_ID
FIREBASE_STAGING=$FIREBASE_STAGING
FIREBASE_PRODUCTION=$FIREBASE_PRODUCTION
NODE_ENV=production
ENVEOF
chmod 600 /root/.kimaki/env

# Create systemd service for Kimaki (no-clobber — never overwrite a running unit)
KIMAKI_PATH=$(command -v kimaki || true)
# Resolve node explicitly: the pinned tarball installs to /usr/local/bin while
# the apt fallback uses /usr/bin — hardcoding /usr/bin/node breaks the unit on
# tarball VMs (203/EXEC, "Failed to locate executable /usr/bin/node").
NODE_PATH=$(command -v node || true)
if [ -z "$KIMAKI_PATH" ] || [ ! -x "$KIMAKI_PATH" ]; then
  echo "KIMAKI_MISSING" > /dev/ttyS0 2>/dev/null || true
  echo "WARNING: kimaki binary not found, defaulting to /usr/bin/kimaki" >&2
  KIMAKI_PATH=/usr/bin/kimaki
fi
if [ -z "$NODE_PATH" ] || [ ! -x "$NODE_PATH" ]; then
  echo "WARNING: node binary not found, defaulting to /usr/bin/node" >&2
  NODE_PATH=/usr/bin/node
fi
if [ ! -f /etc/systemd/system/kimaki.service ]; then
  cat > /etc/systemd/system/kimaki.service << SERVICEEOF
[Unit]
Description=Kimaki Agent Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/.kimaki/projects/$REPO_NAME
ExecStart=$NODE_PATH $KIMAKI_PATH
Restart=on-failure
RestartSec=10
EnvironmentFile=/root/.kimaki/env
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICEEOF

  # Verify the ExecStart line actually references a script (an empty
  # NODE_PATH/KIMAKI_PATH would write `ExecStart= ` and exit status=0 in
  # ~30ms with no error — the defaults above prevent that).
  grep -q "ExecStart=$NODE_PATH $KIMAKI_PATH" /etc/systemd/system/kimaki.service \
    || echo "WARNING: kimaki.service ExecStart may be broken" >&2

  systemctl daemon-reload
  systemctl enable kimaki.service
  systemctl start kimaki.service
else
  echo "kimaki.service already exists, skipping re-write"
  systemctl daemon-reload
  systemctl restart kimaki.service
fi

# Create a separate script for project registration (more reliable than inline)
cat > /usr/local/bin/kimaki-register.sh << 'REGISTER_SCRIPT'
#!/bin/bash
set +e
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/root/.bun/bin"
export HOME=/root

# Wait for kimaki to be ready
for i in $(seq 1 60); do
  if systemctl is-active --quiet kimaki.service; then
    echo "$(date): Kimaki is active, proceeding with registration..." >> /var/log/kimaki-register.log
    break
  fi
  echo "$(date): Waiting for kimaki.service... attempt $i" >> /var/log/kimaki-register.log
  sleep 5
done

# Determine KIMAKI_CMD
if command -v kimaki &> /dev/null; then
  KIMAKI_CMD="kimaki"
else
  KIMAKI_CMD="npx -y kimaki@latest"
fi

echo "$(date): Using KIMAKI_CMD: $KIMAKI_CMD" >> /var/log/kimaki-register.log

# Try to register the project (retries needed because OpenCode server needs time to start)
PROJECT_NAME=$(cat /root/.kimaki/.project_name 2>/dev/null || echo "SecureAgentBase")
# Skip if already registered (reboot-safe — project add fails non-zero when the channel exists)
if $KIMAKI_CMD project list --json 2>/dev/null | grep -q "$PROJECT_NAME"; then
  echo "$(date): Project already registered, skipping" >> /var/log/kimaki-register.log
  echo "KIMAKI_BOT_ONLINE" > /dev/ttyS0 2>/dev/null || true
  exit 0
fi
for i in $(seq 1 30); do
  echo "$(date): Attempting to register project (attempt $i)..." >> /var/log/kimaki-register.log
  if $KIMAKI_CMD project add /root/.kimaki/projects/$PROJECT_NAME >> /var/log/kimaki-register.log 2>&1; then
    echo "$(date): Project registered successfully!" >> /var/log/kimaki-register.log
    # Signal to the wizard's serial port poller that the Discord bot is online
    echo "KIMAKI_BOT_ONLINE" > /dev/ttyS0 2>/dev/null || true
    exit 0
  fi
  echo "$(date): Attempt $i failed, retrying in 10s..." >> /var/log/kimaki-register.log
  sleep 10
done

echo "$(date): Registration failed after 30 attempts" >> /var/log/kimaki-register.log
exit 1
REGISTER_SCRIPT

chmod +x /usr/local/bin/kimaki-register.sh

# Create project registration service
cat > /etc/systemd/system/kimaki-register.service << 'REGISTER_EOF'
[Unit]
Description=Register SecureAgentBase with Kimaki
After=kimaki.service

[Service]
Type=oneshot
User=root
ExecStart=/usr/local/bin/kimaki-register.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
REGISTER_EOF

systemctl daemon-reload
systemctl enable kimaki-register.service

# Mark this VM as provisioned — GCP re-runs startup scripts on every boot,
# and the top-of-script guard skips everything once this marker exists.
touch /root/.kimaki/.provisioned

# Final compact marker — this is the LAST output before kimaki-register starts
# Non-sensitive status only — no secrets or project identifiers leaked
# Include PUSH_RESULT and REPO so serial-port diagnostics survive buffer overflow
echo "SCRIPT_COMPLETE|PUSH=${PUSH_RESULT:-UNKNOWN}|REPO=${REPO_OWNER:-?}/${REPO_NAME:-?}" > /dev/ttyS0 2>/dev/null || true

systemctl start kimaki-register.service &
