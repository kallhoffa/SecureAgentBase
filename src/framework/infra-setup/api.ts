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
  return response.json();
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
  return response.json();
};

export const setGitHubVariable = async (pat: string, repoFull: string, name: string, value: string) => {
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

export const createWorkloadIdentityPool = async (token: string, gcpProjectId: string, poolId: string, log: (msg: string) => void) => {
  log('Creating workload identity pool...');
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
  if (pool.error?.message?.includes('already exists')) {
    const existing = await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/locations/global/workloadIdentityPools/${poolId}`,
      token
    );
    return existing.name;
  }
  return pool.name;
};

export const createWorkloadIdentityProvider = async (token: string, gcpProjectId: string, poolId: string, providerId: string, repoFullName: string, log: (msg: string) => void) => {
  log('Creating workload identity provider for GitHub...');
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
    return provider.name;
  } catch (e) {
    const existing = await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      token
    );
    return existing.name;
  }
};

export const createDeployServiceAccount = async (token: string, gcpProjectId: string, accountId: string, displayName: string, log: (msg: string) => void) => {
  log(`Creating service account: ${displayName}...`);
  try {
    const sa = await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts?accountId=${accountId}`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ displayName })
      }
    );
    return sa.email;
  } catch (e) {
    const existing = await gcpApiFetch(
      `https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts/${accountId}@${gcpProjectId}.iam.gserviceaccount.com`,
      token
    );
    return existing.email;
  }
};

export const grantFirebaseRoles = async (token: string, firebaseProjectId: string, saEmail: string, log: (msg: string) => void) => {
  log(`Granting Firebase deploy roles to ${saEmail} on ${firebaseProjectId}...`);
  try {
    const policy = await gcpApiFetch(
      `https://cloudresourcemanager.googleapis.com/v1/projects/${firebaseProjectId}:getIamPolicy`,
      token,
      { method: 'POST' }
    );

    const bindings = policy.bindings || [];
    const existingHosting = bindings.find(b => b.role === 'roles/firebasehosting.admin');
    const existingFirestore = bindings.find(b => b.role === 'roles/firestore.admin');

    if (!existingHosting || !existingHosting.members.includes(`serviceAccount:${saEmail}`)) {
      if (!existingHosting) {
        bindings.push({ role: 'roles/firebasehosting.admin', members: [`serviceAccount:${saEmail}`] });
      } else {
        existingHosting.members.push(`serviceAccount:${saEmail}`);
      }
    }
    if (!existingFirestore || !existingFirestore.members.includes(`serviceAccount:${saEmail}`)) {
      if (!existingFirestore) {
        bindings.push({ role: 'roles/firestore.admin', members: [`serviceAccount:${saEmail}`] });
      } else {
        existingFirestore.members.push(`serviceAccount:${saEmail}`);
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
  } catch (e: any) {
    log(`Warning: Could not grant Firebase roles on ${firebaseProjectId}: ${e.message}`);
    throw e;
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
