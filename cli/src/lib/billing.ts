import type { AuthClient } from './auth.js';
import { gcpFetch } from './gcp.js';

export async function fetchBillingAccounts(
  auth: AuthClient,
  projectId: string
): Promise<any[]> {
  const token = await auth.getToken();
  const response = await fetch('https://cloudbilling.googleapis.com/v1/billingAccounts', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to list billing accounts (${response.status}): ${err}`);
  }

  const data = await response.json() as any;
  return data.billingAccounts || [];
}

export async function getBillingInfo(
  auth: AuthClient,
  projectId: string
): Promise<any> {
  return gcpFetch(auth, `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`, {
    headers: { 'x-goog-user-project': projectId },
  });
}

export async function linkBillingAccount(
  auth: AuthClient,
  projectId: string,
  billingAccountId: string
): Promise<void> {
  await gcpFetch(auth, `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`, {
    method: 'PUT',
    body: { billingAccountName: `billingAccounts/${billingAccountId}` },
    headers: { 'x-goog-user-project': projectId },
  });
}

export async function isBillingEnabled(
  auth: AuthClient,
  projectId: string
): Promise<boolean> {
  try {
    const info = await getBillingInfo(auth, projectId);
    return !!info.billingAccountName;
  } catch {
    return false;
  }
}

export async function enableBillingApi(
  auth: AuthClient,
  projectId: string
): Promise<void> {
  try {
    await gcpFetch(auth, `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/cloudbilling.googleapis.com:enable`, {
      method: 'POST',
    });
  } catch {
    // May already be enabled
  }

  // Poll for propagation
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const accounts = await fetchBillingAccounts(auth, projectId);
      if (accounts.length > 0) return;
    } catch {
      // Not ready yet
    }
  }
}
