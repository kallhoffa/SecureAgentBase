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
GITHUB_PAT=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/github_pat" -H "Metadata-Flavor: Google")
DISCORD_BOT_TOKEN=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/discord_bot_token" -H "Metadata-Flavor: Google")
DISCORD_GUILD_ID=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/discord_guild_id" -H "Metadata-Flavor: Google")
GCP_WIF_PROVIDER=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcp_wif_provider" -H "Metadata-Flavor: Google")
GCP_SA_STAGING=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcp_sa_staging" -H "Metadata-Flavor: Google")
GCP_SA_PRODUCTION=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/gcp_sa_production" -H "Metadata-Flavor: Google")
FIREBASE_STAGING_CONFIG=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/firebase_staging_config" -H "Metadata-Flavor: Google")
FIREBASE_PRODUCTION_CONFIG=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/firebase_production_config" -H "Metadata-Flavor: Google")
VITE_APP_NAME=$(curl -sf "http://metadata.google.internal/computeMetadata/v1/instance/attributes/vite_app_name" -H "Metadata-Flavor: Google")

# Clean up any potential HTML responses from failed requests or unconfigured metadata
for var in FIREBASE_STAGING FIREBASE_PRODUCTION GITHUB_PAT DISCORD_BOT_TOKEN DISCORD_GUILD_ID GCP_WIF_PROVIDER GCP_SA_STAGING GCP_SA_PRODUCTION FIREBASE_STAGING_CONFIG FIREBASE_PRODUCTION_CONFIG VITE_APP_NAME; do
  val=${!var}
  if [[ "$val" =~ "<html" || "$val" =~ "<!" || "$val" =~ "<HTML" ]]; then
    eval "$var=\"\""
  fi
done

echo "REPO_OWNER=$REPO_OWNER | FIREBASE_STAGING=$FIREBASE_STAGING"

sudo apt-get update -y > /dev/null 2>&1 || true
sudo apt-get install -y curl git jq apt-transport-https ca-certificates gnupg2 ufw unzip > /dev/null 2>&1 || true

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1 || true
sudo apt-get install -y nodejs > /dev/null 2>&1 || true

# Install GitHub CLI
type gh >/dev/null 2>&1 || (curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt-get update -y > /dev/null 2>&1 && sudo apt-get install -y gh > /dev/null 2>&1) || true

# Install Kimaki
if command -v npm &> /dev/null; then
  npm install -g kimaki@0.23.1 > /dev/null 2>&1 || true
fi

# Clone the SecureAgentBase template repository into Kimaki's projects dir
# so kimaki can detect/register it as a project
mkdir -p /root/.kimaki/projects
cd /root/.kimaki/projects

# Force HTTP/1.1 to avoid GitHub HTTP/2 curl 92 errors on large repos
git config --global http.version HTTP/1.1
git config --global http.postBuffer 524288000

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
  mkdir -p $REPO_NAME
  cd $REPO_NAME
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
  cd $REPO_NAME
  rm -rf .git
  git init
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

# Configure git
git config user.email "agent@secureagentbase.com"
git config user.name "SecureAgent Manager"

# Add and commit all files
git add .
git commit -m "Initial commit of SecureAgentBase template"

# Create GitHub repo and push
# Write diagnostics to /dev/ttyS0 (serial port 1) for external debugging
# and compact markers at the end that survive buffer overflow
PUSH_RESULT="NOT_ATTEMPTED"
if [ -n "$GITHUB_PAT" ]; then
  echo "$GITHUB_PAT" | gh auth login --with-token 2>/dev/null
  gh auth setup-git 2>/dev/null || true

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
echo "$REPO_NAME" > $KIMAKI_CONFIG_DIR/.project_name
cat > $KIMAKI_CONFIG_DIR/config.yml << 'KIMAKICONF'
# Kimaki config - auto-generated
openai_api_key: ""
github_token: ""
KIMAKICONF

# Write opencode.json with provider timeout settings (chatty upstream models)
cat > /root/.kimaki/projects/$REPO_NAME/opencode.json << 'OPENCODEEOF'
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

# Create systemd service for Kimaki
KIMAKI_PATH=$(which kimaki)
cat > /etc/systemd/system/kimaki.service << SERVICEEOF
[Unit]
Description=Kimaki Agent Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/.kimaki/projects/$REPO_NAME
ExecStart=/usr/bin/node $KIMAKI_PATH
Restart=on-failure
RestartSec=10
EnvironmentFile=/root/.kimaki/env
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload
systemctl enable kimaki.service
systemctl start kimaki.service

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

# Final compact marker — this is the LAST output before kimaki-register starts
# Non-sensitive status only — no secrets or project identifiers leaked
echo "SCRIPT_COMPLETE" > /dev/ttyS0 2>/dev/null || true

systemctl start kimaki-register.service &
