import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ _mock: 'app' })),
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ _mock: 'firestore' })),
}));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('firebase config suffix selection', () => {
  it('uses PRODUCTION suffix when VITE_APP_ENV is "production"', async () => {
    vi.stubEnv('VITE_APP_ENV', 'production');
    vi.stubEnv('VITE_FIREBASE_API_KEY_PRODUCTION', 'pk-prod');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN_PRODUCTION', 'prod.firebaseapp.com');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID_PRODUCTION', 'prod-project');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET_PRODUCTION', 'prod.appspot.com');
    vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID_PRODUCTION', '123');
    vi.stubEnv('VITE_FIREBASE_APP_ID_PRODUCTION', '1:123:web:abc');
    vi.stubEnv('VITE_FIREBASE_MEASUREMENT_ID_PRODUCTION', 'G-XXXXX');

    const { firebaseConfig } = await import('../firebase');
    expect(firebaseConfig.apiKey).toBe('pk-prod');
    expect(firebaseConfig.projectId).toBe('prod-project');
    expect(firebaseConfig.measurementId).toBe('G-XXXXX');
  });

  it('uses STAGING suffix when VITE_APP_ENV is "development"', async () => {
    vi.stubEnv('VITE_APP_ENV', 'development');
    vi.stubEnv('VITE_FIREBASE_API_KEY_STAGING', 'pk-stg');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN_STAGING', 'stg.firebaseapp.com');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID_STAGING', 'stg-project');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET_STAGING', 'stg.appspot.com');
    vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID_STAGING', '456');
    vi.stubEnv('VITE_FIREBASE_APP_ID_STAGING', '1:456:web:def');

    const { firebaseConfig } = await import('../firebase');
    expect(firebaseConfig.apiKey).toBe('pk-stg');
    expect(firebaseConfig.projectId).toBe('stg-project');
  });

  it('falls back to STAGING suffix when VITE_APP_ENV is not set', async () => {
    vi.stubEnv('VITE_APP_ENV', '');
    vi.stubEnv('VITE_FIREBASE_API_KEY_STAGING', 'stg-fallback');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN_STAGING', 'stg.firebaseapp.com');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID_STAGING', 'stg-fallback-project');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET_STAGING', 'stg.appspot.com');
    vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID_STAGING', '789');
    vi.stubEnv('VITE_FIREBASE_APP_ID_STAGING', '1:789:web:xyz');

    const { firebaseConfig } = await import('../firebase');
    expect(firebaseConfig.apiKey).toBe('stg-fallback');
  });

  it('uses STAGING suffix when VITE_APP_ENV is any non-production value', async () => {
    vi.stubEnv('VITE_APP_ENV', 'staging');
    vi.stubEnv('VITE_FIREBASE_API_KEY_STAGING', 'stg-other');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN_STAGING', 'stg.firebaseapp.com');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID_STAGING', 'stg-other-project');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET_STAGING', 'stg.appspot.com');
    vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID_STAGING', '000');
    vi.stubEnv('VITE_FIREBASE_APP_ID_STAGING', '1:000:web:other');

    const { firebaseConfig } = await import('../firebase');
    expect(firebaseConfig.apiKey).toBe('stg-other');
  });

  it('measurementId is undefined in STAGING suffix', async () => {
    vi.stubEnv('VITE_APP_ENV', 'development');
    vi.stubEnv('VITE_FIREBASE_API_KEY_STAGING', 'k');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN_STAGING', 'd');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID_STAGING', 'p');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET_STAGING', 's');
    vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID_STAGING', 'm');
    vi.stubEnv('VITE_FIREBASE_APP_ID_STAGING', 'a');

    const { firebaseConfig } = await import('../firebase');
    expect(firebaseConfig.measurementId).toBeUndefined();
  });
});

describe('getFirebaseApp / getFirebaseDb', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_APP_ENV', 'development');
    vi.stubEnv('VITE_FIREBASE_API_KEY_STAGING', 'k');
    vi.stubEnv('VITE_FIREBASE_AUTH_DOMAIN_STAGING', 'd');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID_STAGING', 'p');
    vi.stubEnv('VITE_FIREBASE_STORAGE_BUCKET_STAGING', 's');
    vi.stubEnv('VITE_FIREBASE_MESSAGING_SENDER_ID_STAGING', 'm');
    vi.stubEnv('VITE_FIREBASE_APP_ID_STAGING', 'a');
  });

  it('getFirebaseApp initializes and returns the same app instance', async () => {
    const mod = await import('../firebase');
    const app1 = mod.getFirebaseApp();
    const app2 = mod.getFirebaseApp();
    expect(app1).toBe(app2);
  });

  it('getFirebaseDb returns a Firestore instance', async () => {
    const mod = await import('../firebase');
    const db = mod.getFirebaseDb();
    expect(db).toEqual({ _mock: 'firestore' });
  });
});
