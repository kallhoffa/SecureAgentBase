import type { AuthClient } from './auth.js';
import { gcpFetch, createServiceAccount, grantRole } from './gcp.js';

export async function githubFetch(
  pat: string,
  path: string,
  opts?: { method?: string; body?: any }
): Promise<any> {
  const response = await fetch(`https://api.github.com${path}`, {
    method: opts?.method || 'GET',
    headers: {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`GitHub API error (${response.status}): ${err}`);
  }

  if (response.status === 204) return {};
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

export async function validatePat(pat: string): Promise<{ login: string; scopes: string[] }> {
  const user = await githubFetch(pat, '/user');
  const response = await fetch('https://api.github.com/user', {
    headers: { 'Authorization': `Bearer ${pat}` },
  });
  const scopes = (response.headers.get('x-oauth-scopes') || '').split(',').map((s) => s.trim());
  return { login: user.login, scopes };
}

export async function ensureRepo(
  pat: string,
  repoFull: string
): Promise<void> {
  const [owner, repo] = repoFull.split('/');
  try {
    await githubFetch(pat, `/repos/${repoFull}`);
  } catch (e: any) {
    if (e.message?.includes('404')) {
      await githubFetch(pat, '/user/repos', {
        method: 'POST',
        body: {
          name: repo,
          description: 'Created by SecureAgentBase',
          private: false,
          auto_init: true,
          license_template: 'apache-2.0',
        },
      });
    } else {
      throw e;
    }
  }
}

export async function setGitHubVariable(
  pat: string,
  repoFull: string,
  name: string,
  value: string
): Promise<void> {
  if (!value) return;
  try {
    await githubFetch(pat, `/repos/${repoFull}/actions/variables`, {
      method: 'POST',
      body: { name, value },
    });
  } catch {
    await githubFetch(pat, `/repos/${repoFull}/actions/variables/${name}`, {
      method: 'PATCH',
      body: { name, value },
    });
  }
}

export async function setupOidc(
  auth: AuthClient,
  projectId: string,
  repoFullName: string
): Promise<{
  wifPoolName: string;
  wifProviderName: string;
  saStagingEmail: string;
  saProductionEmail: string;
}> {
  const poolId = 'firebase-deploy-pool';
  const providerId = 'github-provider';
  const poolName = `projects/${projectId}/locations/global/workloadIdentityPools/${poolId}`;
  const providerName = `projects/${projectId}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;

  // Create WIF pool
  try {
    await gcpFetch(auth, `https://iam.googleapis.com/v1/projects/${projectId}/locations/global/workloadIdentityPools?workloadIdentityPoolId=${poolId}`, {
      method: 'POST',
      body: { displayName: 'Firebase Deploy Pool' },
    });
  } catch (e: any) {
    if (!e.message?.includes('409')) throw e;
  }

  // Create WIF provider
  try {
    await gcpFetch(auth, `https://iam.googleapis.com/v1/projects/${projectId}/locations/global/workloadIdentityPools/${poolId}/providers?workloadIdentityPoolProviderId=${providerId}`, {
      method: 'POST',
      body: {
        displayName: 'GitHub Actions',
        attributeMapping: {
          'google.subject': 'assertion.sub',
          'attribute.actor': 'assertion.actor',
          'attribute.repository': 'assertion.repository',
          'attribute.ref': 'assertion.ref',
        },
        attributeCondition: `assertion.repository == '${repoFullName}'`,
        oidc: { issuerUri: 'https://token.actions.githubusercontent.com' },
      },
    });
  } catch (e: any) {
    if (!e.message?.includes('409')) throw e;
    // Update attribute condition if provider exists
    await gcpFetch(auth, `https://iam.googleapis.com/v1/projects/${projectId}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}?updateMask=attributeCondition`, {
      method: 'PATCH',
      body: { attributeCondition: `assertion.repository == '${repoFullName}'` },
    });
  }

  // Create deploy service accounts
  const { email: saStagingEmail } = await createServiceAccount(auth, projectId, 'firebase-deploy-staging', 'Firebase Deploy Staging');
  const { email: saProductionEmail } = await createServiceAccount(auth, projectId, 'firebase-deploy-prod', 'Firebase Deploy Production');

  // Grant roles on the project
  for (const saEmail of [saStagingEmail, saProductionEmail]) {
    const member = `serviceAccount:${saEmail}`;
    await grantRole(auth, `projects/${projectId}`, member, 'roles/firebase.admin');
    await grantRole(auth, `projects/${projectId}`, member, 'roles/datastore.owner');
    await grantRole(auth, `projects/${projectId}`, member, 'roles/serviceusage.serviceUsageConsumer');

    // Grant pool impersonation
    const poolMember = `principalSet://iam.googleapis.com/${poolName}/attribute.repository/${repoFullName}`;
    try {
      const saUrl = `projects/${projectId}/serviceAccounts/${saEmail}`;
      const policyUrl = `https://iam.googleapis.com/v1/${saUrl}:getIamPolicy`;
      const policy = await gcpFetch(auth, policyUrl, { method: 'POST' });

      const bindings = policy.bindings || [];
      const existing = bindings.find((b: any) => b.role === 'roles/iam.workloadIdentityUser');
      if (!existing) {
        bindings.push({ role: 'roles/iam.workloadIdentityUser', members: [poolMember] });
      } else if (!existing.members.includes(poolMember)) {
        existing.members.push(poolMember);
      }

      await gcpFetch(auth, `https://iam.googleapis.com/v1/${saUrl}:setIamPolicy`, {
        method: 'POST',
        body: { policy: { bindings, etag: policy.etag } },
      });
    } catch {
      // Set a fresh policy if getIamPolicy fails
      await gcpFetch(auth, `https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts/${saEmail}:setIamPolicy`, {
        method: 'POST',
        body: {
          policy: {
            bindings: [{ role: 'roles/iam.workloadIdentityUser', members: [poolMember] }],
          },
        },
      });
    }
  }

  return { wifPoolName: poolName, wifProviderName: providerName, saStagingEmail, saProductionEmail };
}
