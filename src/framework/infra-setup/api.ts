export const gcpApiFetch = async (url: string, token: string, opts?: Record<string, any>) => {
  const options = opts || {};
  const response = await fetch(url, {
    method: (options as any).method || 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...((options as any).headers || {}) },
    body: (options as any).body || undefined
  });
  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`GCP API error (${response.status}): ${err}`);
  }
  if (response.status === 204) return {};
  const text = await response.text();
  return text ? JSON.parse(text) : {};
};

export const githubApiFetch = async (pat: string, path: string, opts?: Record<string, any>) => {
  const options = opts || {};
  const response = await fetch(`https://api.github.com${path}`, {
    method: (options as any).method || 'GET',
    headers: { 'Authorization': `Bearer ${pat}`, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', ...((options as any).headers || {}) },
    body: (options as any).body || undefined
  });
  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`GitHub API error (${response.status}): ${err}`);
  }
  if (response.status === 204) return {};
  const text = await response.text();
  return text ? JSON.parse(text) : {};
};

export const ensureGitHubRepo = async (pat: string, repoFull: string, log: (msg: string) => void) => {
  const [owner, repo] = repoFull.split('/');
  if (!owner || !repo) throw new Error(`Invalid repo name: ${repoFull}`);

  try {
    await githubApiFetch(pat, `/repos/${repoFull}`);
    log(`Repo ${repoFull} already exists`);
    return;
  } catch (e) {
    if (!e.message?.includes('404')) throw e;
  }

  log(`Creating repo ${repoFull}...`);
  await githubApiFetch(pat, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: repo,
      description: `Created by SecureAgentBase`,
      private: false,
      auto_init: true,
      license_template: 'apache-2.0',
    })
  });
  log(`Repo ${repoFull} created`);
};

export const setGitHubVariable = async (pat: string, repoFull: string, name: string, value: string) => {
  if (!value) {
    console.warn(`Skipping setting GitHub variable '${name}' because its value is empty.`);
    return;
  }
  try {
    await githubApiFetch(pat, `/repos/${repoFull}/actions/variables`, {
      method: 'POST',
      body: JSON.stringify({ name, value })
    });
  } catch {
    await githubApiFetch(pat, `/repos/${repoFull}/actions/variables/${name}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, value })
    });
  }
};

const importPrivateKey = async (pem: string) => {
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContents = pem.substring(pemHeader.length, pem.length - pemFooter.length).replace(/\n/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', binaryDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
};

export const getServiceAccountToken = async (serviceAccountJson: any) => {
  if (!serviceAccountJson) return null;
  if (!serviceAccountJson.private_key) return null;

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
  const encodeBase64Url = (str: any) => {
    return btoa(JSON.stringify(str)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const encodedHeader = encodeBase64Url(header);
  const encodedPayload = encodeBase64Url(payload);
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureInput);

  try {
    const privateKey = serviceAccountJson.private_key.replace(/\\n/g, '\n');
    const keyData = await importPrivateKey(privateKey);
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

export const generateShortLivedToken = async (userToken: string, saEmail: string): Promise<string | null> => {
  try {
    const resp = await fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(saEmail)}:generateAccessToken`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          scope: [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/compute',
            'https://www.googleapis.com/auth/devstorage.full_control',
            'https://www.googleapis.com/auth/cloud-billing.readonly'
          ],
          lifetime: '3600s'
        })
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.accessToken;
  } catch {
    return null;
  }
};

const awaitOperation = async (token: string, operationName: string, log?: (msg: string) => void) => {
  for (let i = 0; i < 30; i++) {
    const op = await gcpApiFetch(`https://iam.googleapis.com/v1/${operationName}`, token);
    if (op.done) return op.response;
    log?.(`Waiting for operation ${operationName}...`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Operation ${operationName} did not complete within 60s`);
};

export const createWorkloadIdentityPool = async (token: string, gcpProjectId: string, poolId: string, log: (msg: string) => void) => {
  log('Creating workload identity pool...');
  const poolFullName = `projects/${gcpProjectId}/locations/global/workloadIdentityPools/${poolId}`;
  try {
    const pool = await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/locations/global/workloadIdentityPools?workloadIdentityPoolId=${poolId}`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          displayName: 'Firebase Deploy Pool',
          description: 'For GitHub Actions Firebase deployment via OIDC'
        })
      }
    );
    if (pool.name?.includes('/operations/')) {
      log('Pool creation is async, waiting for completion...');
      const result = await awaitOperation(token, pool.name, log);
      return result?.name || poolFullName;
    }
    return pool.name || poolFullName;
  } catch (e) {
    try {
      const existing = await gcpApiFetch(
        `https://iam.googleapis.com/v1/projects/${gcpProjectId}/locations/global/workloadIdentityPools/${poolId}`,
        token
      );
      return existing.name || poolFullName;
    } catch (e2) {
      log('Pool GET failed, using constructed name');
      return poolFullName;
    }
  }
};

export const createWorkloadIdentityProvider = async (token: string, gcpProjectId: string, poolId: string, providerId: string, repoFullName: string, log: (msg: string) => void) => {
  log('Creating workload identity provider for GitHub...');
  const providerFullName = `projects/${gcpProjectId}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  try {
    const provider = await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/locations/global/workloadIdentityPools/${poolId}/providers?workloadIdentityPoolProviderId=${providerId}`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          displayName: 'GitHub Actions',
          description: 'OIDC provider for GitHub Actions',
          disabled: false,
          attributeMapping: {
            'google.subject': 'assertion.sub',
            'attribute.actor': 'assertion.actor',
            'attribute.repository': 'assertion.repository',
            'attribute.ref': 'assertion.ref'
          },
          attributeCondition: `assertion.repository == '${repoFullName}'`,
          oidc: {
            issuerUri: 'https://token.actions.githubusercontent.com'
          }
        })
      }
    );
    if (provider.name?.includes('/operations/')) {
      log('Provider creation is async, waiting for completion...');
      const result = await awaitOperation(token, provider.name, log);
      return result?.name || providerFullName;
    }
    return provider.name || providerFullName;
  } catch (e) {
    // Provider already exists — PATCH its attributeCondition to match the
    // current repo name (may differ if a UUID suffix was appended)
    log('Provider already exists, updating attribute condition...');
    await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}?updateMask=attributeCondition`,
      token,
      {
        method: 'PATCH',
        body: JSON.stringify({
          attributeCondition: `assertion.repository == '${repoFullName}'`
        })
      }
    );
    const existing = await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      token
    );
    return existing.name || providerFullName;
  }
};

export const createDeployServiceAccount = async (token: string, gcpProjectId: string, accountId: string, displayName: string, log: (msg: string) => void) => {
  log(`Creating service account: ${displayName}...`);
  try {
    const sa = await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          accountId,
          serviceAccount: {
            displayName
          }
        })
      }
    );
    return sa.email;
  } catch (e) {
    try {
      const existing = await gcpApiFetch(
        `https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts/${accountId}@${gcpProjectId}.iam.gserviceaccount.com`,
        token
      );
      return existing.email;
    } catch (e2) {
      log('SA not found after conflict, retrying creation...');
      await new Promise(r => setTimeout(r, 3000));
      const sa = await gcpApiFetch(
        `https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            accountId,
            serviceAccount: { displayName }
          })
        }
      );
      return sa.email;
    }
  }
};

export const grantFirebaseRoles = async (token: string, firebaseProjectId: string, saEmail: string, log: (msg: string) => void) => {
  log(`Granting Firebase deploy roles to ${saEmail} on ${firebaseProjectId}...`);
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const policy = await gcpApiFetch(
        `https://cloudresourcemanager.googleapis.com/v1/projects/${firebaseProjectId}:getIamPolicy`,
        token,
        { method: 'POST' }
      );

      const bindings = policy.bindings || [];
      const existingFirebaseAdmin = bindings.find(b => b.role === 'roles/firebase.admin');
      const existingDatastoreOwner = bindings.find(b => b.role === 'roles/datastore.owner');
      const existingServiceUsageConsumer = bindings.find(b => b.role === 'roles/serviceusage.serviceUsageConsumer');

      if (!existingFirebaseAdmin || !existingFirebaseAdmin.members.includes(`serviceAccount:${saEmail}`)) {
        if (!existingFirebaseAdmin) {
          bindings.push({ role: 'roles/firebase.admin', members: [`serviceAccount:${saEmail}`] });
        } else {
          existingFirebaseAdmin.members.push(`serviceAccount:${saEmail}`);
        }
      }
      if (!existingDatastoreOwner || !existingDatastoreOwner.members.includes(`serviceAccount:${saEmail}`)) {
        if (!existingDatastoreOwner) {
          bindings.push({ role: 'roles/datastore.owner', members: [`serviceAccount:${saEmail}`] });
        } else {
          existingDatastoreOwner.members.push(`serviceAccount:${saEmail}`);
        }
      }
      if (!existingServiceUsageConsumer || !existingServiceUsageConsumer.members.includes(`serviceAccount:${saEmail}`)) {
        if (!existingServiceUsageConsumer) {
          bindings.push({ role: 'roles/serviceusage.serviceUsageConsumer', members: [`serviceAccount:${saEmail}`] });
        } else {
          existingServiceUsageConsumer.members.push(`serviceAccount:${saEmail}`);
        }
      }

      await gcpApiFetch(
        `https://cloudresourcemanager.googleapis.com/v1/projects/${firebaseProjectId}:setIamPolicy`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ policy: { bindings, etag: policy.etag } })
        }
      );
      return;
    } catch (e) {
      if (e.message?.includes('does not exist') && attempt < 5) {
        log(`SA not ready yet (attempt ${attempt + 1}), waiting...`);
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      log(`Warning: Could not grant Firebase roles on ${firebaseProjectId}: ${e.message}`);
      return;
    }
  }
};

export const grantPoolAccessToSA = async (token: string, gcpProjectId: string, saEmail: string, poolName: string, repoFullName: string, log: (msg: string) => void) => {
  log(`Granting pool access to impersonate ${saEmail}...`);
  const member = `principalSet://iam.googleapis.com/${poolName}/attribute.repository/${repoFullName}`;
  try {
    const policy = await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts/${saEmail}:getIamPolicy`,
      token,
      { method: 'POST' }
    );
    const bindings = policy.bindings || [];
    const existing = bindings.find(b => b.role === 'roles/iam.workloadIdentityUser');
    if (!existing || !existing.members.includes(member)) {
      if (!existing) {
        bindings.push({ role: 'roles/iam.workloadIdentityUser', members: [member] });
      } else {
        existing.members.push(member);
      }
    }
    await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts/${saEmail}:setIamPolicy`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ policy: { bindings, etag: policy.etag } })
      }
    );
  } catch (e) {
    const defaultPolicy = {
      bindings: [{
        role: 'roles/iam.workloadIdentityUser',
        members: [member]
      }]
    };
    await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts/${saEmail}:setIamPolicy`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ policy: defaultPolicy })
      }
    );
  }
};


