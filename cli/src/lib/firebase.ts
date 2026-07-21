import type { AuthClient } from './auth.js';
import { gcpFetch } from './gcp.js';

export async function listFirebaseProjects(auth: AuthClient): Promise<any[]> {
  const data = await gcpFetch(auth, 'https://firebase.googleapis.com/v1beta1/projects');
  return data.results || [];
}

export async function addFirebaseToProject(
  auth: AuthClient,
  projectId: string
): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await gcpFetch(auth, `https://firebase.googleapis.com/v1beta1/projects/${projectId}:addFirebase`, {
        method: 'POST',
      });
      return true;
    } catch (e: any) {
      if (e.message?.includes('alreadyExists')) return true;
      if (e.message?.includes('403') && attempt < 5) {
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  return false;
}

export async function listWebApps(
  auth: AuthClient,
  projectId: string
): Promise<any[]> {
  const data = await gcpFetch(auth, `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`);
  return data.apps || [];
}

export async function createWebApp(
  auth: AuthClient,
  projectId: string,
  displayName: string
): Promise<any> {
  return gcpFetch(auth, `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps`, {
    method: 'POST',
    body: { displayName },
  });
}

export async function getWebAppConfig(
  auth: AuthClient,
  projectId: string,
  appId: string
): Promise<Record<string, string>> {
  return gcpFetch(auth, `https://firebase.googleapis.com/v1beta1/projects/${projectId}/webApps/${appId}/config`);
}

export async function updateAuthDomains(
  auth: AuthClient,
  projectId: string,
  domains: string[]
): Promise<void> {
  try {
    const config = await gcpFetch(
      auth,
      `https://identitytoolkit.googleapis.com/v2/projects/${projectId}/config`
    );

    const existing = config.authorizedDomains || [];
    const merged = [...new Set([...existing, ...domains])];

    await gcpFetch(
      auth,
      `https://identitytoolkit.googleapis.com/v2/projects/${projectId}/config?updateMask=authorizedDomains`,
      {
        method: 'PATCH',
        body: { authorizedDomains: merged },
      }
    );
  } catch {
    // Identity Toolkit may not be enabled yet
  }
}

export interface FirebaseSetupResult {
  projectId: string;
  config: Record<string, string>;
  appId: string;
}

export async function setupFirebaseProject(
  auth: AuthClient,
  gcpProjectId: string,
  displayName: string
): Promise<FirebaseSetupResult> {
  // Add Firebase to the GCP project
  await addFirebaseToProject(auth, gcpProjectId);

  // Wait for Firebase to be ready
  await new Promise((r) => setTimeout(r, 5000));

  // Create or find web app
  let apps = await listWebApps(auth, gcpProjectId);
  let webApp = apps.find((a: any) => a.displayName === displayName);

  if (!webApp) {
    webApp = await createWebApp(auth, gcpProjectId, displayName);
  }

  // Get SDK config
  const config = await getWebAppConfig(auth, gcpProjectId, webApp.appId);

  // Update auth domains
  await updateAuthDomains(auth, gcpProjectId, [
    'localhost',
    '*.web.app',
    '*.firebaseapp.com',
  ]);

  return { projectId: gcpProjectId, config, appId: webApp.appId };
}
