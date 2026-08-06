import { GoogleAuth } from 'google-auth-library';

// Least-privilege scope policy — must stay in sync with the web wizard's SA
// impersonation scopes (src/infra-setup.tsx, src/framework/infra-setup/api.ts).
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/compute',
  'https://www.googleapis.com/auth/devstorage.read_write',
  'https://www.googleapis.com/auth/cloud-billing.readonly',
];

export interface AuthClient {
  getToken(): Promise<string>;
  getProjectId(): Promise<string | null>;
  getClientEmail(): Promise<string | null>;
}

class ADCAuthClient implements AuthClient {
  private auth: GoogleAuth;
  private projectId: string | null = null;
  private clientEmail: string | null = null;

  constructor() {
    this.auth = new GoogleAuth({ scopes: SCOPES });
  }

  async getToken(): Promise<string> {
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) throw new Error('Failed to get access token from ADC');
    return tokenResponse.token;
  }

  async getProjectId(): Promise<string | null> {
    if (this.projectId) return this.projectId;
    try {
      this.projectId = await this.auth.getProjectId() || null;
    } catch {
      this.projectId = null;
    }
    return this.projectId;
  }

  async getClientEmail(): Promise<string | null> {
    if (this.clientEmail) return this.clientEmail;
    try {
      const client = await this.auth.getClient();
      if ('email' in client && typeof client.email === 'string') {
        this.clientEmail = client.email;
      }
    } catch {
      this.clientEmail = null;
    }
    return this.clientEmail;
  }
}

// ADC-only (map #36 decision #6): service-account-key auth is gone. The CLI
// authenticates purely via Application Default Credentials (gcloud auth
// application-default login, Workload Identity Federation, or
// GOOGLE_APPLICATION_CREDENTIALS pointing at an ADC/authorized-user file).
export function createAuth(): AuthClient {
  return new ADCAuthClient();
}
