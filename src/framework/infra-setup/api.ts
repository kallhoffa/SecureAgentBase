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
            'https://www.googleapis.com/auth/devstorage.read_write',
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
      const existingServiceUsageAdmin = bindings.find(b => b.role === 'roles/serviceusage.serviceUsageAdmin');

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
      if (!existingServiceUsageAdmin || !existingServiceUsageAdmin.members.includes(`serviceAccount:${saEmail}`)) {
        if (!existingServiceUsageAdmin) {
          bindings.push({ role: 'roles/serviceusage.serviceUsageAdmin', members: [`serviceAccount:${saEmail}`] });
        } else {
          existingServiceUsageAdmin.members.push(`serviceAccount:${saEmail}`);
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

// ---------------------------------------------------------------------------
// Secret Manager helpers (map #36) — the credential store for the VM boot.
// Secrets are per-secret IAM-gated: accessors are the operator (via Google
// OAuth) and the identity-only agent SA (VM boot via metadata server).
// The web app writes here using the operator's token; Firestore keeps
// references only (`sm_secrets`), never secret values.
// ---------------------------------------------------------------------------

const SM_BASE = 'https://secretmanager.googleapis.com/v1';

const base64Encode = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
};

export const smEnsureSecret = async (token: string, projectId: string, secretId: string) => {
  try {
    const secret = await gcpApiFetch(
      `${SM_BASE}/projects/${projectId}/secrets?secretId=${secretId}`,
      token,
      { method: 'POST', body: JSON.stringify({ replication: { automatic: {} } }) }
    );
    return secret.name;
  } catch (e) {
    // 409 ALREADY_EXISTS — fetch the existing secret instead.
    if (!e.message?.includes('409')) throw e;
    const existing = await gcpApiFetch(
      `${SM_BASE}/projects/${projectId}/secrets/${secretId}`,
      token
    );
    return existing.name;
  }
};

export const smAddVersion = async (token: string, projectId: string, secretId: string, value: string) => {
  const added = await gcpApiFetch(
    `${SM_BASE}/projects/${projectId}/secrets/${secretId}:addVersion`,
    token,
    { method: 'POST', body: JSON.stringify({ payload: { data: base64Encode(value) } }) }
  );
  return added.name;
};

export const smSetSecretAccess = async (token: string, projectId: string, secretId: string, members: string[]) => {
  const policy = await gcpApiFetch(
    `${SM_BASE}/projects/${projectId}/secrets/${secretId}:getIamPolicy`,
    token
  );
  const bindings = policy.bindings || [];
  let binding = bindings.find((b) => b.role === 'roles/secretmanager.secretAccessor');
  if (!binding) {
    binding = { role: 'roles/secretmanager.secretAccessor', members: [] };
    bindings.push(binding);
  }
  for (const member of members) {
    if (!binding.members.includes(member)) binding.members.push(member);
  }
  await gcpApiFetch(
    `${SM_BASE}/projects/${projectId}/secrets/${secretId}:setIamPolicy`,
    token,
    { method: 'POST', body: JSON.stringify({ policy: { bindings, etag: policy.etag } }) }
  );
};

// Idempotent write: create-or-get the secret, add a new version, and bind the
// per-secret accessors (operator + agent SA). Returns the secret resource name
// used as a Firestore reference (`sm_secrets`).
export const smWriteSecret = async (token: string, projectId: string, secretId: string, value: string, members: string[], log?: (msg: string) => void) => {
  const secretName = await smEnsureSecret(token, projectId, secretId);
  await smAddVersion(token, projectId, secretId, value);
  await smSetSecretAccess(token, projectId, secretId, members);
  log?.(`Secret ${secretId} stored in Secret Manager (${secretName})`);
  return secretName;
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


