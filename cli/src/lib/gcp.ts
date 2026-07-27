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

export async function createVm(
  auth: AuthClient,
  projectId: string,
  zone: string,
  instanceName: string,
  metadata: Record<string, string>
): Promise<{ ip: string; zone: string }> {
  const url = `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances`;

  const body = {
    name: instanceName,
    machineType: `zones/${zone}/machineTypes/e2-medium`,
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
        accessConfigs: [{ type: 'ONE_TO_ONE_NAT', name: 'External NAT' }],
      },
    ],
    metadata: {
      items: Object.entries(metadata).map(([key, value]) => ({
        key,
        value,
      })),
    },
  };

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

  const result = await gcpFetch(auth, url, { method: 'POST', body });

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
        try { await gcpFetch(auth, existingUrl, { method: 'DELETE' }); } catch {}
        throw new Error(`VM entered ${instance.status} state`);
      }
      if (i % 6 === 0) {
        console.log(`    VM status: ${instance.status} (attempt ${i + 1}/120)`);
      }
    } catch (e: any) {
      if (e.message?.includes('aborting') || e.message?.includes('STOPPING') || e.message?.includes('TERMINATED')) throw e;
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
