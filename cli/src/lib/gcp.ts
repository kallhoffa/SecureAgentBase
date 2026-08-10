import type { AuthClient } from './auth.js';

export async function gcpFetch(
  auth: AuthClient,
  url: string,
  opts?: { method?: string; body?: any; headers?: Record<string, string> }
): Promise<any> {
  const token = await auth.getToken();
  const method = opts?.method || 'GET';
  const hasBody = opts?.body != null;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    ...opts?.headers,
  };
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`GCP API error (${response.status}): ${err}`);
  }

  if (response.status === 204) return {};
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export async function listProjects(auth: AuthClient): Promise<any[]> {
  const data = await gcpFetch(auth, 'https://cloudresourcemanager.googleapis.com/v1/projects');
  return data.projects || [];
}

export async function createProject(
  auth: AuthClient,
  projectId: string,
  displayName: string
): Promise<any> {
  return gcpFetch(auth, 'https://cloudresourcemanager.googleapis.com/v1/projects', {
    method: 'POST',
    body: { projectId, name: displayName },
  });
}

export async function getProject(
  auth: AuthClient,
  projectId: string
): Promise<any | null> {
  try {
    return await gcpFetch(auth, `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`);
  } catch {
    return null;
  }
}

export async function enableApi(
  auth: AuthClient,
  projectId: string,
  apiName: string
): Promise<void> {
  const url = `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${apiName}:enable`;
  try {
    await gcpFetch(auth, url, { method: 'POST', body: {} });
  } catch (e: any) {
    if (!e.message?.includes('already enabled')) throw e;
  }
}

export async function checkApiEnabled(
  auth: AuthClient,
  projectId: string,
  apiName: string
): Promise<boolean> {
  try {
    const result = await gcpFetch(
      auth,
      `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${apiName}`
    );
    return result.state === 'ENABLED';
  } catch {
    return false;
  }
}

export async function createServiceAccount(
  auth: AuthClient,
  projectId: string,
  accountId: string,
  displayName: string
): Promise<{ email: string }> {
  const url = `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`;
  try {
    const sa = await gcpFetch(auth, url, {
      method: 'POST',
      body: { accountId, serviceAccount: { displayName } },
    });
    return { email: sa.email };
  } catch (e: any) {
    if (e.message?.includes('409')) {
      const email = `${accountId}@${projectId}.iam.gserviceaccount.com`;
      return { email };
    }
    throw e;
  }
}

export async function grantRole(
  auth: AuthClient,
  resource: string,
  member: string,
  role: string
): Promise<void> {
  const url = `https://cloudresourcemanager.googleapis.com/v1/${resource}:getIamPolicy`;
  const policy = await gcpFetch(auth, url, { method: 'POST' });

  const bindings = policy.bindings || [];
  const existing = bindings.find((b: any) => b.role === role);

  if (!existing) {
    bindings.push({ role, members: [member] });
  } else if (!existing.members.includes(member)) {
    existing.members.push(member);
  } else {
    return; // Already has the role
  }

  const setUrl = `https://cloudresourcemanager.googleapis.com/v1/${resource}:setIamPolicy`;
  await gcpFetch(auth, setUrl, {
    method: 'POST',
    body: { policy: { bindings, etag: policy.etag } },
  });
}

// Grants a role ON a service account resource (e.g. iam.serviceAccountUser on
// the agent SA so a VM creator can attach it). The IAM API is used instead of
// cloudresourcemanager because the latter only supports projects/folders.
export async function grantRoleOnServiceAccount(
  auth: AuthClient,
  projectId: string,
  accountId: string,
  member: string,
  role: string
): Promise<void> {
  const base = `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${accountId}`;
  const policy = await gcpFetch(auth, `${base}:getIamPolicy`, { method: 'POST' });

  const bindings = policy.bindings || [];
  const existing = bindings.find((b: any) => b.role === role);

  if (!existing) {
    bindings.push({ role, members: [member] });
  } else if (!existing.members.includes(member)) {
    existing.members.push(member);
  } else {
    return; // Already has the role
  }

  await gcpFetch(auth, `${base}:setIamPolicy`, {
    method: 'POST',
    body: { policy: { bindings, etag: policy.etag } },
  });
}

export async function createVm(
  auth: AuthClient,
  projectId: string,
  zone: string,
  instanceName: string,
  metadata: Record<string, string>,
  saEmail?: string
): Promise<{ ip: string; zone: string }> {
  const url = `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances`;

  // The VM boots with the identity-only agent SA (map #36 decision #3) so the
  // startup script can fetch the 2 secrets via the metadata-server identity.
  const body: Record<string, any> = {
    name: instanceName,
    // Default to e2-small — same default as the web wizard (see
    // infra-setup.tsx). 1GB e2-micro is too tight for bot + agent; 4GB
    // e2-medium is comfort most users don't need at ~2x the cost.
    machineType: `zones/${zone}/machineTypes/e2-small`,
    disks: [
      {
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceImage: 'projects/debian-cloud/global/images/family/debian-11',
          diskSizeGb: '10',
        },
      },
    ],
    networkInterfaces: [
      {
        network: 'global/networks/default',
        // No explicit name: GCE defaults the access config to 'external-nat'.
        // An explicit name like 'External NAT' (space/uppercase) is invalid
        // and GCE rejects the create operation, tearing the VM down to
        // STOPPING within seconds (observed across all 12 zones).
        accessConfigs: [{ type: 'ONE_TO_ONE_NAT' }],
      },
    ],
    metadata: {
      items: Object.entries(metadata).map(([key, value]) => ({
        key,
        value,
      })),
    },
  };
  if (saEmail) {
    body.serviceAccounts = [
      { email: saEmail, scopes: ['https://www.googleapis.com/auth/cloud-platform'] },
    ];
  }

  // Try to delete any existing VM with this name in the target zone
  const existingUrl = `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`;
  try {
    await gcpFetch(auth, existingUrl, { method: 'DELETE' });
    // Poll until deletion completes (up to 3 min)
    for (let d = 0; d < 36; d++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        await gcpFetch(auth, existingUrl);
      } catch {
        break; // Gone
      }
    }
  } catch {
    // VM doesn't exist — that's fine
  }

  // POST create returns an Operation; poll it to DONE. If the operation
  // fails, its error is the ground truth for why the VM never becomes
  // RUNNING (GCE otherwise tears the instance down to STOPPING/TERMINATED
  // with no obvious cause from the instance resource itself).
  const op = await gcpFetch(auth, url, { method: 'POST', body });
  const opName = op?.name;
  const opSelfLink = op?.selfLink;
  let opBase: string | undefined;
  if (opName) {
    opBase = opSelfLink?.includes('global/operations')
      ? `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/operations/${opName}`
      : `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/operations/${opName}`;
    for (let o = 0; o < 60; o++) {
      await new Promise((r) => setTimeout(r, 3000));
      let status;
      try {
        status = await gcpFetch(auth, opBase);
      } catch {
        continue; // Operation not visible yet
      }
      if (status?.status === 'DONE') {
        if (status?.error) {
          const detail = JSON.stringify(status.error.errors || status.error).slice(0, 2000);
          throw new Error(`VM create operation failed: ${detail}`);
        }
        break;
      }
    }
  }

  // Poll until VM is RUNNING (up to 10 minutes)
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const instance = await gcpFetch(
        auth,
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`
      );
      if (instance.status === 'RUNNING') {
        const ip = instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
        return { ip, zone };
      }
      if (instance.status === 'STOPPING' || instance.status === 'TERMINATED') {
        // VM is dying — abort early, delete it, and let the caller try the next zone
        console.log(`    VM is ${instance.status}, aborting and trying next zone...`);
        // Dump the create operation error if we still have one, plus the
        // serial console, for ground truth on why the VM stopped.
        if (opName && opBase) {
          try {
            const opNow = await gcpFetch(auth, opBase);
            if (opNow?.error) {
              console.log(`    create operation error: ${JSON.stringify(opNow.error.errors || opNow.error).slice(0, 2000)}`);
            }
          } catch {}
        }
        try {
          const serial = await fetchVmLogs(auth, projectId, zone, instanceName);
          const tail = serial.split('\n').filter((l) => l.trim()).slice(-30).join('\n');
          console.log(`    --- serial console (last 30 lines) ---\n${tail}\n    ----------------------------------------`);
        } catch (e: any) {
          console.log(`    (serial console unavailable: ${e.message})`);
        }
        try { await gcpFetch(auth, existingUrl, { method: 'DELETE' }); } catch {}
        throw new Error(`VM entered ${instance.status} state`);
      }
      if (i % 6 === 0) {
        console.log(`    VM status: ${instance.status} (attempt ${i + 1}/120)`);
      }
    } catch (e: any) {
      if (e.message?.includes('aborting') || e.message?.includes('STOPPING') || e.message?.includes('TERMINATED') || e.message?.includes('operation failed')) throw e;
      // Instance not yet available
    }
  }

  throw new Error('VM did not start within 10 minutes');
}

export async function deleteVm(
  auth: AuthClient,
  projectId: string,
  zone: string,
  instanceName: string
): Promise<void> {
  try {
    await gcpFetch(
      auth,
      `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
      { method: 'DELETE' }
    );
  } catch {
    // VM may not exist
  }
}

export async function cleanupVmByName(
  auth: AuthClient,
  projectId: string,
  instanceName: string
): Promise<void> {
  const zones = [
    'us-central1-a', 'us-central1-b', 'us-central1-c',
    'us-west1-a', 'us-west1-b',
    'us-east1-b', 'us-east1-c', 'us-east1-d',
    'europe-west1-b', 'europe-west1-c', 'europe-west1-d',
    'asia-east1-a',
  ];
  for (const zone of zones) {
    try {
      const inst = await gcpFetch(
        auth,
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`
      );
      if (inst && inst.status) {
        console.log(`  Found existing VM "${instanceName}" in ${zone} (${inst.status}), deleting...`);
        await gcpFetch(
          auth,
          `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
          { method: 'DELETE' }
        );
        // Poll until deletion completes (up to 3 min)
        for (let d = 0; d < 36; d++) {
          await new Promise((r) => setTimeout(r, 5000));
          try {
            await gcpFetch(
              auth,
              `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`
            );
          } catch {
            break; // Deleted
          }
        }
      }
    } catch (e: any) {
      // VM not in this zone (404) or other error
      if (e.message && !e.message.includes('404')) {
        console.log(`  Warning: failed to check zone ${zone}: ${e.message}`);
      }
    }
  }
}

export async function fetchVmLogs(
  auth: AuthClient,
  projectId: string,
  zone: string,
  instanceName: string
): Promise<string> {
  const result = await gcpFetch(
    auth,
    `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}/serialPort?port=1`
  );
  return (result.contents || '').split('\n').map((l: string) => atob(l)).join('\n');
}

// ---------------------------------------------------------------------------
// Secret Manager helpers (map #36 decision #7). The CLI writes the 2 secrets
// (github-pat, discord-bot-token) to the SAME SM store the web wizard uses, at
// prompt time. The operator (ADC identity) must have roles/secretmanager.admin
// — granted in stepServiceAccount — and per-secret secretAccessor is bound to
// the operator + the identity-only agent SA (the VM's metadata identity).
// Mirrors src/framework/infra-setup/api.ts.
// ---------------------------------------------------------------------------

const SM_BASE = 'https://secretmanager.googleapis.com/v1';

const base64Encode = (value: string) => Buffer.from(value, 'utf-8').toString('base64');

// Project-level member prefix: service accounts end in *.gserviceaccount.com,
// everything else (gcloud ADC user, WIF-federated user) is a `user:`.
export const smMember = (email: string): string =>
  email.endsWith('.gserviceaccount.com') ? `serviceAccount:${email}` : `user:${email}`;

export const smEnsureSecret = async (auth: AuthClient, projectId: string, secretId: string): Promise<string> => {
  // The API-enable loop activates secretmanager.googleapis.com before writing,
  // but GCP can lag a few seconds past the status poll. Retry briefly on
  // SERVICE_DISABLED so a brand-new project doesn't 403 on the first write.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const secret = await gcpFetch(auth, `${SM_BASE}/projects/${projectId}/secrets?secretId=${encodeURIComponent(secretId)}`, {
        method: 'POST',
        body: { replication: { automatic: {} } },
      });
      return secret.name;
    } catch (e: any) {
      if (e.message?.includes('SERVICE_DISABLED')) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        throw new Error(`Secret Manager API is not active for project ${projectId}: ${e.message}`);
      }
      // 409 ALREADY_EXISTS — fetch the existing secret instead.
      if (!e.message?.includes('409')) throw e;
      const existing = await gcpFetch(auth, `${SM_BASE}/projects/${projectId}/secrets/${encodeURIComponent(secretId)}`);
      return existing.name;
    }
  }
  throw new Error(`Secret Manager API did not activate for project ${projectId}`);
};

export const smAddVersion = async (auth: AuthClient, projectId: string, secretId: string, value: string): Promise<string> => {
  const added = await gcpFetch(auth, `${SM_BASE}/projects/${projectId}/secrets/${encodeURIComponent(secretId)}:addVersion`, {
    method: 'POST',
    body: { payload: { data: base64Encode(value) } },
  });
  return added.name;
};

export const smSetSecretAccess = async (auth: AuthClient, projectId: string, secretId: string, members: string[]): Promise<void> => {
  const policy = await gcpFetch(auth, `${SM_BASE}/projects/${projectId}/secrets/${encodeURIComponent(secretId)}:getIamPolicy`);
  const bindings = policy.bindings || [];
  let binding = bindings.find((b: any) => b.role === 'roles/secretmanager.secretAccessor');
  if (!binding) {
    binding = { role: 'roles/secretmanager.secretAccessor', members: [] };
    bindings.push(binding);
  }
  for (const member of members) {
    if (!binding.members.includes(member)) binding.members.push(member);
  }
  await gcpFetch(auth, `${SM_BASE}/projects/${projectId}/secrets/${encodeURIComponent(secretId)}:setIamPolicy`, {
    method: 'POST',
    body: { policy: { bindings, etag: policy.etag } },
  });
};

// Idempotent write: create-or-get the secret, add a new version, and bind the
// per-secret accessors (operator + agent SA). Returns the secret resource name
// used as a config reference.
export const smWriteSecret = async (
  auth: AuthClient,
  projectId: string,
  secretId: string,
  value: string,
  members: string[],
  log?: (msg: string) => void
): Promise<string> => {
  const secretName = await smEnsureSecret(auth, projectId, secretId);
  await smAddVersion(auth, projectId, secretId, value);
  await smSetSecretAccess(auth, projectId, secretId, members);
  log?.(`Secret ${secretId} stored in Secret Manager (${secretName})`);
  return secretName;
};

// Read the latest version on demand (decision #7). Used for re-runs that need
// the in-memory value (e.g. re-validate a PAT). Returns null if the secret
// does not exist (404) so callers can fall back to a prompt.
export const smFetchSecret = async (auth: AuthClient, projectId: string, secretId: string): Promise<string | null> => {
  try {
    const result = await gcpFetch(auth, `${SM_BASE}/projects/${projectId}/secrets/${encodeURIComponent(secretId)}/versions/latest:access`);
    const b64 = result?.payload?.data;
    if (!b64) return null;
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch (e: any) {
    if (e.message?.includes('404') || e.message?.includes('403')) return null;
    throw e;
  }
};
