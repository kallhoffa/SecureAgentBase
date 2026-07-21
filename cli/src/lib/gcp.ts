import type { AuthClient } from './auth.js';

export async function gcpFetch(
  auth: AuthClient,
  url: string,
  opts?: { method?: string; body?: any; headers?: Record<string, string> }
): Promise<any> {
  const token = await auth.getToken();
  const method = opts?.method || 'GET';
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...opts?.headers,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
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
    await gcpFetch(auth, url, { method: 'POST' });
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
    serviceAccounts: [
      {
        email: `${await auth.getClientEmail()}`,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
    ],
  };

  const result = await gcpFetch(auth, url, { method: 'POST', body });

  // Poll until VM is RUNNING
  for (let i = 0; i < 60; i++) {
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
    } catch {
      // Instance not yet available
    }
  }

  throw new Error('VM did not start within 5 minutes');
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
