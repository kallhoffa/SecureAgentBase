import { GoogleAuth, ExternalAccountClient } from 'google-auth-library';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/compute',
  'https://www.googleapis.com/auth/devstorage.full_control',
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

class SAKeyAuthClient implements AuthClient {
  private saKey: any;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private keyPath: string) {
    const raw = fs.readFileSync(keyPath, 'utf-8');
    this.saKey = JSON.parse(raw);
    if (!this.saKey.private_key || !this.saKey.client_email) {
      throw new Error('Invalid service account key file');
    }
  }

  async getToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }
    const token = await signJwtAndGetToken(this.saKey, SCOPES.join(' '));
    this.tokenCache = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
    return token;
  }

  async getProjectId(): Promise<string | null> {
    return this.saKey.project_id || null;
  }

  async getClientEmail(): Promise<string | null> {
    return this.saKey.client_email || null;
  }
}

async function signJwtAndGetToken(saKey: any, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: saKey.client_email,
    sub: saKey.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope,
  };

  const header = { alg: 'RS256', typ: 'JWT' };
  const encodeBase64Url = (obj: any) => {
    return Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  const encodedHeader = encodeBase64Url(header);
  const encodedPayload = encodeBase64Url(payload);
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const crypto = await import('node:crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(saKey.private_key.replace(/\\n/g, '\n'), 'base64url');

  const jwt = `${signatureInput}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to exchange JWT for token: ${err}`);
  }

  const data = await response.json() as any;
  return data.access_token;
}

export async function createAuth(saKeyPath?: string): Promise<AuthClient> {
  if (saKeyPath) {
    return new SAKeyAuthClient(saKeyPath);
  }

  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (adcPath && fs.existsSync(adcPath)) {
    try {
      const key = JSON.parse(fs.readFileSync(adcPath, 'utf-8'));
      if (key.private_key) {
        return new SAKeyAuthClient(adcPath);
      }
    } catch {
      // Not a SA key, try ADC
    }
  }

  return new ADCAuthClient();
}
