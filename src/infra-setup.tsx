import { useState, useEffect } from 'react';
import { useAuth } from './firestore-utils/auth-context';
import { useNavigate } from 'react-router-dom';
import { useNotification } from './firestore-utils/notification-context';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp, Firestore } from 'firebase/firestore';
import { Check, Copy, Upload, AlertTriangle, Trash2, ExternalLink, Shield, Server, Bot } from 'lucide-react';

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          callback: (response: { error?: string; access_token?: string }) => void;
        }) => { open(): void; requestAccessToken(): void };
      };
    };
  };
}

interface InfraSetupProps {
  db: Firestore;
}

const INFRA_COLLECTION = 'infra_configs';
const PROJECTS_COLLECTION = 'projects';
const LOCALSTORAGE_KEY = 'infra_config_pending';
const FORM_PROGRESS_KEY = 'infra_form_progress';
const GCS_BUNDLE_URL = 'https://storage.googleapis.com/secureagent-base-bundles/debian-packages.tar.gz';
const GCS_SIGNATURE_URL = 'https://storage.googleapis.com/secureagent-base-bundles/debian-packages.tar.gz.asc';
const BUNDLE_SIGNER_KEY = `-----BEGIN PGP PUBLIC KEY BLOCK-----

mQINBGnGrsABEACvi02C/xs6MioJqKwkwXIYeS5Yc7sGO9E+TU4WBqN7XKFjzOj3
tu82vJRjXEXM6WdCStPFv5suGfGF6X3gfH4I8hzWJbKNiFca7nPRtrRtxoMd3Zsv
aRSMcA1+TlUUWwTPPI9drSCB0hKZGYmZl6n5ZWywjs6rVwv5MgXauJRLbFlPFoTB
2BF1tmyfvB8YW0cN0rUNdaGIVr4BHsU12tdbDKNbdfUQxZR2L3sKp9SZM0g9TAE0
vC6gD/7Jif4JXmQXaHH5L46CIabfbyC2WbuvSi028JB6ihMqn9iu67X5AhtBifJr
o3Idoe9qCiX6G3dYWCSAWZSh97tkGFS53fye2n3tzMdYvCjlW7YAIUsPNZR4IgVd
JwBX65csGWRlHv+8iPHi3ciePhUMFoU/pdJRt6QL+P267MX80ENd87uxguXwb/J9
b6Rlb6u1WYIDqX8c3hAHJWt9ApH5SCkfjiZzbdjwzEYFIRPXv/N7l4WlXGrAbhwx
jsH2heUdqHpdOYXCFolUTOvDW6r25C7jRNbAeZ75ei2nAWk4mfoAkfThjjPrtr07
SJV1f9mGojHrqPXYaohRX6LwdXxnpl6JTGmiLjQBwkaJx/6A2qRClOKCNoPY1cfE
7syEfWA7Vgf4qml0UdU49HMnrNbRdWSXUQ17A0k36YEHvVoe7m1OHCMwpQARAQAB
tDNTZWN1cmVBZ2VudCBCdW5kbGUgU2lnbmVyIDxidW5kbGVzQHNlY3VyZWFnZW50
LmFwcD6JAlgEEwEIAEIWIQQ/DynuZpF8SQk6GjxIpsovJJX8LQUCacauwAMbLwQF
CQHhM4AFCwkIBwICIgIGFQoJCAsCBBYCAwECHgcCF4AACgkQSKbKLySV/C1+wBAA
iJfZciCi0EH7jvdulqVxmntxYzLh1LvSm8hjzvttUbRhnZy6KfIaitUNOJVv3exX
zAHnxr2n9WGGP5TAk7pn6kHwdCw38YBPNGiL3kWwm0eL8cp0sRw2VsRo34D0Dtqv
XlBaOIR032ifN5ou6Uc4vbYxdz0npWhbc8irqbPdT/1q3A/e89bI9NtOT7h711sS
EJ5aNgUHk93wuTjgSL5+cxiKeGcF7t1kWhdiBJQrI++/kEom0zaplKmkUYpXpTH5
+5ai8bIA4+u51PClRc+Yv1OARNZ9YX5E4Xu2sDujva8YX6GjdLya1CyM95FqtGB/
fKal5NyoDVpyO+RmofkrS/aOTEgKl5qHWXs6c5156qlLtZ2NWYJtidNniuHcMQog
FB+va55l7ITT+3GPvCFA+nX0ZIaAzYjGO90ELOLckZ4VID003mh4PpyR0Kb/bmUb
OQXy9/IhNISr+2QGh0BRSl8/YVPaYPuomomUhCi4pvMBl69TIgM6DnKYHlycuOD8
GqBgEQiPAn3NoCXek3tgXMLUqQqTcCQvCLWAhPecSxShmkB++EWPs7dNv8nZk1p5
Uc8E2n+wdfmWGgiXNPJBoEugJ8ofVid7PQLCGpca/Hz4sNSA//ALTdrHU/ND1QaR
YooIrMbIpgvSH2k0i1cXlje5U7aSpLr7jt88Vqry5p25Ag0EacauwAEQAKz7q9Ss
/NdATQJSCc1VbVU2ltzI9GglKmhEvWTlidOjToIToIva2Xdeh58gPS8Ba+ZJMKgg
Azq+g4HmeOfls5w5KvgXpuL+H6aI7Gq5Sc0TCXvFECZFiqAF1ROhA2OAZ8sgyh0c
tGl1idSILY7oP1EuOLREbCEw5URWRjsQ7JNtT/T07UCwxA3mADSRFcYGYfaMYQeu
VWi3ZV4nOivrEnkKWDfpoLrbU+PuBUuw2WtJzhu6AwmukEHBch4ZgnxTJhmaNZL/
yhP+U+yVLFW/qOWKoJn919974Omn3WwJiuYbUVwib1Cwyh5S+gy29aLp9UZmv61u
L3GdgQK6x3bUthCr3hbU4MmaMt3GZ7uCU7Da3pIfI7Ik9qRuKQPzeqA+qTKYS8z8
wDAg6KyIIwlxNwJwHGMteUdKhKXlqt0fnNAS5GHJx/B906gLtmwoiwBgkUEYecJm
j3iA2sQ9dzbeAsgdahFdw8VZT1mMULy9ACOfxghdIAvzO+0C13dUvuzHYN3rHn51
XN3dmyv7DjR99FvLLxIlvBhgUfkaNSxyr8c/3EXJt7VXoH0I+1RAS9KiS6RJTnbt
YueqxPGmv6UxTWpzO6e9o0FF7jNMh6doBCA8vzZs/ElcxxLL0/4QyQKzUM21vuHF
vPVIMk5vyEZxkDQJE3JW4dni8YE2Ug518uInABEBAAGJBHIEGAEIACYWIQQ/Dynu
ZpF8SQk6GjxIpsovJJX8LQUCacauwAIbLgUJAeEzgAJACRBIpsovJJX8LcF0IAQZ
AQgAHRYhBACf4cPmKo1JLiqgYUARAw56tvCKBQJpxq7AAAoJEEARAw56tvCKQWsQ
AJXgiPC3Ij9KgfOgRbck7lca1ky1D9FeqygIJsD1W/CxjEVo7DKReB+iDnyVPFDE
BKTJL3gPGriTOvXLjvoXiXQll1P1L5ZmrMUJoWzWeG9VewGrhBiZMbYOwschs8Sz
F6ex+GmNs3Jl91aTqHXKttrUV4KCN720E7sPTLet3D1i9HbGlTe1X+S5FE6qTWoY
qLrj2Pf3foGJYHlg6150knCbAXnzeSqgaL/cW3Kj+HcjcgRCFMx9l2LPWwOD6NjF
iKnpuVjF4k0IIjzew1prYtWqZHDEpcyBmtCpt4csmm7L8sjNNbuHIMwishTUbuEP
PHiVv3642L32v9pCnFwvp0Vm7KMt1mqQy4Mkn+T//5TaCB5HRhFU5D64YimonoVl
k1nJ5LgnoitsP08QuAZbfms1AKeDxjm7RDg/NfAIRn12wsimAJ3cMoaqO8IupkjP
BqacvLytnrguTLGXpiNTYivp5lou7oigU8MWQuwm4Ao7sHJ7aJO+7vsLc9mfRW14
escV6XOHqQ/wzEbcGXYmjEYV337sc2Fjl855GSUKPBAu36fsCSWw5P4Sps6ODCbJ
rIzVCZJ5VIE3puq9Yj5ohlAdQxSX5g+pxtFNjuN+B31s3yTSdt3NZLNUsHzROm1g
9A4mcQRhZKUifrcGYJnTir8SgiJgCsD/BZQZezGanq/1GWgP/3vLRN9KdGnMy+GJ
42XAMinJKRGkHcaJapeFC26ajIpY3Bo/vuXihuZYnVy8QPdvASaL/jGI+7pvKSna
p7KuSfKGllJ1Fj0DEzamLAwegR1/zaxCp3+qP+ORn0WEttEfCyFDRWF/OZvHYsSs
3+pdYMF/ksEeXv9OwaHs58jCDaVVJbQXdKb0dYhODinNtcyXWvo+TZ6TbJKw6KQc
99ATwyfADGGeTXB8nco9hWXwbX+b8Oxu2JA4PNVdhKxIQqB/uFvBAC4khTwLbxNf
7bZh0+BTg6P/FxyvXPcgT61lU3amp6BZSclFd69GnMMObGCnGaU4PW1a/i4wlWw6
Z0Qe3ltRmlEfxduNubCYVTcLPhrxjEKsfZ5pcp5HieAToEOdIGY43xPdcyNnU+Ez
8EJDY+o+nFcm+kvM3KyklqHxVVejgtc02jtRhecE9V6j96+i6MSD39uS13JyAItO
+x32XPqtXX/Q6jVCiiZhQLPlhYzvnRNy559Mi8gdW43fXyQy3BtHbKs3IOpWgzM9
FQH+RyJG6KBaIyitv7EtUacJhR7dQNX+nuO1P7qVCiGPQ+RZzUYdemMgy52Jiz7A
rDX/gsxmfk0wU/hzwJTiQ7m567Z6D7EzBqm/OP3nYGuQ+hcNIX07bvYlBmg4PE5I
rjHERDArJhbYcoArPoa/3mGjFuee
=nNe/
-----END PGP PUBLIC KEY BLOCK-----`;

const generateKey = async (passphrase, salt) => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const encryptData = async (data, passphrase) => {
  if (!passphrase) return JSON.stringify(data);
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await generateKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  );
  const result = {
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  };
  return JSON.stringify(result);
};

const decryptData = async (encryptedStr, passphrase) => {
  if (!passphrase) return JSON.parse(encryptedStr);
  try {
    const { salt, iv, data } = JSON.parse(encryptedStr);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const saltArray = new Uint8Array(atob(salt).split('').map(c => c.charCodeAt(0)));
    const ivArray = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));
    const dataArray = new Uint8Array(atob(data).split('').map(c => c.charCodeAt(0)));
    const key = await generateKey(passphrase, saltArray);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivArray },
      key,
      dataArray
    );
    return JSON.parse(decoder.decode(decrypted));
  } catch (e) {
    console.error('Decryption failed:', e);
    throw new Error('Invalid passphrase or corrupted data');
  }
};

const saveFormProgress = (data) => {
  try {
    localStorage.setItem(FORM_PROGRESS_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving form progress:', e);
  }
};

const loadFormProgress = () => {
  try {
    const data = localStorage.getItem(FORM_PROGRESS_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Error loading form progress:', e);
    return null;
  }
};

const loadProjectsFromFirestore = async (userId, firestoreDb) => {
  if (!userId || !firestoreDb) return [];
  const q = query(collection(firestoreDb, PROJECTS_COLLECTION), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const saveProjectToFirestore = async (userId, projectId, name, encryptedData, firestoreDb) => {
  const projectRef = doc(firestoreDb, PROJECTS_COLLECTION, projectId);
  await setDoc(projectRef, {
    userId,
    name,
    encryptedData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
};

const deleteProjectFromFirestore = async (projectId, firestoreDb) => {
  await deleteDoc(doc(firestoreDb, PROJECTS_COLLECTION, projectId));
};

const CloudShellScript = ({ projectId }) => `# SecureAgent-Manager Service Account Setup
# Run this in Google Cloud Shell (https://shell.cloud.google.com)

PROJECT_ID="${projectId || 'YOUR_PROJECT_ID'}"

echo "Creating SecureAgent-Manager service account..."

# Create the service account
gcloud iam service-accounts create secureagent-manager \\
  --display-name="SecureAgent Manager" \\
  --project=$PROJECT_ID

# Grant required roles
gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/compute.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/billing.projectManager"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/serviceusage.serviceUsageAdmin"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/secretmanager.secretAccessor"

# Generate and download key
gcloud iam service-accounts keys create ~/secureagent-manager-key.json \\
  --iam-account="secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com"

echo "✅ Service account created!"
echo "📁 Key file: ~/secureagent-manager-key.json"
echo "⚠️  Upload this key in the SecureAgentBase portal to continue setup."
`;

const saveToLocalStorage = (data) => {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving to localStorage:', e);
  }
};

const getStartupScript = (useBundle = false) => {
  const bundleSection = useBundle ? `
# Try to download pre-bundled packages from GCS for faster setup
if [ "$USE_BUNDLE" = "true" ]; then
  echo "Downloading pre-bundled packages from GCS..."
  if curl -sf --connect-timeout 15 "${GCS_BUNDLE_URL}" -o /tmp/packages.tar.gz 2>/dev/null && \\
     curl -sf --connect-timeout 15 "${GCS_SIGNATURE_URL}" -o /tmp/packages.tar.gz.asc 2>/dev/null; then
    echo "Bundle downloaded, verifying signature..."
    
    # Import trusted GPG key
    GNUPGHOME=/tmp/gpghome
    mkdir -p $GNUPGHOME
    chmod 700 $GNUPGHOME
    echo '${BUNDLE_SIGNER_KEY}' | gpg --import --no-tty 2>/dev/null || true
    
    # Verify signature
    if gpg --batch --verify /tmp/packages.tar.gz.asc /tmp/packages.tar.gz 2>/dev/null; then
      echo "Bundle signature verified!"
      tar -xzf /tmp/packages.tar.gz -C /opt/ 2>/dev/null || true
      
      # Install .deb packages if present
      if [ -d /opt/packages ]; then
        echo "Installing from verified bundle..."
        cd /opt/packages
        dpkg -i *.deb 2>/dev/null || apt-get install -f -y --no-install-recommends 2>/dev/null || true
      fi
      
      # Add bundled Node.js to PATH
      if [ -d /opt/nodejs/bin ]; then
        export PATH="/opt/nodejs/bin:$PATH"
        echo "Bundle Node.js available"
      fi
      
      export BUNDLE_SUCCESS="true"
    else
      echo "WARNING: Bundle signature verification failed! Using standard installation..."
    fi
  else
    echo "WARNING: Could not download bundle. Using standard installation..."
  fi
fi
` : '';

  return `#!/bin/bash
set -e
export HOME=/root
export DEBIAN_FRONTEND=noninteractive
export USE_BUNDLE="${useBundle ? 'true' : 'false'}"
echo "=== VM Setup Started ==="

GITHUB_TOKEN=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/attributes/github_token" -H "Metadata-Flavor: Google")
DISCORD_BOT_TOKEN=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/attributes/discord_bot_token" -H "Metadata-Flavor: Google")
DISCORD_GUILD_ID=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/attributes/discord_guild_id" -H "Metadata-Flavor: Google")
GITHUB_OWNER=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/attributes/github_owner" -H "Metadata-Flavor: Google")
FIREBASE_STAGING=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/attributes/firebase_staging" -H "Metadata-Flavor: Google")
FIREBASE_PRODUCTION=$(curl -s "http://metadata.google.internal/computeMetadata/v1/instance/attributes/firebase_production" -H "Metadata-Flavor: Google")

echo "Secrets loaded from metadata"
echo "DEBUG: FIREBASE_STAGING=$FIREBASE_STAGING"
echo "DEBUG: FIREBASE_PRODUCTION=$FIREBASE_PRODUCTION"

# Re-detect Discord guild if bot token exists but guild ID is empty
if [ -n "$DISCORD_BOT_TOKEN" ] && [ "$DISCORD_BOT_TOKEN" != "null" ] && [ -z "$DISCORD_GUILD_ID" ]; then
  echo "DEBUG: Guild ID empty, re-detecting from bot token..."
  GUILDS_DATA=$(curl -s "https://discord.com/api/v10/users/@me/guilds" \
    -H "Authorization: Bot $DISCORD_BOT_TOKEN")
  GUILD_COUNT=$(echo "$GUILDS_DATA" | grep -o '"id"' | wc -l)
  if [ "$GUILD_COUNT" -gt 0 ]; then
    DISCORD_GUILD_ID=$(echo "$GUILDS_DATA" | head -1 | grep -oP '"id"\s*:\s*"\K[^"]+')
    echo "DEBUG: Re-detected guild ID: $DISCORD_GUILD_ID"
  else
    echo "WARNING: Bot not in any servers. Add bot to Discord server first."
  fi
fi

# Remove man-db to speed up installs
apt-get remove --purge -y man-db 2>/dev/null || true

${bundleSection}

# Install dependencies if bundle failed or not used
if [ "$BUNDLE_SUCCESS" != "true" ]; then
  echo "Installing dependencies via apt..."
  apt-get update -o Dpkg::Options::="--force-confdef" -o APT::Get::Fix-Missing=true
  apt-get install -y --no-install-recommends -o Dpkg::Options::="--force-confdef" -o APT::Get::Fix-Missing=true curl git gnupg ca-certificates apt-transport-https jq unzip
  
  # Install Node.js 20 from bundle if available
  if [ -d "/opt/nodejs" ]; then
    echo "Installing Node.js from bundle..."
    cp -r /opt/nodejs/* /usr/local/ 2>/dev/null || true
  elif ! command -v node &> /dev/null || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y --no-install-recommends nodejs
  fi
fi

# Install GitHub CLI (try bundle first, then apt)
if ! command -v gh &> /dev/null; then
  echo "Installing GitHub CLI..."
  # Try bundled gh first
  if [ -f "/opt/gh/bin/gh" ]; then
    cp /opt/gh/bin/gh /usr/local/bin/gh
    chmod +x /usr/local/bin/gh
    echo "DEBUG: gh installed from bundle"
  elif [ -d "/opt/kimaki" ]; then
    # Legacy: check in kimaki folder
    if [ -f "/opt/kimaki/bin/gh" ]; then
      cp /opt/kimaki/bin/gh /usr/local/bin/gh
      chmod +x /usr/local/bin/gh
      echo "DEBUG: gh installed from kimaki bundle"
    fi
  fi
  
  # Fall back to apt if bundle didn't work
  if ! command -v gh &> /dev/null; then
    echo "DEBUG: Installing gh via apt..."
    wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg 2>/dev/null | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null || true
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null 2>&1 || true
    apt-get update -o Dpkg::Options::="--force-confdef" 2>/dev/null || true
    apt-get install -y --no-install-recommends -o Dpkg::Options::="--force-confdef" gh 2>/dev/null || true
  fi
fi

# Authenticate GitHub
echo $GITHUB_TOKEN | gh auth login --with-token
gh auth setup-git

# Get authenticated user to verify correct owner
GH_USER=$(gh api user --jq .login)
echo "Authenticated as: $GH_USER"
echo "Expected owner: $GITHUB_OWNER"

# Clone SecureAgentBase and set up upstream
cd /opt
if [ -d "SecureAgentBase" ]; then
  cd SecureAgentBase
  git remote add upstream https://github.com/kallhoffa/SecureAgentBase.git 2>/dev/null || true
  git fetch upstream 2>/dev/null || true
  git checkout main 2>/dev/null || true
  git merge upstream/main 2>/dev/null || true
else
  git clone --depth 1 https://github.com/kallhoffa/SecureAgentBase.git 2>/dev/null || true
  cd SecureAgentBase
  # Reinitialize git for fresh repo (single commit)
  rm -rf .git
  git init -b main
  git add -A
  git commit -m "Initial commit from SecureAgentBase"
  git remote add upstream https://github.com/kallhoffa/SecureAgentBase.git 2>/dev/null || true
fi

# Remove upstream to avoid "multiple remotes" error with gh cli
git remote remove upstream 2>/dev/null || true
git remote remove origin 2>/dev/null || true

# Use the authenticated user if owner not set
if [ -n "$GH_USER" ]; then
  REPO_OWNER="$GH_USER"
else
  REPO_OWNER="$GITHUB_OWNER"
fi
echo "Using repo owner: $REPO_OWNER"

# Check if repo exists, create if not
REPO_EXISTS=false
if gh repo view "\${REPO_OWNER}/\${FIREBASE_STAGING}" 2>/dev/null; then
  REPO_EXISTS=true
fi

  if [ "$REPO_EXISTS" = true ]; then
  echo "Repo exists, pushing..."
  git remote add origin "https://github.com/\${REPO_OWNER}/\${FIREBASE_STAGING}.git" 2>/dev/null || true
  git push -u origin main --force || { echo "Push failed!"; exit 1; }
else
  echo "Creating new repo..."
  gh repo create "$FIREBASE_STAGING" --public --source=. --push || { echo "Repo create failed!"; exit 1; }
fi
echo "DEBUG: GitHub push done"

# Set GitHub Secrets
echo "DEBUG: Setting GitHub secrets..."
gh secret set FIREBASE_STAGING_PROJECT_ID --body "$FIREBASE_STAGING" -R "\${REPO_OWNER}/\${FIREBASE_STAGING}" 2>/dev/null || echo "WARNING: Failed to set FIREBASE_STAGING_PROJECT_ID"
gh secret set FIREBASE_PRODUCTION_PROJECT_ID --body "$FIREBASE_PRODUCTION" -R "\${REPO_OWNER}/\${FIREBASE_STAGING}" 2>/dev/null || echo "WARNING: Failed to set FIREBASE_PRODUCTION_PROJECT_ID"
echo "DEBUG: GitHub secrets set"

# Add upstream back for future syncing
git remote add upstream https://github.com/kallhoffa/SecureAgentBase.git 2>/dev/null || true

# Install and start Kimaki (try bundle first, fall back to npm)
echo "DEBUG: Installing Kimaki..."
KIMAKI_STARTED=false

# Check for bundled Kimaki
if [ -d "/opt/kimaki" ]; then
  echo "Kimaki found in bundle..."
  
  # Check actual structure
  if [ -f "/opt/kimaki/bin.js" ]; then
    KIMAKI_DIR="/opt/kimaki"
  elif [ -f "/opt/kimaki/kimaki/bin.js" ]; then
    KIMAKI_DIR="/opt/kimaki/kimaki"
  else
    echo "WARNING: Kimaki bin.js not found, checking contents..."
    ls -la /opt/kimaki/
    ls -la /opt/kimaki/*/ 2>/dev/null || true
  fi
  
  if [ -n "$KIMAKI_DIR" ] && [ -f "$KIMAKI_DIR/bin.js" ]; then
    chmod +x "$KIMAKI_DIR/bin.js" 2>/dev/null || true
    ln -sf "$KIMAKI_DIR/bin.js" /usr/local/bin/kimaki 2>/dev/null || true
    echo "DEBUG: Kimaki from bundle ready, starting..."
    
    # Ensure package.json has "type": "module" for ESM support
    if [ -f "$KIMAKI_DIR/package.json" ]; then
      if ! grep -q '"type": "module"' "$KIMAKI_DIR/package.json"; then
        sed -i 's/"name"/"type": "module",\n    "name"/' "$KIMAKI_DIR/package.json" 2>/dev/null || true
      fi
    fi
    
    # Add bundled Node.js and Bun to PATH
    if [ -d "/opt/nodejs" ]; then
      export PATH="/opt/nodejs/bin:$PATH"
    fi
    if [ -d "/opt/bun" ]; then
      export PATH="/opt/bun:$PATH"
    fi
    
    # Configure Kimaki with Discord bot token via environment variable
    export KIMAKI_BOT_TOKEN="$DISCORD_BOT_TOKEN"
    
    # Start Kimaki in background with Bun
    cd "$KIMAKI_DIR"
    if command -v bun &> /dev/null; then
      echo "DEBUG: Starting Kimaki with bun..."
      nohup env KIMAKI_BOT_TOKEN="$DISCORD_BOT_TOKEN" bun "$KIMAKI_DIR/bin.js" > /var/log/kimaki.log 2>&1 &
    else
      echo "DEBUG: Starting Kimaki with node..."
      nohup env KIMAKI_BOT_TOKEN="$DISCORD_BOT_TOKEN" node "$KIMAKI_DIR/bin.js" > /var/log/kimaki.log 2>&1 &
    fi
    KIMAKI_PID=$!
    echo "DEBUG: Kimaki starting with PID $KIMAKI_PID, waiting for Discord connection..."
    sleep 10
    
    # Check if process is running and show early logs
    if ps -p $KIMAKI_PID > /dev/null 2>&1; then
      echo "DEBUG: Kimaki process running (PID: $KIMAKI_PID)"
      KIMAKI_STARTED=true
      echo "DEBUG: Kimaki log tail:"
      tail -10 /var/log/kimaki.log 2>/dev/null || echo "No log yet"
    elif pgrep -f "kimaki" > /dev/null 2>&1; then
      echo "DEBUG: Kimaki running (PID: $(pgrep -f kimaki))"
      KIMAKI_STARTED=true
    else
      echo "WARNING: Kimaki process not running, checking log..."
      cat /var/log/kimaki.log 2>/dev/null || echo "No log file"
    fi
  fi
elif command -v npm &> /dev/null; then
  echo "Installing Kimaki via npm..."
  npm install -g kimaki@latest 2>/dev/null || echo "WARNING: Kimaki npm install failed"
  
  if command -v kimaki &> /dev/null; then
    echo "DEBUG: Kimaki installed via npm, starting with KIMAKI_BOT_TOKEN..."
    if command -v bun &> /dev/null; then
      nohup env KIMAKI_BOT_TOKEN="$DISCORD_BOT_TOKEN" bun kimaki > /var/log/kimaki.log 2>&1 &
    else
      nohup env KIMAKI_BOT_TOKEN="$DISCORD_BOT_TOKEN" kimaki > /var/log/kimaki.log 2>&1 &
    fi
    sleep 2
    if pgrep -f "kimaki" > /dev/null; then
      echo "DEBUG: Kimaki started successfully (PID: $(pgrep -f kimaki))"
      KIMAKI_STARTED=true
    fi
  fi
else
  echo "WARNING: npm not available, skipping Kimaki installation"
fi

# Install bundled gh if available
if [ -d "/opt/gh" ]; then
  echo "Installing gh from bundle..."
  cp /opt/gh/bin/gh /usr/local/bin/gh 2>/dev/null && chmod +x /usr/local/bin/gh && echo "DEBUG: gh from bundle ready"
fi

# Create Discord channel (if guild ID is available)
if [ -n "$DISCORD_GUILD_ID" ] && [ "$DISCORD_GUILD_ID" != "null" ]; then
  echo "DEBUG: Creating Discord channel..."
  echo "DEBUG: DISCORD_GUILD_ID=$DISCORD_GUILD_ID"
  echo "DEBUG: DISCORD_BOT_TOKEN length=\${#DISCORD_BOT_TOKEN}"
  CHANNEL_DATA=$(curl -s -X POST "https://discord.com/api/v10/guilds/\${DISCORD_GUILD_ID}/channels" \
    -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name": "secureagent", "type": 0}')

  echo "DEBUG: Discord channel response: $CHANNEL_DATA"

  CHANNEL_ID=$(echo $CHANNEL_DATA | jq -r '.id')

  if [ "$CHANNEL_ID" = "null" ] || [ -z "$CHANNEL_ID" ]; then
    echo "WARNING: Failed to create Discord channel"
  else
    echo "DEBUG: Posting welcome message..."
    echo '{"content": "Welcome to SecureAgent! Kimaki is ready."}' > /tmp/welcome.json
    RESPONSE=$(curl -s -X POST "https://discord.com/api/v10/channels/$CHANNEL_ID/messages" \
      -H "Authorization: Bot $DISCORD_BOT_TOKEN" \
      -H "Content-Type: application/json" \
      -d @/tmp/welcome.json)
    echo "DEBUG: Welcome message response: $RESPONSE"
  fi
else
  echo "DEBUG: Skipping Discord channel (no guild ID provided)"
fi

echo "DEBUG: Discord setup done"
echo "=== VM Setup Complete ==="
`;
};

const loadFromLocalStorage = () => {
  try {
    const data = localStorage.getItem(LOCALSTORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Error loading from localStorage:', e);
    return null;
  }
};

const InfraSetup: React.FC<InfraSetupProps> = ({ db }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();
  const [projectId, setProjectId] = useState('');
  const [serviceAccountKey, setServiceAccountKey] = useState(null);
  const [githubAppInstalled, setGithubAppInstalled] = useState(false);
  const [vmIp, setVmIp] = useState('');
  const [vmZone, setVmZone] = useState('us-east1-b');
  const [discordBotToken, setDiscordBotToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mergeStatus, setMergeStatus] = useState(null);
  
  const [gcpConnected, setGcpConnected] = useState(false);
  const [gcpProjects, setGcpProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [gcpAccessToken, setGcpAccessToken] = useState(null);
  const [apiNotEnabled, setApiNotEnabled] = useState(false);
  const [serviceAccountJson, setServiceAccountJson] = useState(null);
  const [serviceAccountError, setServiceAccountError] = useState(null);

  const [step1Complete, setStep1Complete] = useState(false);
  const [step2Complete, setStep2Complete] = useState(false);
  const [step3Complete, setStep3Complete] = useState(false);
  const [gcpConfigLost, setGcpConfigLost] = useState(false);
  const [checkingCompletion, setCheckingCompletion] = useState(true);

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [useFirestore, setUseFirestore] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [decryptPassphrase, setDecryptPassphrase] = useState('');
  const [pendingDecryptProject, setPendingDecryptProject] = useState(null);
  const [decryptError, setDecryptError] = useState('');

  const [firebaseConfigStaging, setFirebaseConfigStaging] = useState('');
  const [firebaseConfigProduction, setFirebaseConfigProduction] = useState('');
  const [firebaseStagingData, setFirebaseStagingData] = useState<{ projectId?: string }>({});
  const [firebaseProductionData, setFirebaseProductionData] = useState<{ projectId?: string }>({});
  const [githubPat, setGithubPat] = useState('');
  const [discordBotTokenInput, setDiscordBotTokenInput] = useState('');
  const [discordGuildId, setDiscordGuildId] = useState('');
  const [detectedGuilds, setDetectedGuilds] = useState([]);
  const [discordDetecting, setDiscordDetecting] = useState(false);
  const [vmHttpsUrl, setVmHttpsUrl] = useState('');
  const [formProgressLoaded, setFormProgressLoaded] = useState(false);
  const [useOptimizedBundle, setUseOptimizedBundle] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [expandedSteps, setExpandedSteps] = useState([1]);

  const [billingEnabled, setBillingEnabled] = useState(null);
  const [billingChecking, setBillingChecking] = useState(false);

  const [step3Status, setStep3Status] = useState('idle');
  const [step3Message, setStep3Message] = useState('');
  const [step3Logs, setStep3Logs] = useState([]);
  const [vmLogs, setVmLogs] = useState('');
  const [loadingVmLogs, setLoadingVmLogs] = useState(false);

  const [step4Status, setStep4Status] = useState<'idle' | 'enabling' | 'complete' | 'error'>('idle');
  const [step4Message, setStep4Message] = useState('');
  const [step4Logs, setStep4Logs] = useState([]);
  const [step4Retrying, setStep4Retrying] = useState(false);

  const addStep3Log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setStep3Logs(prev => [...prev, { time: timestamp, message }]);
  };

  const addStep4Log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setStep4Logs(prev => [...prev, { time: timestamp, message }]);
  };

  const getServiceAccountToken = async () => {
    if (!serviceAccountJson) return null;
    
    if (!serviceAccountJson.private_key) {
      console.error('Service account private key is missing. Please re-upload your service account JSON file.');
      setError('Service account private key is missing. Please re-upload your service account JSON file.');
      return null;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccountJson.client_email,
      sub: serviceAccountJson.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/compute https://www.googleapis.com/auth/devstorage.full_control'
    };

    const header = { alg: 'RS256', typ: 'JWT' };
    
    const encodeBase64Url = (str) => {
      return btoa(JSON.stringify(str)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    
    const encodedHeader = encodeBase64Url(header);
    const encodedPayload = encodeBase64Url(payload);
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureInput);
    
    try {
      const privateKey = serviceAccountJson.private_key.replace(/\\n/g, '\n');
      const keyData = await crypto.subtle.importKey(
        'pkcs8',
        await importPrivateKey(privateKey),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyData, data);
      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const jwt = `${signatureInput}.${signatureBase64}`;
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
      });
      
      const tokenData = await response.json();
      return tokenData.access_token;
    } catch (e) {
      console.error('Error getting service account token:', e);
      return null;
    }
  };

  const fetchVmLogs = async () => {
    if (!serviceAccountJson || !projectId || !vmIp) return;
    
    setLoadingVmLogs(true);
    try {
      const token = await getServiceAccountToken();
      if (!token) {
        setError('Failed to get service account token');
        setLoadingVmLogs(false);
        return;
      }

      const zone = vmZone;
      const instanceName = 'secureagent-manager';
      
      const response = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}/serialPort`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setVmLogs(data.contents || 'No serial port output available yet.');
      } else {
        const err = await response.json();
        setVmLogs(`Error fetching logs: ${err.error?.message || 'Unknown error'}`);
      }
    } catch (e) {
      setVmLogs(`Error: ${e.message}`);
    }
    setLoadingVmLogs(false);
  };

  const importPrivateKey = async (pem) => {
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = pem.substring(pem.indexOf(pemHeader) + pemHeader.length, pem.indexOf(pemFooter));
    const binaryDerString = atob(pemContents.replace(/\s/g, ''));
    const binaryDer = strToBuf(binaryDerString);
    return binaryDer;
  };

  const strToBuf = (str) => {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  };

  const checkBillingStatus = async () => {
    if (!projectId || !gcpAccessToken) return null;
    try {
      const response = await fetch(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`, {
        headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        const enabled = !!data.billingEnabled && !!data.billingAccountName;
        setBillingEnabled(enabled);
        return enabled;
      }
    } catch (e) {
      console.error('Error checking billing:', e);
    }
    setBillingEnabled(false);
    return false;
  };

  const expandNextStep = (currentStepNum) => {
    const nextStep = currentStepNum + 1;
    if (nextStep <= 9 && !expandedSteps.includes(nextStep)) {
      setExpandedSteps(prev => [...prev, nextStep]);
    }
  };

  const toggleStep = (step) => {
    if (expandedSteps.includes(step)) {
      setExpandedSteps(prev => prev.filter(s => s !== step));
    } else {
      setExpandedSteps(prev => [...prev, step]);
    }
  };

  const editStep = (step) => {
    setExpandedSteps(prev => [...prev, step]);
  };

  const isStepActive = (step) => {
    if (step === 1) return !isStepCompleted(1);
    if (step === 2) return isStepCompleted(1) && !isStepCompleted(2);
    if (step === 3) return isStepCompleted(2) && !isStepCompleted(3);
    if (step === 4) return isStepCompleted(3) && !isStepCompleted(4);
    if (step === 5) return isStepCompleted(4) && !isStepCompleted(5);
    if (step === 6) return isStepCompleted(5) && !isStepCompleted(6);
    if (step === 7) return isStepCompleted(6) && !isStepCompleted(7);
    if (step === 8) return isStepCompleted(7) && !isStepCompleted(8);
    if (step === 9) return isStepCompleted(8) && !isStepCompleted(9);
    return !isStepCompleted(step);
  };

  const hasGcpAccess = () => {
    return !!(projectId && serviceAccountJson);
  };

  const isStepCompleted = (step) => {
    if (step === 1) return !!user;
    if (step === 2) return !!serviceAccountJson;
    if (step === 3) return !!(firebaseStagingData?.projectId && firebaseProductionData?.projectId);
    if (step === 4) return !!githubPat;
    if (step === 5) return !!githubPat;
    if (step === 6) return !!discordBotToken;
    if (step === 7) return !!vmIp;
    return false;
  };

  const isStepLocked = (step) => {
    if (step === 1) return false;
    if (step === 2) return !isStepCompleted(1);
    if (step === 3) return !isStepCompleted(2);
    if (step === 4) return !isStepCompleted(3);
    if (step === 5) return !isStepCompleted(4);
    if (step === 6) return !isStepCompleted(5);
    if (step === 7) return !isStepCompleted(6);
    return false;
  };

  const isStepWarning = (step) => {
    if (step === 2) {
      return !!(projectId && gcpConnected && !serviceAccountJson);
    }
    return false;
  };

  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [enablingApis, setEnablingApis] = useState(false);
  const [creatingVm, setCreatingVm] = useState(false);

  const fetchGcpProjects = async (token) => {
    setLoadingProjects(true);
    setApiNotEnabled(false);
    try {
      const response = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const err = await response.json();
        if (err.error?.code === 403 || err.error?.message?.includes('not been used')) {
          setApiNotEnabled(true);
        }
        throw new Error(err.error?.message || 'Failed to fetch projects');
      }
      
      const data = await response.json();
      const projects = data.projects || [];
      setGcpProjects(projects);
      return projects;
    } catch (err) {
      console.error('Error fetching GCP projects:', err);
      setApiNotEnabled(true);
      setGcpProjects([]);
    } finally {
      setLoadingProjects(false);
    }
    return [];
  };

  const initGoogleOAuth = (): { open(): void; requestAccessToken(): void } | null => {
    const clientId = import.meta.env.VITE_GCP_CLIENT_ID;
    if (!clientId) {
      setError('GCP Client ID not configured. Add VITE_GCP_CLIENT_ID to .env.local');
      return null;
    }

    const googleClient = (window as unknown as { google?: { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: { error?: string; access_token?: string }) => void }) => { open(): void; requestAccessToken(): void } } } } }).google;
    if (!googleClient) return null;
    return googleClient.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      callback: async (response) => {
        if (response.error) {
          console.error('Google OAuth error:', response.error);
          setError('Failed to connect to Google');
        } else {
          setGcpAccessToken(response.access_token);
          setGcpConnected(true);
          
          const projects = await fetchGcpProjects(response.access_token);
          
          setStep1Complete(true);
          expandNextStep(1);
          
          if (user) {
            try {
              const infraRef = doc(db, INFRA_COLLECTION, user.uid);
              await setDoc(infraRef, {
                gcp_access_token: response.access_token,
                gcp_connected: true,
                updated_at: new Date().toISOString(),
              }, { merge: true });
            } catch (err) {
              console.error('Error auto-saving GCP token:', err);
            }
          }
        }
      },
    });
  };

  const createGcpProject = async () => {
    if (!newProjectName.trim()) {
      setError('Please enter a project name');
      return;
    }
    const projectIdVal = newProjectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 30);
    
    setCreatingProject(true);
    setError(null);

    try {
      const listResponse = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
        headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
      });
      
      if (listResponse.ok) {
        const listData = await listResponse.json();
        const existingProject = listData.projects?.find(p => p.projectId === projectIdVal);
        if (existingProject) {
          setProjectId(projectIdVal);
          setStep2Complete(true);
          setBillingChecking(true);
          await checkBillingStatus();
          setBillingChecking(false);
          expandNextStep(2);
          setNewProjectName('');
          setCreatingProject(false);
          return;
        }
      }

      const response = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gcpAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: projectIdVal,
          name: newProjectName
        })
      });

      if (!response.ok) {
        const err = await response.json();
        if (err.error?.code === 403 || err.error?.message?.includes('API')) {
          throw new Error('Cloud Resource Manager API not enabled. Please enable it at https://console.cloud.google.com/apis/library/cloudresourcemanager.googleapis.com');
        }
        throw new Error(err.error?.message || 'Failed to create project');
      }

      const result = await response.json();
      setProjectId(result.projectId || projectIdVal);
      
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          const checkRes = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectIdVal}`, {
            headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
          });
          if (checkRes.ok) break;
        } catch (e) {
          console.log('Waiting for project...');
        }
      }
      
      setStep2Complete(true);
      setBillingChecking(true);
      await checkBillingStatus();
      setBillingChecking(false);
      expandNextStep(2);
      setNewProjectName('');
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err.message || 'Failed to create GCP project');
    } finally {
      setCreatingProject(false);
    }
  };

  const checkApiStatus = async (api) => {
    try {
      const response = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api}`, {
        headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        return data.config?.state === 'ENABLED';
      }
    } catch (e) {
      console.error('Error checking API status:', e);
    }
    return false;
  };

  const enableGcpApis = async () => {
    if (!projectId) return;
    
    setEnablingApis(true);
    setStep3Status('enabling');
    setStep3Message('Starting API enablement process...');
    setStep3Logs([]);
    setError(null);

    const apis = [
      { name: 'compute.googleapis.com', displayName: 'Compute Engine API' },
      { name: 'cloudresourcemanager.googleapis.com', displayName: 'Cloud Resource Manager API' },
      { name: 'serviceusage.googleapis.com', displayName: 'Service Usage API' },
      { name: 'secretmanager.googleapis.com', displayName: 'Secret Manager API' }
    ];

    try {
      for (const api of apis) {
        setStep3Message(`Enabling ${api.displayName}...`);
        addStep3Log(`Attempting to enable ${api.displayName}...`);
        
        const isAlreadyEnabled = await checkApiStatus(api.name);
        if (isAlreadyEnabled) {
          addStep3Log(`${api.displayName} is already enabled`);
          continue;
        }

        const response = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api.name}:enable`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${gcpAccessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errorMsg = errData.error?.message || response.statusText;
          
          if (errorMsg.includes('Billing') || errorMsg.includes('billing')) {
            addStep3Log(`Billing required for ${api.displayName}`);
            addStep3Log(`ERROR: ${errorMsg}`);
            setError('Billing must be enabled on your GCP project. Go to Google Cloud Console > Billing to link a billing account.');
          } else {
            addStep3Log(`Failed to enable ${api.displayName}: ${errorMsg}`);
          }
          console.warn(`Failed to enable ${api.name}:`, errData);
        } else {
          addStep3Log(`Successfully enabled ${api.displayName}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        let attempts = 0;
        while (attempts < 10) {
          const enabled = await checkApiStatus(api.name);
          if (enabled) {
            addStep3Log(`${api.displayName} is now active`);
            break;
          }
          addStep3Log(`Waiting for ${api.displayName} to activate... (${attempts + 1}/10)`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempts++;
        }
      }
      
      setStep3Message('All APIs enabled successfully!');
      addStep3Log('API enablement process complete');
      setStep3Status('complete');
    } catch (err) {
      console.error('Error enabling APIs:', err);
      setStep3Message('Failed to enable some APIs');
      addStep3Log(`Error: ${err.message}`);
      
      if (err.message?.includes('Billing') || err.message?.includes('billing')) {
        setError('Billing must be enabled on your GCP project. Go to Google Cloud Console > Billing to link a billing account.');
      } else {
        setError('Failed to enable required APIs. You may need to enable them manually.');
      }
    } finally {
      setEnablingApis(false);
    }
  };

  const createVm = async () => {
    if (!projectId || !gcpAccessToken) {
      setError('Project not configured');
      return;
    }

    setCreatingVm(true);
    setError(null);

    const zone = vmZone;
    const instanceName = 'kimaki-manager';
    const startupScript = getStartupScript(useOptimizedBundle);

    try {
      const checkResponse = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances?filter=name="${instanceName}"`,
        {
          headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
        }
      );
      
      const checkData = await checkResponse.json();
      if (checkData.items?.length > 0) {
        setVmIp(checkData.items[0].networkInterfaces[0].accessConfigs[0].natIP);
        setStep3Complete(true);
        expandNextStep(5);
        setCreatingVm(false);
        return;
      }

      const response = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${gcpAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: instanceName,
            machineType: `zones/${zone}/machineTypes/e2-micro`,
            disks: [{
              boot: true,
              autoDelete: true,
              initializeParams: {
                diskSizeGb: '10',
                sourceImage: 'projects/debian-cloud/global/images/family/debian-11',
              },
            }],
            networkInterfaces: [{
              network: 'global/networks/default',
              accessConfigs: [{
                type: 'ONE_TO_ONE_NAT',
              }],
            }],
            metadata: {
              items: [{
                key: 'startup-script',
                value: startupScript
              }]
            }
          })
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(err.error?.message || `Failed to create VM (${response.status})`);
      }

      await new Promise(resolve => setTimeout(resolve, 10000));

      const instanceResponse = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
        {
          headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
        }
      );
      
      const instanceData = await instanceResponse.json();
      const ip = instanceData.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
      
      if (ip) {
        setVmIp(ip);
        setStep3Complete(true);
        expandNextStep(5);
      } else {
        setStep3Complete(true);
        expandNextStep(5);
      }
    } catch (err) {
      console.error('Error creating VM:', err);
      setError(err.message || 'Failed to create VM');
    } finally {
      setCreatingVm(false);
    }
  };

  const handleConnectGoogle = () => {
    const client = initGoogleOAuth();
    if (client) {
      client.requestAccessToken();
    }
  };

  useEffect(() => {
    if (user) {
      setStep1Complete(true);
    } else {
      setStep1Complete(false);
    }
  }, [user]);

  useEffect(() => {
    const formProgress = loadFormProgress();
    console.log('Loading form progress:', formProgress);
    if (formProgress) {
      if (formProgress.firebaseConfigStaging) {
        setFirebaseConfigStaging(formProgress.firebaseConfigStaging);
        const parsed = parseFirebaseConfig(formProgress.firebaseConfigStaging);
        if (parsed) setFirebaseStagingData(parsed);
      }
      if (formProgress.firebaseConfigProduction) {
        setFirebaseConfigProduction(formProgress.firebaseConfigProduction);
        const parsed = parseFirebaseConfig(formProgress.firebaseConfigProduction);
        if (parsed) setFirebaseProductionData(parsed);
      }
      if (formProgress.vmHttpsUrl) setVmHttpsUrl(formProgress.vmHttpsUrl);
      if (formProgress.expandedSteps) setExpandedSteps(formProgress.expandedSteps);
      if (formProgress.step2Complete) setStep2Complete(formProgress.step2Complete);
      // Note: serviceAccountJson is NOT restored from storage since it contains sensitive private_key
      // User must re-upload the service account JSON each session
      if (formProgress.projectId) setProjectId(formProgress.projectId);
    }
    setFormProgressLoaded(true);
  }, []);

  useEffect(() => {
    if (!formProgressLoaded) return;
    
    const formData = {
      firebaseConfigStaging,
      firebaseConfigProduction,
      githubPat,
      discordBotToken,
      discordGuildId,
      expandedSteps,
      step2Complete,
      serviceAccountJson,
      projectId,
      gcpAccessToken: gcpAccessToken ? 'saved' : null,
    };
    console.log('Saving form progress:', formData);
    saveFormProgress(formData);
  }, [formProgressLoaded, firebaseConfigStaging, firebaseConfigProduction, githubPat, discordBotToken, discordGuildId, expandedSteps, step2Complete, serviceAccountJson, projectId, gcpAccessToken]);

  useEffect(() => {
    const loadInfraConfig = async () => {
      let configData = null;

      if (user) {
        try {
          const infraRef = doc(db, INFRA_COLLECTION, user.uid);
          const infraSnap = await getDoc(infraRef);

          if (infraSnap.exists()) {
            configData = infraSnap.data();
          }
        } catch (err) {
          console.error('Error loading infra config from Firestore:', err);
        }
      }

      if (!configData) {
        configData = loadFromLocalStorage();
      }

      if (configData) {
        setProjectId(configData.gcp_project_id || '');
        setGcpAccessToken(configData.gcp_access_token || null);
        setGithubAppInstalled(configData.github_app_installed || false);
        setVmIp(configData.vm_ip || '');
        setDiscordBotToken(configData.discord_bot_token || configData.discordBotToken || '');
        setDiscordGuildId(configData.discord_guild_id || configData.discordGuildId || '');
        setFirebaseConfigStaging(configData.firebase_staging ? JSON.stringify(configData.firebase_staging, null, 2) : '');
        setFirebaseConfigProduction(configData.firebase_production ? JSON.stringify(configData.firebase_production, null, 2) : '');
        setFirebaseStagingData(configData.firebase_staging || {});
        setFirebaseProductionData(configData.firebase_production || {});
        setGithubPat(configData.github_pat || '');
        
        // Note: service_account_key is NOT restored (private_key sensitive)
        // User must re-upload service account JSON each session

        const formProgress = loadFormProgress();
        
        if (!formProgress?.step1Complete && configData.gcp_project_id) setStep1Complete(true);
        if (!formProgress?.step2Complete && configData.gcp_project_id && configData.service_account_configured) setStep2Complete(true);
        if (!formProgress?.step3Complete && configData.vm_ip) {
          setStep3Complete(true);
        }
        
        if (configData.vm_ip && !expandedSteps.includes(7)) {
          setExpandedSteps(prev => [...prev, 7]);
        }

        if (configData.gcp_project_id && !configData.gcp_access_token) {
          setGcpConfigLost(true);
        }
      }

      setLoading(false);
      setCheckingCompletion(false);
    };

    loadInfraConfig();
  }, [db, user]);

  useEffect(() => {
    const loadProjects = async () => {
      if (!user) {
        setProjects([]);
        return;
      }
      setLoadingProjects(true);
      try {
        const loadedProjects = await loadProjectsFromFirestore(user.uid, db);
        setProjects(loadedProjects);
      } catch (err) {
        console.error('Error loading projects:', err);
      }
      setLoadingProjects(false);
    };
    loadProjects();
  }, [user, db]);

  const handleCopyScript = () => {
    navigator.clipboard.writeText(CloudShellScript({ projectId }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (!useFirestore || !user || !projectName || !passphrase || passphrase.length < 4 || !selectedProjectId) return;
    
    const timer = setTimeout(() => {
      autoSaveProject();
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [projectId, serviceAccountJson, discordBotToken, githubPat, firebaseConfigStaging, firebaseConfigProduction, vmIp, vmZone, useFirestore, user, projectName, passphrase, selectedProjectId]);

  useEffect(() => {
    if (user && !expandedSteps.includes(2) && isStepLocked(2) === false) {
      setExpandedSteps(prev => [...prev, 2]);
    }
  }, [user]);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setError('Please upload a JSON file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.private_key || !parsed.client_email) {
        throw new Error('Invalid service account key format');
      }

      setServiceAccountKey(parsed);
      setServiceAccountJson(parsed);
      
      if (user) {
        try {
          const infraRef = doc(db, INFRA_COLLECTION, user.uid);
          await setDoc(infraRef, {
            service_account_email: parsed.client_email,
            service_account_project_id: parsed.project_id,
            service_account_configured: true,
            updated_at: new Date().toISOString(),
          }, { merge: true });
        } catch (err) {
          console.error('Error auto-saving service account:', err);
        }
      }
    } catch (err) {
      setError('Invalid JSON or missing required fields');
      console.error('Error parsing key file:', err);
    }

    setUploading(false);
  };

  const saveConfig = async (configData) => {
    const finalData = {
      ...configData,
      gcp_project_id: projectId.trim(),
      github_app_installed: githubAppInstalled,
      service_account_configured: !!serviceAccountKey || gcpConnected,
      vm_ip: vmIp,
      firebase_staging_project_id: firebaseStagingData?.projectId,
      firebase_production_project_id: firebaseProductionData?.projectId,
      updated_at: new Date().toISOString(),
    };

    if (user) {
      const infraRef = doc(db, INFRA_COLLECTION, user.uid);
      await setDoc(infraRef, finalData, { merge: true });
      localStorage.removeItem(LOCALSTORAGE_KEY);
    } else {
      saveToLocalStorage(finalData);
    }

    if (useFirestore && user && projectName && passphrase && passphrase.length >= 4) {
      console.log('Saving project to Firestore:', { projectName, passphraseLength: passphrase.length });
      try {
        const projectIdToSave = selectedProjectId || `proj_${Date.now()}`;
        const discordGuildIdToSave = configData?.discord_guild_id || discordGuildId;
        console.log('Saving encrypted blob with discordGuildId:', discordGuildIdToSave || 'EMPTY');
        const encryptedConfig = await encryptData({
          gcp: {
            projectId: projectId.trim(),
            serviceAccountJson,
            discordBotToken,
            discordGuildId: discordGuildIdToSave
          },
          github: {
            pat: githubPat
          },
          firebase: {
            staging: firebaseConfigStaging,
            production: firebaseConfigProduction
          },
          vm: {
            ip: vmIp,
            zone: vmZone
          },
          projectName
        }, passphrase);
        
        await saveProjectToFirestore(user.uid, projectIdToSave, projectName, encryptedConfig, db);
        console.log('Project saved successfully');
        setSelectedProjectId(projectIdToSave);
        setIsCreatingNew(false);
        const updatedProjects = await loadProjectsFromFirestore(user.uid, db);
        setProjects(updatedProjects);
        console.log('Projects reloaded:', updatedProjects);
      } catch (err) {
        console.error('Error saving project:', err);
      }
    } else if (useFirestore && projectName) {
      console.log('Not saving to Firestore - need passphrase (min 4 chars)');
    }
  };

  const autoSaveProject = async () => {
    if (!useFirestore || !user || !projectName || !passphrase || passphrase.length < 4) return;
    if (!selectedProjectId) {
      console.log('No project selected, skipping auto-save');
      return;
    }
    
    try {
      const encryptedConfig = await encryptData({
        gcp: {
          projectId: projectId.trim(),
          serviceAccountJson,
          discordBotToken
        },
        github: {
          pat: githubPat
        },
        firebase: {
          staging: firebaseConfigStaging,
          production: firebaseConfigProduction
        },
        vm: {
          ip: vmIp,
          zone: vmZone
        },
        projectName
      }, passphrase);
      
      await saveProjectToFirestore(user.uid, selectedProjectId, projectName, encryptedConfig, db);
      console.log('Project auto-saved');
    } catch (err) {
      console.error('Error auto-saving project:', err);
    }
  };

  const handleSaveConfig = async () => {
    if (!projectId.trim()) return;

    setSaving(true);
    setError(null);

    try {
      await saveConfig({
        created_at: new Date().toISOString(),
      });

    } catch (err) {
      console.error('Error saving config:', err);
      setError('Failed to save configuration');
    }

    setSaving(false);
  };

  const handleMergeToAccount = async () => {
    if (!user) {
      setError('Please sign in to merge your configuration');
      return;
    }

    setSaving(true);
    setMergeStatus('merging');

    try {
      const localConfig = loadFromLocalStorage();
      if (!localConfig) {
        setError('No pending configuration to merge');
        setSaving(false);
        return;
      }

      await saveConfig(localConfig);
      setMergeStatus('success');

    } catch (err) {
      console.error('Error merging config:', err);
      setError('Failed to merge configuration');
      setMergeStatus('error');
    }

    setSaving(false);
    setTimeout(() => setMergeStatus(null), 3000);
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your infrastructure? This will remove your GCP project linkage.')) {
      return;
    }

    try {
      if (user) {
        const infraRef = doc(db, INFRA_COLLECTION, user.uid);
        await deleteDoc(infraRef);
      }
      localStorage.removeItem(LOCALSTORAGE_KEY);
      localStorage.removeItem(FORM_PROGRESS_KEY);
      
      setProjectId('');
      setGcpConnected(false);
      setGcpAccessToken(null);
      setServiceAccountKey(null);
      setServiceAccountJson(null);
      setServiceAccountError(null);
      setVmIp('');
      setDiscordBotToken('');
      setGithubAppInstalled(false);
      setGithubPat('');
      setFirebaseConfigStaging('');
      setFirebaseConfigProduction('');
      setFirebaseStagingData({});
      setFirebaseProductionData({});
      
      setStep1Complete(false);
      setStep2Complete(false);
      setStep3Complete(false);
      setGcpConfigLost(false);
      
      setExpandedSteps([]);
      setError(null);
    } catch (err) {
      console.error('Error disconnecting:', err);
      setError('Failed to disconnect');
    }
  };

  const handleInstallGitHubApp = () => {
    const clientId = import.meta.env.VITE_GITHUB_APP_CLIENT_ID || 'YOUR_CLIENT_ID';
    const redirectUri = encodeURIComponent(window.location.origin + '/github-callback');
    const state = user?.uid || 'anonymous';
    window.location.href = `https://github.com/apps/secureagentbase/installations/new?state=${state}&redirect_uri=${redirectUri}`;
  };

  const parseFirebaseConfig = (rawConfig) => {
    try {
      let configStr = rawConfig.trim();
      
      if (configStr.includes('firebaseConfig')) {
        const configMatch = configStr.match(/firebaseConfig\s*=\s*({[^}]+})/s);
        if (configMatch) {
          configStr = configMatch[1];
        }
      }
      
      const parsed = {};
      const keyPairs = configStr.match(/(\w+):\s*["']([^"']+)["']/g);
      if (!keyPairs) return null;
      
      keyPairs.forEach(pair => {
        const match = pair.match(/(\w+):\s*["']([^"']+)["']/);
        if (match) {
          parsed[match[1]] = match[2];
        }
      });
      
      return parsed;
    } catch (e) {
      console.error('Error parsing Firebase config:', e);
      return null;
    }
  };

  const handleSetupFirebase = async () => {
    setError(null);
    
    let stagingConfig = null;
    let productionConfig = null;
    
    if (firebaseConfigStaging.trim()) {
      stagingConfig = parseFirebaseConfig(firebaseConfigStaging);
      if (!stagingConfig) {
        setError('Could not parse Staging Firebase config. Make sure you paste the full firebaseConfig object.');
        return;
      }
      setFirebaseStagingData(stagingConfig);
    } else {
      setError('Please paste the Staging Firebase SDK config');
      return;
    }
    
    if (firebaseConfigProduction.trim()) {
      productionConfig = parseFirebaseConfig(firebaseConfigProduction);
      if (!productionConfig) {
        setError('Could not parse Production Firebase config. Make sure you paste the full firebaseConfig object.');
        return;
      }
      setFirebaseProductionData(productionConfig);
    } else {
      setError('Please paste the Production Firebase SDK config');
      return;
    }
    
    try {
      if (!expandedSteps.includes(5)) {
        setExpandedSteps(prev => [...prev, 5]);
      }
    } catch (err) {
      console.error('Error setting up Firebase:', err);
      setError('Failed to configure Firebase: ' + err.message);
    }
  };

  const handleForkGitHub = async () => {
    setError(null);
    
    const clientId = import.meta.env.VITE_GITHUB_APP_CLIENT_ID;
    if (!clientId) {
      setError('GitHub OAuth not configured. Please set VITE_GITHUB_APP_CLIENT_ID in environment.');
      return;
    }

    const redirectUri = encodeURIComponent(window.location.origin + '/github-callback');
    const state = user?.uid || 'anonymous';
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo,workflow,read:org&state=${state}`;
    window.location.href = githubAuthUrl;
  };

  const handleCreateVM = async () => {
    if (!serviceAccountKey || !projectId) {
      setError('Please configure GCP project and service account first');
      return;
    }

    if (!vmIp) {
      setError('No VM IP configured. For initial setup, please manually create the VM via Cloud Console or gcloud CLI, then enter the IP below.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`http://${vmIp}:3000/api/provision-manager-vm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId,
          serviceAccountKey,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to create VM');
      }

      const result = await response.json();
      setVmIp(result.ip);
      await saveConfig({ vm_ip: result.ip });
    } catch (err) {
      console.error('Error creating VM:', err);
      setError(err.message);
    }

    setSaving(false);
  };

  const handleManualVMIP = () => {
    const ip = prompt('Enter your Kimaki VM IP address:');
    if (ip) {
      setVmIp(ip);
      saveConfig({ vm_ip: ip });
    }
  };

  const getAccessToken = async () => {
    if (gcpAccessToken) return gcpAccessToken;
    if (serviceAccountJson) {
      const saToken = await getServiceAccountToken();
      if (saToken) return saToken;
    }
    return null;
  };

  const handleCreateDiscordBot = async () => {
    if (!discordBotTokenInput.trim()) {
      setError('Please enter your Discord bot token');
      return;
    }

    if (!hasGcpAccess()) {
      const missing = [];
      if (!projectId) missing.push('GCP Project ID');
      if (!serviceAccountJson) missing.push('Service Account Key');
      setError(`Missing: ${missing.join(', ')}. Complete Step 2 to configure.`);
      return;
    }
    
    const accessToken = await getAccessToken();
    
    setSaving(true);
    setError(null);

    try {
      // Auto-detect Discord servers the bot is in
      setDiscordDetecting(true);
      let detectedGuildId = '';
      let guildDetectionFailed = false;
      try {
        const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
          headers: {
            'Authorization': `Bot ${discordBotTokenInput}`,
          },
        });
        
        if (guildsResponse.ok) {
          const guilds = await guildsResponse.json();
          setDetectedGuilds(guilds);
          
          if (guilds.length === 1) {
            detectedGuildId = guilds[0].id;
            setDiscordGuildId(detectedGuildId);
            console.log('Auto-detected Discord server:', guilds[0].name);
          } else if (guilds.length > 1) {
            detectedGuildId = guilds[0].id;
            setDiscordGuildId(detectedGuildId);
            console.log(`Bot is in ${guilds.length} servers. Auto-selected first: ${guilds[0].name}`);
          } else {
            console.log('Bot is not in any servers. Add the bot to your Discord server first.');
            setError('Bot is not in any servers. Invite the bot to your Discord server first.');
            guildDetectionFailed = true;
          }
        } else {
          console.warn('Could not fetch Discord guilds');
          guildDetectionFailed = true;
        }
      } catch (guildErr) {
        console.warn('Could not detect Discord servers:', guildErr.message);
        guildDetectionFailed = true;
      }
      setDiscordDetecting(false);
      
      // Don't save if guild detection failed
      if (guildDetectionFailed) {
        setSaving(false);
        return;
      }
      
      setDiscordBotToken(discordBotTokenInput);
      console.log('Saving Discord config:', { 
        discord_bot_token: discordBotTokenInput ? '[REDACTED]' : 'empty',
        discord_guild_id: detectedGuildId || 'EMPTY - will skip Discord channel',
        current_discordGuildId: discordGuildId
      });
      await saveConfig({ 
        discord_bot_token: discordBotTokenInput,
        discord_guild_id: detectedGuildId || discordGuildId  // Use detected or current
      });
      console.log('Discord config saved, discordGuildId state is now:', discordGuildId);
      expandNextStep(6);
    } catch (err) {
      console.error('Error saving discord bot token:', err);
      setError(err.message);
    }

    setSaving(false);
  };

  const pendingConfig = !user && loadFromLocalStorage();

  const getStepHeader = (stepNumber, title, icon, isComplete, isActive, isLocked, info, isWarning = false, onEdit = null) => {
    const baseClasses = "flex items-center justify-between w-full p-4 rounded-lg transition-all duration-200";
    let bgClasses = "bg-gray-50";
    let borderClasses = "border border-gray-200";
    let textClasses = "text-gray-500";
    let iconColor = "text-gray-400";
    
    if (isWarning) {
      bgClasses = "bg-yellow-50";
      borderClasses = "border-2 border-yellow-500";
      textClasses = "text-yellow-700";
      iconColor = "text-yellow-600";
    } else if (isComplete) {
      bgClasses = "bg-green-50";
      borderClasses = "border-2 border-green-500";
      textClasses = "text-green-700";
      iconColor = "text-green-600";
    } else if (isActive) {
      bgClasses = "bg-blue-50";
      borderClasses = "border-2 border-blue-500";
      textClasses = "text-blue-700";
      iconColor = "text-blue-600";
    } else if (isLocked) {
      bgClasses = "bg-gray-50 opacity-60";
      borderClasses = "border border-gray-200";
    }

    const handleHeaderClick = () => {
      if (isLocked) return;
      toggleStep(stepNumber);
    };

    return (
      <div className={`${baseClasses} ${bgClasses} ${borderClasses} ${isLocked ? 'opacity-60' : ''}`}>
        <button
          onClick={handleHeaderClick}
          disabled={isLocked}
          className={`flex items-center gap-3 flex-1 text-left ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {isComplete || isWarning ? (isWarning ? <AlertTriangle className={iconColor} size={24} /> : <Check className={iconColor} size={24} />) : icon}
          <span className={`font-semibold ${textClasses}`}>{title}</span>
          {isWarning && <span className="text-xs text-yellow-600 ml-2">(Re-authentication required)</span>}
          {isLocked && <span className="text-xs text-gray-400 ml-2">(Complete previous step first)</span>}
          {info && (
            <div className="relative group">
              <svg className={`w-4 h-4 ${textClasses} cursor-help`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="absolute left-0 bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {info}
              </div>
            </div>
          )}
        </button>
        <div className="flex items-center gap-2">
          {isComplete && onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className={`p-1.5 rounded hover:bg-green-100 text-green-600`}
              title="Edit step"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
          {expandedSteps.includes(stepNumber) ? (
            <svg className={`w-5 h-5 ${textClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className={`w-5 h-5 ${textClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Infrastructure Setup</h1>
          <p className="text-gray-600">Configure GCP, GitHub, and Discord for autonomous deployments</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingConfig && user && (
            <button
              onClick={handleMergeToAccount}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Check size={18} />
              {mergeStatus === 'merging' ? 'Merging...' : 'Merge Pending Config'}
            </button>
          )}
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Back to Home
          </button>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="font-medium text-gray-700">Project:</label>
            <select
              value={selectedProjectId}
              onChange={async (e) => {
                const projId = e.target.value;
                setSelectedProjectId(projId);
                setIsCreatingNew(false);
                if (!projId) {
                  setProjectName('');
                  setUseFirestore(false);
                  return;
                }
                const proj = projects.find(p => p.id === projId);
                if (proj) {
                  setProjectName(proj.name || '');
                  setUseFirestore(true);
                  setPendingDecryptProject(proj.encryptedData ? proj : null);
                  setDecryptPassphrase('');
                  setDecryptError('');
                  if (!proj.encryptedData) {
                    if (proj.gcp) {
                      setProjectId(proj.gcp.projectId || '');
                      setServiceAccountJson(proj.gcp.serviceAccountJson || null);
                      setDiscordBotToken(proj.gcp.discordBotToken || '');
                    }
                    if (proj.github) {
                      setGithubPat(proj.github.pat || '');
                    }
                    if (proj.firebase) {
                      setFirebaseConfigStaging(proj.firebase.staging || '');
                      setFirebaseConfigProduction(proj.firebase.production || '');
                    }
                    if (proj.vm) {
                      setVmIp(proj.vm.ip || '');
                      setVmZone(proj.vm.zone || 'us-east1-b');
                    }
                  }
                }
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
            >
              <option value="">Select a project</option>
              {projects.map(proj => (
                <option key={proj.id} value={proj.id}>{proj.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              setSelectedProjectId('');
              setProjectName('');
              setIsCreatingNew(true);
              setProjectId('');
              setServiceAccountJson(null);
              setDiscordBotToken('');
              setGithubPat('');
              setFirebaseConfigStaging('');
              setFirebaseConfigProduction('');
              setVmIp('');
              setStep1Complete(false);
              setStep2Complete(false);
              setStep3Complete(false);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center gap-1"
          >
            + New Project
          </button>
        </div>

        {isCreatingNew && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name:</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name (e.g., my-app-staging)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 mb-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useFirestore}
              onChange={(e) => setUseFirestore(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">Store encrypted credentials in Firestore</span>
          </label>
          {useFirestore && (
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase (min 4 chars)"
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
            />
          )}
          {pendingDecryptProject && (
            <div className="w-full mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800 mb-2">This project is encrypted. Enter passphrase to decrypt:</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={decryptPassphrase}
                  onChange={(e) => setDecryptPassphrase(e.target.value)}
                  placeholder="Enter passphrase"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
                />
                <button
                  onClick={async () => {
                    if (!decryptPassphrase) return;
                    try {
                      const decrypted = await decryptData(pendingDecryptProject.encryptedData, decryptPassphrase);
                      if (decrypted.gcp) {
                        setProjectId(decrypted.gcp.projectId || '');
                        setServiceAccountJson(decrypted.gcp.serviceAccountJson || null);
                        setDiscordBotToken(decrypted.gcp.discordBotToken || '');
                        setDiscordBotTokenInput(decrypted.gcp.discordBotToken || '');
                        setDiscordGuildId(decrypted.gcp.discordGuildId || '');
                      }
                      if (decrypted.github) {
                        setGithubPat(decrypted.github.pat || '');
                      }
                      if (decrypted.firebase) {
                        setFirebaseConfigStaging(decrypted.firebase.staging || '');
                        setFirebaseConfigProduction(decrypted.firebase.production || '');
                        const stagingParsed = parseFirebaseConfig(decrypted.firebase.staging);
                        if (stagingParsed) setFirebaseStagingData(stagingParsed);
                        const productionParsed = parseFirebaseConfig(decrypted.firebase.production);
                        if (productionParsed) setFirebaseProductionData(productionParsed);
                      }
                      if (decrypted.vm) {
                        setVmIp(decrypted.vm.ip || '');
                        setVmZone(decrypted.vm.zone || 'us-east1-b');
                      }
                      const hasProjectId = !!decrypted.gcp?.projectId;
                      const hasServiceAccount = !!decrypted.gcp?.serviceAccountJson;
                      const hasFirebase = !!(decrypted.firebase?.staging && decrypted.firebase?.production);
                      const hasGithub = !!decrypted.github?.pat;
                      const hasDiscord = !!decrypted.gcp?.discordBotToken;
                      const hasVm = !!decrypted.vm?.ip;
                      
                      let nextStep = 1;
                      if (user) nextStep = 2;
                      if (hasServiceAccount) nextStep = 3;
                      if (hasFirebase) nextStep = 4;
                      if (hasGithub) nextStep = 5;
                      if (hasDiscord) nextStep = 6;
                      if (hasVm) nextStep = 7;
                      
                      const newExpanded = [nextStep];
                      if (hasVm && !newExpanded.includes(7)) newExpanded.push(7);
                      setExpandedSteps(newExpanded);
                      setGcpConfigLost(false);
                      setPendingDecryptProject(null);
                      setDecryptPassphrase('');
                      setDecryptError('');
                      setPassphrase(decryptPassphrase);
                      setUseFirestore(true);
                    } catch (err) {
                      console.error('Failed to decrypt project:', err);
                      setDecryptError('Incorrect passphrase or corrupted data');
                    }
                  }}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg"
                >
                  Decrypt
                </button>
                <button
                  onClick={() => {
                    setPendingDecryptProject(null);
                    setDecryptPassphrase('');
                    setDecryptError('');
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
              </div>
              {decryptError && (
                <p className="text-red-600 text-sm mt-2">{decryptError}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => {
              const configData = {
                gcp: {
                  projectId,
                  serviceAccountJson,
                  discordBotToken,
                  discordGuildId
                },
                github: {
                  pat: githubPat
                },
                firebase: {
                  staging: firebaseConfigStaging,
                  production: firebaseConfigProduction
                },
                vm: {
                  ip: vmIp,
                  zone: vmZone
                },
                projectName
              };
              
              const jsonStr = await encryptData(configData, passphrase);
              const blob = new Blob([jsonStr], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = projectName ? `${projectName}-config.json` : 'secureagent-config.json';
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm"
          >
            Export Settings
          </button>
          <label className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm cursor-pointer">
            Import File
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  let data;
                  try {
                    data = await decryptData(text, passphrase);
                  } catch {
                    data = JSON.parse(text);
                  }
                  if (data.gcp) {
                    setProjectId(data.gcp.projectId || '');
                    setServiceAccountJson(data.gcp.serviceAccountJson || null);
                    setDiscordBotToken(data.gcp.discordBotToken || '');
                  }
                  if (data.github) {
                    setGithubPat(data.github.pat || '');
                  }
                  if (data.firebase) {
                    setFirebaseConfigStaging(data.firebase.staging || '');
                    setFirebaseConfigProduction(data.firebase.production || '');
                  }
                  if (data.vm) {
                    setVmIp(data.vm.ip || '');
                    setVmZone(data.vm.zone || 'us-east1-b');
                  }
                  if (data.projectName) {
                    setProjectName(data.projectName);
                  }
                } catch (err) {
                  console.error('Import failed:', err);
                  setError('Failed to import config file');
                }
              }}
            />
          </label>
        </div>
      </div>

      {pendingConfig && !user && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800">
            ⚠️ Configuration saved locally. Sign in to save to your account.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
          <AlertTriangle className="text-red-500" size={20} />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {checkingCompletion && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span className="text-blue-700">Checking completion status...</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          {getStepHeader(1, "Step 1: Account", <Shield className="text-blue-600" size={24} />, isStepCompleted(1), isStepActive(1), isStepLocked(1), "Sign in to continue.")}
          
          {expandedSteps.includes(1) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {user ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Signed in as {user.email}</span>
                </div>
              ) : (
                <p className="text-gray-600">Please sign in to continue.</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(2, "Step 2: Service Account", <Upload className="text-blue-600" size={24} />, isStepCompleted(2), isStepActive(2), isStepLocked(2), "Create a service account in your GCP project and paste the JSON key. This lets us create VMs without accessing your personal account.", isStepWarning(2), () => editStep(2))}
          
          {expandedSteps.includes(2) && !isStepCompleted(1) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 1 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(2) && isStepCompleted(1) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {(isStepCompleted(2) && !expandedSteps.includes(2)) ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Service account configured</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-2">Create a service account in your GCP project:</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm">
                      <li>Go to <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud IAM → Service Accounts</a></li>
                      <li>Select your project from the dropdown at the top</li>
                      <li>Click "+ Create Service Account"</li>
                      <li>Name: <code className="bg-blue-100 px-1">secureagent</code></li>
                      <li>Grant roles: <strong>Compute Admin</strong>, <strong>Service Account User</strong>, <strong>Project Billing Manager</strong>, and <strong>Service Usage Admin</strong></li>
                      <li>After creation, click <strong>Actions → Manage keys → Add key → Create new key</strong></li>
                      <li>Select <strong>JSON</strong> and download</li>
                      <li>Open the JSON file, copy all content, paste below</li>
                    </ol>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Paste service account JSON key:</label>
                    <textarea
                      value={serviceAccountJson ? JSON.stringify(serviceAccountJson, null, 2) : ''}
                      onChange={(e) => {
                        setServiceAccountError(null);
                        try {
                          const parsed = JSON.parse(e.target.value);
                          console.log('Parsed service account:', parsed ? 'valid' : 'null', parsed?.project_id);
                          if (!parsed.private_key) throw new Error('Invalid - missing private_key');
                          setServiceAccountJson(parsed);
                          console.log('Service account JSON set successfully');
                        } catch (err) {
                          console.log('Service account parse error:', err.message);
                          setServiceAccountError('Invalid JSON. Paste the complete service account JSON file.');
                        }
                      }}
                      placeholder='{"type": "service_account", "project_id": "...", "private_key": "..."}'
                      className="w-full h-40 px-4 py-2 border-2 border-gray-200 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-400"
                    />
                    {serviceAccountError && <p className="text-red-600 text-sm mt-1">{serviceAccountError}</p>}
                  </div>
                  
                  <button
                    onClick={() => {
                      console.log('Continue clicked, serviceAccountJson:', !!serviceAccountJson, serviceAccountJson?.project_id);
                      if (serviceAccountJson && serviceAccountJson.project_id) {
                        setStep2Complete(true);
                        setExpandedSteps(prev => [...prev, 3]);
                      } else {
                        setServiceAccountError('Please paste a valid service account JSON');
                      }
                    }}
                    disabled={!serviceAccountJson}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                  >
                    Continue
                  </button>
                  
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-gray-600 text-sm">Don't want to create a service account?</p>
                    <button
                      onClick={() => { setStep2Complete(true); setExpandedSteps(prev => [...prev, 3]); }}
                      className="text-blue-600 hover:text-blue-700 text-sm underline"
                    >
                      Skip to manual VM setup
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(3, "Step 3: GCP Project", <Server className="text-blue-600" size={24} />, isStepCompleted(3), isStepActive(3), isStepLocked(3), "Select or create a GCP project for your VM.", false, () => editStep(3))}
          
          {expandedSteps.includes(3) && !isStepCompleted(2) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 2 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(3) && isStepCompleted(2) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {(step3Complete && !expandedSteps.includes(3)) ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Project configured: {projectId}</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-2">Enter your GCP Project ID:</p>
                    <p className="text-blue-700 text-sm mb-3">
                      This is the project where your VM will be created. It should match the <code className="bg-blue-100 px-1">project_id</code> in your service account JSON.
                    </p>
                    <input
                      type="text"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      placeholder="my-gcp-project-123"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                    {serviceAccountJson?.project_id && (
                      <p className="text-blue-600 text-sm mt-2">
                        From your service account: <code className="bg-blue-100 px-1">{serviceAccountJson.project_id}</code>
                        <button
                          onClick={() => setProjectId(serviceAccountJson.project_id)}
                          className="ml-2 text-blue-600 underline text-xs"
                        >
                          Use this
                        </button>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (projectId.trim()) {
                        setStep3Complete(true);
                        expandNextStep(3);
                      } else {
                        setError('Please enter a GCP project ID');
                      }
                    }}
                    disabled={!projectId.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                  >
                    Continue
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(4, "Step 4: Firebase Setup", <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M3.89 15.672L6.255.461A.542.542 0 0 1 7.27.288l2.543 4.771zm16.794 3.692l-2.25-14a.54.54 0 0 0-.919-.295L3.316 19.365l7.856 4.427a1.621 1.621 0 0 0 1.588 0zM14.3 7.147l-1.82-3.482a.542.542 0 0 0-.96 0L3.53 17.984z"/></svg>, isStepCompleted(4), isStepActive(4), isStepLocked(4), "Configure Firebase hosting for your staging and production environments.", false, () => editStep(4))}
          
          {expandedSteps.includes(4) && !isStepCompleted(3) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 3 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(4) && isStepCompleted(3) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {(isStepCompleted(4) && !expandedSteps.includes(4)) ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Firebase configured: Staging ({firebaseStagingData.projectId}), Production ({firebaseProductionData.projectId})</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-3">Set up Firebase for staging and production:</p>
                    <p className="text-blue-700 text-sm mb-4">
                      Follow these steps for <strong>each</strong> environment (staging and production):
                    </p>
                    <ol className="list-decimal list-inside space-y-2 text-blue-700 text-sm mb-4">
                      <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">Firebase Console</a></li>
                      <li>Click "Add project" → enter name (e.g., "my-app-staging") → disable Google Analytics → Create</li>
                      <li>Once created, click "Build" → "Hosting" → "Get started" → "Continue" (skip the CLI steps)</li>
                      <li>Click the gear icon ⚙️ → "Project settings"</li>
                      <li>Scroll to "Your apps" → click the web icon &lt;/&gt; → Register app → "Add Firebase SDK" → copy just the <code className="bg-blue-100 px-1">firebaseConfig</code> object (not the whole script tag)</li>
                    </ol>
                    <p className="text-blue-700 text-sm font-medium">
                      Repeat for both staging and production, then paste both configs below.
                    </p>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Staging Firebase SDK config:</label>
                    <textarea
                      value={firebaseConfigStaging}
                      onChange={(e) => setFirebaseConfigStaging(e.target.value)}
                      placeholder={"{\"apiKey\": \"AIza...\", \"authDomain\": \"my-app-staging.firebaseapp.com\", \"projectId\": \"my-app-staging\", \"storageBucket\": \"my-app-staging.appspot.com\", \"messagingSenderId\": \"123456789\", \"appId\": \"1:123456789:web:abc123\"}"}
                      className="w-full h-28 px-3 py-2 border-2 border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-blue-400"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Production Firebase SDK config:</label>
                    <textarea
                      value={firebaseConfigProduction}
                      onChange={(e) => setFirebaseConfigProduction(e.target.value)}
                      placeholder={"{\"apiKey\": \"AIza...\", \"authDomain\": \"my-app-production.firebaseapp.com\", \"projectId\": \"my-app-production\", \"storageBucket\": \"my-app-production.appspot.com\", \"messagingSenderId\": \"123456789\", \"appId\": \"1:123456789:web:abc123\"}"}
                      className="w-full h-28 px-3 py-2 border-2 border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  
                  <button
                    onClick={handleSetupFirebase}
                    disabled={!firebaseConfigStaging.trim() || !firebaseConfigProduction.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                  >
                    Configure Firebase
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(5, "Step 5: GitHub Auth", <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>, isStepCompleted(5), isStepActive(5), isStepLocked(5), "Create a GitHub Personal Access Token for the VM to authenticate with GitHub.", false, () => editStep(5))}
          
          {expandedSteps.includes(5) && !isStepCompleted(4) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 4 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(5) && isStepCompleted(4) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {(isStepCompleted(5) && !expandedSteps.includes(5)) ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">GitHub auth configured</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-2">Create a GitHub Personal Access Token:</p>
                    <p className="text-blue-700 text-sm mb-3">
                      The VM needs this to push/pull code from your repo. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token.
                    </p>
                    <p className="text-blue-700 text-sm mb-2">
                      <strong>Required scopes:</strong> <code className="bg-blue-100 px-1">repo</code>, <code className="bg-blue-100 px-1">workflow</code>, <code className="bg-blue-100 px-1">read:org</code>
                    </p>
                    <a 
                      href="https://github.com/settings/tokens/new?scopes=repo,workflow,read:org" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline text-sm"
                    >
                      Create Token on GitHub
                    </a>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Enter your GitHub PAT:</label>
                    <input
                      type="password"
                      value={githubPat}
                      onChange={(e) => setGithubPat(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                    <p className="text-gray-500 text-xs mt-1">
                      Will be encrypted and sent to your VM for GitHub authentication
                    </p>
                  </div>
                  
                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {error}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      setError(null);
                      if (githubPat.trim() && githubPat.startsWith('ghp_')) {
                        if (!expandedSteps.includes(6)) {
                          setExpandedSteps(prev => [...prev, 6]);
                        }
                      } else {
                        setError('Please enter a valid GitHub PAT (starts with ghp_)');
                      }
                    }}
                    disabled={!githubPat.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                  >
                    Save GitHub PAT
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(6, "Step 6: Discord Bot", <Bot className="text-blue-600" size={24} />, isStepCompleted(6), isStepActive(6), isStepLocked(6), "Create a Discord bot and add it to your server. The VM will use this bot to create channels and send messages.", false, () => editStep(6))}
          
          {expandedSteps.includes(6) && !isStepCompleted(5) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 5 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(6) && isStepCompleted(5) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {!serviceAccountJson && projectId && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-yellow-800 font-medium mb-1">Service Account Required</p>
                  <p className="text-yellow-700 text-sm">Re-upload your service account JSON key (Step 2) to continue with Discord bot setup.</p>
                </div>
              )}
              
              <p className="text-gray-600 mb-4">
                Configure Discord bot token. <strong>Important:</strong> Add the bot to your Discord server before creating the VM.
              </p>
              
              {discordBotToken && (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg mb-4">
                  <Check size={18} />
                  <span className="text-sm font-medium">Discord bot token configured</span>
                </div>
              )}
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-blue-800 font-medium mb-2">Create a Discord bot:</p>
                <ol className="list-decimal list-inside space-y-2 text-blue-700 text-sm">
                  <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="underline font-medium">Discord Developer Portal</a></li>
                  <li>Click "New Application" → give it a name (e.g., "Kimaki")</li>
                  <li>Go to "Bot" in the left sidebar → click "Add Bot"</li>
                  <li>In "General Information", scroll down and <strong>disable "Public Bot"</strong> (prevents others from adding your bot)</li>
                  <li>In "OAuth2" → "General", set <strong>"Default Install Link" to "None"</strong> (required when Public Bot is disabled)</li>
                  <li>Back in "Bot", scroll down to "Privileged Gateway Intents" → enable <strong>Message Content Intent</strong> (required for Kimaki to read messages)</li>
                  <li>Go to "OAuth2" → "URL Generator"</li>
                  <li>Under "Scopes", check <code className="bg-blue-100 px-1">bot</code></li>
                  <li>Under "Bot Permissions", check <strong>Send Messages</strong>, <strong>Read Message History</strong>, <strong>Manage Channels</strong>, and <strong>Use Slash Commands</strong></li>
                  <li>Copy the generated URL at the bottom, open it in a new tab, and select your server to invite the bot</li>
                  <li>Go back to "Bot" → click "Reset Token" → copy the token</li>
                  <li>Enable Developer Mode in Discord (<strong>User Settings → Advanced → Developer Mode</strong>), then right-click your server name → <strong>Copy Server ID</strong></li>
                </ol>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discord Bot Token
                </label>
                <input
                  type="password"
                  value={discordBotTokenInput}
                  onChange={(e) => setDiscordBotTokenInput(e.target.value)}
                  placeholder="Paste your Discord bot token here"
                  disabled={!hasGcpAccess()}
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Discord Server ID <span className="text-gray-400 font-normal">(optional - auto-detected)</span>
                    </label>
                    {detectedGuilds.length > 1 ? (
                      <select
                        value={discordGuildId}
                        onChange={(e) => setDiscordGuildId(e.target.value)}
                        disabled={!hasGcpAccess()}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">Select a server...</option>
                        {detectedGuilds.map(guild => (
                          <option key={guild.id} value={guild.id}>
                            {guild.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={discordGuildId}
                        onChange={(e) => setDiscordGuildId(e.target.value)}
                        placeholder="Will be auto-detected after saving token"
                        disabled={!hasGcpAccess()}
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      />
                    )}
                    {detectedGuilds.length > 0 && (
                      <p className="text-xs text-green-600 mt-1">
                        ✓ Auto-detected {detectedGuilds.length} server{detectedGuilds.length > 1 ? 's' : ''}
                        {detectedGuilds.length === 1 && ` - will use: ${detectedGuilds[0].name}`}
                      </p>
                    )}
                    {discordDetecting && (
                      <p className="text-xs text-blue-600 mt-1 animate-pulse">
                        Detecting Discord servers...
                      </p>
                    )}
                  </div>
                  {error && discordGuildId && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
                      ⚠️ {error} - You can still continue, but Discord channel won't be created.
                    </div>
                  )}
                  {error && !discordGuildId && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {error}
                    </div>
                  )}
                  <button
                    onClick={handleCreateDiscordBot}
                    disabled={saving || discordDetecting || !discordBotTokenInput.trim() || !hasGcpAccess()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Bot size={18} />
                    {saving || discordDetecting ? 'Detecting...' : 'Save Token'}
                  </button>
              </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(7, "Step 7: Create VM", <Server className="text-blue-600" size={24} />, isStepCompleted(7), isStepActive(7), isStepLocked(7), "Create a GCP VM that will fork SecureAgentBase, set up GitHub Actions, download Kimaki, and configure your Discord bot.", false, () => editStep(7))}
          
          {expandedSteps.includes(7) && !isStepCompleted(6) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 6 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(7) && isStepCompleted(6) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {isStepCompleted(7) ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                    <Check size={20} />
                    <span className="font-medium">VM created and ready at {vmIp}</span>
                  </div>
                  
                  <div className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium text-gray-700">VM Serial Port Logs</h3>
                      <button
                        onClick={fetchVmLogs}
                        disabled={loadingVmLogs}
                        className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg flex items-center gap-1"
                      >
                        {loadingVmLogs ? (
                          <span className="animate-spin">⟳</span>
                        ) : (
                          <span>↻</span>
                        )}
                        Refresh Logs
                      </button>
                    </div>
                    {loadingVmLogs ? (
                      <div className="flex items-center justify-center py-8 text-blue-600">
                        <div className="animate-spin mr-2">⟳</div>
                        Fetching VM logs...
                      </div>
                    ) : vmLogs ? (
                      <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono max-h-64 overflow-y-auto whitespace-pre-wrap">
                        {vmLogs}
                      </pre>
                    ) : (
                      <p className="text-gray-500 text-sm">Click "Refresh Logs" to view VM startup output</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useOptimizedBundle}
                        onChange={(e) => setUseOptimizedBundle(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-600">Optimized</span>
                    </label>
                    <button
                      onClick={async () => {
                        if (!serviceAccountJson || !projectId) {
                          setError('Service account and project ID required');
                          return;
                        }
                        if (!discordGuildId) {
                          addStep4Log('WARNING: Discord Guild ID not set - Discord channel will not be created');
                        }
                        setVmIp('');
                        setStep4Logs([]);
                        setVmLogs('');
                        setStep4Status('enabling');
                        setStep4Message('Getting service account token...');
                        addStep4Log('Starting VM recreation process...');
                        
                        const token = await getServiceAccountToken();
                        if (!token) {
                          setError('Failed to authenticate with service account');
                          setStep4Status('error');
                          return;
                        }
                        addStep4Log('Service account authenticated');
                        
                        const apis = [
                          { name: 'compute.googleapis.com', displayName: 'Compute Engine API' },
                          { name: 'cloudresourcemanager.googleapis.com', displayName: 'Cloud Resource Manager API' },
                          { name: 'serviceusage.googleapis.com', displayName: 'Service Usage API' }
                        ];
                        
                        for (const api of apis) {
                          setStep4Message(`Enabling ${api.displayName}...`);
                          addStep4Log(`Enabling ${api.displayName}...`);
                          
                          try {
                            const response = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api.name}:enable`, {
                              method: 'POST',
                              headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                              }
                            });
                            
                            if (response.ok) {
                              addStep4Log(`${api.displayName} enabled`);
                            } else {
                              const errData = await response.json().catch(() => ({}));
                              const errMsg = errData.error?.message || '';
                              if (errMsg.includes('billing')) {
                                setError('Billing must be enabled on your GCP project');
                                addStep4Log(`ERROR: Billing required for ${api.displayName}`);
                              } else if (errMsg.includes('already') || errMsg.includes('enabled')) {
                                addStep4Log(`${api.displayName} already enabled`);
                              } else {
                                addStep4Log(`Note: ${errMsg || 'Continuing...'}`);
                              }
                            }
                          } catch (e) {
                            addStep4Log(`Error enabling ${api.displayName}: ${e.message}`);
                          }
                          
                          await new Promise(r => setTimeout(r, 1500));
                        }
                        
                        setStep4Message('Creating VM...');
                        addStep4Log('Creating VM...');
                        
                        const zone = vmZone;
                        const instanceName = 'secureagent-manager';
                        const startupScript = getStartupScript(useOptimizedBundle);

                        const zones = [vmZone, 'us-central1-b', 'us-central1-c', 'us-west1-a', 'us-west1-b', 'us-east1-c', 'us-east1-d', 'europe-west1-d', 'asia-east1-a'];
                        let vmCreated = false;
                        
                        for (const tryZone of zones) {
                          try {
                            setStep4Message(`Creating VM in ${tryZone}...`);
                            addStep4Log(`Attempting VM creation in ${tryZone}...`);
                            
                            const vmResponse = await fetch(
                              `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances`,
                              {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${token}`,
                                  'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                  name: instanceName,
                                  machineType: `zones/${tryZone}/machineTypes/e2-micro`,
                                  disks: [{
                                    boot: true,
                                    autoDelete: true,
                                    initializeParams: {
                                      diskSizeGb: '10',
                                      sourceImage: 'projects/debian-cloud/global/images/family/debian-11',
                                    },
                                  }],
                                  networkInterfaces: [{
                                    network: 'global/networks/default',
                                    accessConfigs: [{ type: 'ONE_TO_ONE_NAT' }],
                                  }],
                                  metadata: {
                                    items: [
                                      { key: 'startup-script', value: startupScript },
                                      { key: 'github_token', value: githubPat },
                                      { key: 'discord_bot_token', value: discordBotToken },
                                      { key: 'discord_guild_id', value: discordGuildId || '' },
                                      { key: 'github_owner', value: '' },
                                      { key: 'firebase_staging', value: firebaseStagingData?.projectId || '' },
                                      { key: 'firebase_production', value: firebaseProductionData?.projectId || '' }
                                    ]
                                  }
                                }),
                              }
                            );
                            console.log('VM metadata discord_guild_id:', discordGuildId ? 'SET to ' + discordGuildId : 'EMPTY - this is the bug!');
                            
                            if (vmResponse.ok) {
                              setVmZone(tryZone);
                              addStep4Log(`VM creation started in ${tryZone}, waiting for completion...`);
                              await new Promise(r => setTimeout(r, 15000));
                              
                              const instanceResp = await fetch(
                                `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances/${instanceName}`,
                                { headers: { 'Authorization': `Bearer ${token}` } }
                              );
                              
                              if (!instanceResp.ok) {
                                const errData = await instanceResp.json();
                                if (errData.error?.code === 404) {
                                  addStep4Log(`VM not found in ${tryZone}, it may still be starting...`);
                                } else {
                                  addStep4Log(`Error checking VM: ${errData.error?.message || 'Unknown error'}`);
                                }
                                continue;
                              }
                              
                              const instanceData = await instanceResp.json();
                              const vmStatus = instanceData.status;
                              const ip = instanceData.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
                              
                              if (vmStatus !== 'RUNNING') {
                                addStep4Log(`VM status: ${vmStatus} - waiting for startup...`);
                                
                                await new Promise(r => setTimeout(r, 10000));
                                
                                const recheckResp = await fetch(
                                  `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances/${instanceName}`,
                                  { headers: { 'Authorization': `Bearer ${token}` } }
                                );
                                const recheckData = await recheckResp.json();
                                const recheckStatus = recheckData.status;
                                
                                if (recheckStatus !== 'RUNNING') {
                                  addStep4Log(`VM failed to start. Status: ${recheckStatus}`);
                                  if (recheckStatus === 'TERMINATED') {
                                    setError('VM terminated. Check startup script logs in GCP Console for errors.');
                                  } else {
                                    setError(`VM is in "${recheckStatus}" state. Please check GCP Console.`);
                                  }
                                  setStep4Status('error');
                                  break;
                                }
                              }
                              
                              if (ip) {
                                setVmIp(ip);
                                addStep4Log(`VM ready at ${ip}`);
                              }
                              vmCreated = true;
                              setStep4Status('complete');
                              setStep4Message('VM created successfully!');
                              expandNextStep(7);
                              break;
                            } else {
                              const err = await vmResponse.json();
                              const errStr = JSON.stringify(err);
                              const errMsg = err.error?.message || '';
                              const errStatus = err.error?.status || '';
                              const statusMsg = err.status?.message || '';
                              
                              addStep4Log(`VM response not ok: ${errMsg || statusMsg || errStr}`);
                              
                              if (errStr.toLowerCase().includes('zone') && 
                                  (errStr.toLowerCase().includes('exhausted') || 
                                   errStr.toLowerCase().includes('unavailable') ||
                                   errStr.toLowerCase().includes('resource'))) {
                                addStep4Log(`Zone ${tryZone} may be out of capacity, trying next zone...`);
                                continue;
                              }
                              
                              if (errMsg.includes('ZONE_RESOURCE_POOL_EXHAUSTED') || 
                                  errStr.includes('RESOURCE_EXHAUSTED') ||
                                  errStr.includes('resource_availability') ||
                                  errStatus === 'RESOURCE_EXHAUSTED' ||
                                  statusMsg.includes('ZONE_RESOURCE_POOL_EXHAUSTED') ||
                                  (errMsg.includes('unavailable') && errMsg.includes('zone'))) {
                                addStep4Log(`Zone ${tryZone} out of capacity, trying next zone...`);
                                continue;
                              }
                              
                              addStep4Log(`VM creation failed: ${errMsg || statusMsg || errStr}`);
                              setError(`Failed to create VM: ${errMsg || statusMsg}`);
                              setStep4Status('error');
                              break;
                            }
                            } catch (e: any) {
                              const errMsg = e?.message || e?.name || 'Unknown error';
                              addStep4Log(`Error creating VM in ${tryZone}: ${errMsg}, trying next zone...`);
                              continue;
                            }
                        }
                        
                        if (!vmCreated) {
                          addStep4Log('All zones exhausted, could not create VM');
                          setError('All zones are out of capacity. Please try again later.');
                          setStep4Status('error');
                        }
                      }}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
                  >
                    Recreate VM
                  </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-gray-600 mb-4">
                    Enable required APIs and create a VM. The VM will automatically fork SecureAgentBase, set up GitHub Actions, download Kimaki, and create a Discord channel.
                  </p>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">GCP Zone (free e2-micro):</label>
                    <select
                      value={vmZone}
                      onChange={(e) => setVmZone(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    >
                      <option value="us-east1-b">us-east1-b</option>
                      <option value="us-east1-c">us-east1-c</option>
                      <option value="us-east1-d">us-east1-d</option>
                      <option value="us-central1-a">us-central1-a</option>
                      <option value="us-central1-b">us-central1-b</option>
                      <option value="us-central1-c">us-central1-c</option>
                      <option value="us-west1-a">us-west1-a</option>
                      <option value="us-west1-b">us-west1-b</option>
                      <option value="europe-west1-d">europe-west1-d</option>
                      <option value="europe-west1-c">europe-west1-c</option>
                      <option value="asia-east1-a">asia-east1-a</option>
                      <option value="asia-east1-b">asia-east1-b</option>
                      <option value="asia-southeast1-a">asia-southeast1-a</option>
                      <option value="asia-southeast1-b">asia-southeast1-b</option>
                    </select>
                  </div>
                  
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useOptimizedBundle}
                        onChange={(e) => setUseOptimizedBundle(e.target.checked)}
                        className="mt-1 w-5 h-5 rounded border-blue-300"
                      />
                      <div>
                        <span className="font-medium text-blue-800">Use optimized deployment</span>
                        <p className="text-sm text-blue-700 mt-1">
                          Download pre-bundled packages from GCS for ~60% faster setup. 
                          The bundle is GPG-signed for integrity verification.
                        </p>
                        {!useOptimizedBundle && (
                          <p className="text-xs text-blue-600 mt-2">
                            Recommended for faster deployment. Uses standard apt/npm sources by default.
                          </p>
                        )}
                      </div>
                    </label>
                  </div>
                  
                  {step4Status === 'idle' && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        id="recreate-vm-trigger"
                        onClick={async () => {
                          if (!serviceAccountJson || !projectId) {
                            setError('Service account and project ID required');
                            return;
                          }
                          setStep4Status('enabling');
                          setStep4Message('Getting service account token...');
                          addStep4Log('Starting VM creation process...');
                          
                          const token = await getServiceAccountToken();
                          if (!token) {
                            setError('Failed to authenticate with service account');
                            setStep4Status('error');
                            return;
                          }
                          addStep4Log('Service account authenticated');
                          
                          const apis = [
                            { name: 'compute.googleapis.com', displayName: 'Compute Engine API' },
                            { name: 'cloudresourcemanager.googleapis.com', displayName: 'Cloud Resource Manager API' },
                            { name: 'serviceusage.googleapis.com', displayName: 'Service Usage API' }
                          ];
                          
                          for (const api of apis) {
                            setStep4Message(`Enabling ${api.displayName}...`);
                            addStep4Log(`Enabling ${api.displayName}...`);
                            
                            try {
                              const response = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api.name}:enable`, {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${token}`,
                                  'Content-Type': 'application/json'
                                }
                              });
                              
                              if (response.ok) {
                                addStep4Log(`${api.displayName} enabled`);
                              } else {
                                const errData = await response.json().catch(() => ({}));
                                const errMsg = errData.error?.message || '';
                                if (errMsg.includes('billing')) {
                                  setError('Billing must be enabled on your GCP project');
                                  addStep4Log(`ERROR: Billing required for ${api.displayName}`);
                                } else if (errMsg.includes('already') || errMsg.includes('enabled')) {
                                  addStep4Log(`${api.displayName} already enabled`);
                                } else {
                                  addStep4Log(`Note: ${errMsg || 'Continuing anyway...'}`);
                                }
                              }
                            } catch (e) {
                              addStep4Log(`Error enabling ${api.displayName}: ${e.message}`);
                            }
                            
                            await new Promise(r => setTimeout(r, 1500));
                          }
                          
                          setStep4Message('Creating VM...');
                          addStep4Log('Creating VM...');
                          
                          const zone = vmZone;
                          const instanceName = 'secureagent-manager';
                          const startupScript = getStartupScript(useOptimizedBundle);

                          const zones = [vmZone, 'us-central1-b', 'us-central1-c', 'us-west1-a', 'us-west1-b', 'us-east1-c', 'us-east1-d', 'europe-west1-d', 'asia-east1-a'];
                          let vmCreated = false;
                          
                          for (const tryZone of zones) {
                            try {
                              setStep4Message(`Creating VM in ${tryZone}...`);
                              addStep4Log(`Attempting VM creation in ${tryZone}...`);
                              
                              const vmResponse = await fetch(
                                `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances`,
                                {
                                  method: 'POST',
                                  headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                  },
                                  body: JSON.stringify({
                                    name: instanceName,
                                    machineType: `zones/${tryZone}/machineTypes/e2-micro`,
                                    disks: [{
                                      boot: true,
                                      autoDelete: true,
                                      initializeParams: {
                                        diskSizeGb: '10',
                                        sourceImage: 'projects/debian-cloud/global/images/family/debian-11',
                                      },
                                    }],
                                    networkInterfaces: [{
                                      network: 'global/networks/default',
                                      accessConfigs: [{ type: 'ONE_TO_ONE_NAT' }],
                                    }],
                                    metadata: {
                                      items: [
                                        { key: 'startup-script', value: startupScript },
                                        { key: 'github_token', value: githubPat },
                                        { key: 'discord_bot_token', value: discordBotToken },
                                        { key: 'discord_guild_id', value: discordGuildId || '' },
                                        { key: 'github_owner', value: '' },
                                        { key: 'firebase_staging', value: firebaseStagingData?.projectId || '' },
                                        { key: 'firebase_production', value: firebaseProductionData?.projectId || '' }
                                      ]
                                    }
                                  })
                                }
                              );
                              
                              if (vmResponse.ok) {
                                setVmZone(tryZone);
                                addStep4Log(`VM creation started in ${tryZone}, waiting for completion...`);
                                await new Promise(r => setTimeout(r, 15000));
                                
                                const instanceResp = await fetch(
                                  `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances/${instanceName}`,
                                  { headers: { 'Authorization': `Bearer ${token}` } }
                                );
                                const instanceData = await instanceResp.json();
                                const vmStatus = instanceData.status;
                                const ip = instanceData.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
                                
                                if (vmStatus !== 'RUNNING') {
                                  addStep4Log(`VM status: ${vmStatus} - waiting for startup...`);
                                  
                                  await new Promise(r => setTimeout(r, 10000));
                                  
                                  const recheckResp = await fetch(
                                    `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances/${instanceName}`,
                                    { headers: { 'Authorization': `Bearer ${token}` } }
                                  );
                                  const recheckData = await recheckResp.json();
                                  const recheckStatus = recheckData.status;
                                  
                                  if (recheckStatus !== 'RUNNING') {
                                    addStep4Log(`VM failed to start. Status: ${recheckStatus}`);
                                    if (recheckStatus === 'TERMINATED') {
                                      setError('VM terminated. Check startup script logs in GCP Console for errors.');
                                    } else {
                                      setError(`VM is in "${recheckStatus}" state. Please check GCP Console.`);
                                    }
                                    setStep4Status('error');
                                    break;
                                  }
                                }
                                
                                if (ip) {
                                  setVmIp(ip);
                                  addStep4Log(`VM ready at ${ip}`);
                                }
                                vmCreated = true;
                                setStep4Status('complete');
                                setStep4Message('VM created successfully!');
                                expandNextStep(7);
                                break;
                              } else {
                                const err = await vmResponse.json();
                                const errStr = JSON.stringify(err);
                                const errMsg = err.error?.message || '';
                                const errStatus = err.error?.status || '';
                                const statusMsg = err.status?.message || '';
                                
                                addStep4Log(`VM response not ok: ${errMsg || statusMsg || errStr}`);
                                
                                if (errStr.toLowerCase().includes('zone') && 
                                    (errStr.toLowerCase().includes('exhausted') || 
                                     errStr.toLowerCase().includes('unavailable') ||
                                     errStr.toLowerCase().includes('resource'))) {
                                  addStep4Log(`Zone ${tryZone} may be out of capacity, trying next zone...`);
                                  continue;
                                }
                                
                                if (errMsg.includes('ZONE_RESOURCE_POOL_EXHAUSTED') || 
                                    errStr.includes('RESOURCE_EXHAUSTED') ||
                                    errStr.includes('resource_availability') ||
                                    errStatus === 'RESOURCE_EXHAUSTED' ||
                                    statusMsg.includes('ZONE_RESOURCE_POOL_EXHAUSTED') ||
                                    (errMsg.includes('unavailable') && errMsg.includes('zone'))) {
                                  addStep4Log(`Zone ${tryZone} out of capacity, trying next zone...`);
                                  continue;
                                }
                                
                                addStep4Log(`VM creation failed: ${errMsg || statusMsg || errStr}`);
                                setError(`Failed to create VM: ${errMsg || statusMsg}`);
                                setStep4Status('error');
                                break;
                              }
                            } catch (e: any) {
                              const errMsg = e?.message || e?.name || 'Unknown error';
                              addStep4Log(`Error creating VM in ${tryZone}: ${errMsg}, trying next zone...`);
                              continue;
                            }
                          }
                          
                          if (!vmCreated) {
                            addStep4Log('All zones exhausted, could not create VM');
                            setError('All zones are out of capacity. Please try again later.');
                            setStep4Status('error');
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                      >
                        Enable APIs & Create VM
                      </button>
                    </div>
                  )}
                  
                  {(step4Status === 'enabling' || step4Status === 'complete') && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
                      <div className="flex items-center gap-2 text-blue-700 mb-2">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                        <span className="font-medium">{step4Message}</span>
                      </div>
                      {step4Logs.length > 0 && (
                        <div className="mt-2 text-xs text-blue-600 font-mono max-h-32 overflow-y-auto">
                          {step4Logs.map((log, i) => (
                            <div key={i}>[{log.time}] {log.message}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {step4Status === 'error' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-3">
                      <p className="text-red-700">{error}</p>
                      <button
                        onClick={() => { setStep4Status('idle'); setError(null); }}
                        className="mt-2 text-blue-600 underline text-sm"
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                      <button
                        onClick={async () => {
                          if (!serviceAccountJson || !projectId) {
                            setError('Service account and project ID required');
                            return;
                          }
                          if (!discordGuildId) {
                            addStep4Log('WARNING: Discord Guild ID not set - Discord channel will not be created');
                          }
                          setStep4Status('enabling');
                          setStep4Message('Getting service account token...');
                          addStep4Log('Starting VM recreation process...');
                          
                          const token = await getServiceAccountToken();
                          if (!token) {
                            setError('Failed to authenticate with service account');
                            setStep4Status('error');
                            return;
                          }
                          addStep4Log('Service account authenticated');
                          
                          const apis = [
                            { name: 'compute.googleapis.com', displayName: 'Compute Engine API' },
                            { name: 'cloudresourcemanager.googleapis.com', displayName: 'Cloud Resource Manager API' },
                            { name: 'serviceusage.googleapis.com', displayName: 'Service Usage API' }
                          ];
                          
                          for (const api of apis) {
                            setStep4Message(`Enabling ${api.displayName}...`);
                            addStep4Log(`Enabling ${api.displayName}...`);
                            
                            try {
                              const response = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api.name}:enable`, {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${token}`,
                                  'Content-Type': 'application/json'
                                }
                              });
                              
                              if (response.ok) {
                                addStep4Log(`${api.displayName} enabled`);
                              } else {
                                const errData = await response.json().catch(() => ({}));
                                const errMsg = errData.error?.message || '';
                                if (errMsg.includes('billing')) {
                                  setError('Billing must be enabled on your GCP project');
                                  addStep4Log(`ERROR: Billing required for ${api.displayName}`);
                                } else if (errMsg.includes('already') || errMsg.includes('enabled')) {
                                  addStep4Log(`${api.displayName} already enabled`);
                                } else {
                                  addStep4Log(`Note: ${errMsg || 'Continuing anyway...'}`);
                                }
                              }
                            } catch (e) {
                              addStep4Log(`Error enabling ${api.displayName}: ${e.message}`);
                            }
                            
                            await new Promise(r => setTimeout(r, 1500));
                          }
                          
                          setStep4Message('Creating VM...');
                          addStep4Log('Creating VM...');
                          
                          const zone = vmZone;
                          const instanceName = 'secureagent-manager';
                          const startupScript = getStartupScript(useOptimizedBundle);

                          const zones = [vmZone, 'us-central1-b', 'us-central1-c', 'us-west1-a', 'us-west1-b', 'us-east1-c', 'us-east1-d', 'europe-west1-d', 'asia-east1-a'];
                          let vmCreated = false;
                          
                          for (const tryZone of zones) {
                            try {
                              setStep4Message(`Creating VM in ${tryZone}...`);
                              addStep4Log(`Attempting VM creation in ${tryZone}...`);
                              
                              const vmResponse = await fetch(
                                `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances`,
                                {
                                  method: 'POST',
                                  headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                  },
                                  body: JSON.stringify({
                                    name: instanceName,
                                    machineType: `zones/${tryZone}/machineTypes/e2-micro`,
                                    disks: [{
                                      boot: true,
                                      autoDelete: true,
                                      initializeParams: {
                                        diskSizeGb: '10',
                                        sourceImage: 'projects/debian-cloud/global/images/family/debian-11',
                                      },
                                    }],
                                    networkInterfaces: [{
                                      network: 'global/networks/default',
                                      accessConfigs: [{ type: 'ONE_TO_ONE_NAT' }],
                                    }],
                                    metadata: {
                                      items: [
                                        { key: 'startup-script', value: startupScript },
                                        { key: 'github_token', value: githubPat },
                                        { key: 'discord_bot_token', value: discordBotToken },
                                        { key: 'discord_guild_id', value: discordGuildId || '' },
                                        { key: 'github_owner', value: '' },
                                        { key: 'firebase_staging', value: firebaseStagingData?.projectId || '' },
                                        { key: 'firebase_production', value: firebaseProductionData?.projectId || '' }
                                      ]
                                    }
                                  })
                                }
                              );
                              
                              if (vmResponse.ok) {
                                setVmZone(tryZone);
                                addStep4Log(`VM creation started in ${tryZone}, waiting for completion...`);
                                await new Promise(r => setTimeout(r, 15000));
                                
                                const instanceResp = await fetch(
                                  `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances/${instanceName}`,
                                  { headers: { 'Authorization': `Bearer ${token}` } }
                                );
                                const instanceData = await instanceResp.json();
                                const vmStatus = instanceData.status;
                                const ip = instanceData.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
                                
                                if (vmStatus !== 'RUNNING') {
                                  addStep4Log(`VM status: ${vmStatus} - waiting for startup...`);
                                  
                                  await new Promise(r => setTimeout(r, 10000));
                                  
                                  const recheckResp = await fetch(
                                    `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances/${instanceName}`,
                                    { headers: { 'Authorization': `Bearer ${token}` } }
                                  );
                                  const recheckData = await recheckResp.json();
                                  const recheckStatus = recheckData.status;
                                  
                                  if (recheckStatus !== 'RUNNING') {
                                    addStep4Log(`VM failed to start. Status: ${recheckStatus}`);
                                    if (recheckStatus === 'TERMINATED') {
                                      setError('VM terminated. Check startup script logs in GCP Console for errors.');
                                    } else {
                                      setError(`VM is in "${recheckStatus}" state. Please check GCP Console.`);
                                    }
                                    setStep4Status('error');
                                    break;
                                  }
                                }
                                
                                if (ip) {
                                  setVmIp(ip);
                                  addStep4Log(`VM ready at ${ip}`);
                                }
                                vmCreated = true;
                                setStep4Status('complete');
                                setStep4Message('VM created successfully!');
                                expandNextStep(7);
                                break;
                              } else {
                                const err = await vmResponse.json();
                                const errStr = JSON.stringify(err);
                                const errMsg = err.error?.message || '';
                                const errStatus = err.error?.status || '';
                                const statusMsg = err.status?.message || '';
                                
                                addStep4Log(`VM response not ok: ${errMsg || statusMsg || errStr}`);
                                
                                if (errStr.toLowerCase().includes('zone') && 
                                    (errStr.toLowerCase().includes('exhausted') || 
                                     errStr.toLowerCase().includes('unavailable') ||
                                     errStr.toLowerCase().includes('resource'))) {
                                  addStep4Log(`Zone ${tryZone} may be out of capacity, trying next zone...`);
                                  continue;
                                }
                                
                                if (errMsg.includes('ZONE_RESOURCE_POOL_EXHAUSTED') || 
                                    errStr.includes('RESOURCE_EXHAUSTED') ||
                                    errStr.includes('resource_availability') ||
                                    errStatus === 'RESOURCE_EXHAUSTED' ||
                                    statusMsg.includes('ZONE_RESOURCE_POOL_EXHAUSTED') ||
                                    (errMsg.includes('unavailable') && errMsg.includes('zone'))) {
                                  addStep4Log(`Zone ${tryZone} out of capacity, trying next zone...`);
                                  continue;
                                }
                                
                                addStep4Log(`VM creation failed: ${errMsg || statusMsg || errStr}`);
                                setError(`Failed to create VM: ${errMsg || statusMsg}`);
                                setStep4Status('error');
                                break;
                              }
                            } catch (e) {
                              addStep4Log(`Error creating VM in ${tryZone}: ${e.message}, trying next zone...`);
                              continue;
                            }
                          }
                          
                          if (!vmCreated && (step4Status as string) !== 'error') {
                            addStep4Log('All zones exhausted, could not create VM');
                            setError('All zones are out of capacity. Please try again later.');
                            setStep4Status('error');
                          }
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                      >
                        Recreate VM
                      </button>
                    </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Resources</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <a
              href={`https://console.cloud.google.com/compute/instances?project=${projectId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>☁️</span>
              GCP Compute Console
            </a>
            <a
              href="https://console.firebase.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>🔥</span>
              Firebase Console
            </a>
            <a
              href="https://github.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>🐙</span>
              GitHub
            </a>
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>💬</span>
              Discord Developer Portal
            </a>
            <a
              href="https://github.com/kallhoffa/SecureAgentBase"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>📦</span>
              SecureAgentBase (GitHub)
            </a>
            <a
              href="https://github.com/kallhoffa/kimaki"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>🤖</span>
              Kimaki CLI
            </a>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <button
            onClick={handleDisconnect}
            className="text-red-600 hover:text-red-700 flex items-center gap-2"
          >
            <Trash2 size={18} />
            Disconnect Infrastructure
          </button>
          {!useFirestore && (
            <button
              onClick={handleSaveConfig}
              disabled={saving || !projectId.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          )}
          {useFirestore && (
            <span className="text-sm text-gray-500">
              Auto-saving enabled
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default InfraSetup;
