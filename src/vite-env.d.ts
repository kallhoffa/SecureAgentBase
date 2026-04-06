/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_GITHUB_CLIENT_ID: string;
  readonly VITE_GITHUB_APP_CLIENT_ID: string;
  readonly VITE_GITHUB_APP_CLIENT_SECRET: string;
  readonly VITE_GCP_CLIENT_ID: string;
  readonly VITE_STAGING_URL: string;
  readonly VITE_PRODUCTION_URL: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_API_KEY_STAGING: string;
  readonly VITE_FIREBASE_API_KEY_PRODUCTION: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN_STAGING: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN_PRODUCTION: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_PROJECT_ID_STAGING: string;
  readonly VITE_FIREBASE_PROJECT_ID_PRODUCTION: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET_STAGING: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET_PRODUCTION: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID_STAGING: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID_PRODUCTION: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_APP_ID_STAGING: string;
  readonly VITE_FIREBASE_APP_ID_PRODUCTION: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID_STAGING: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID_PRODUCTION: string;
  readonly VITE_USE_FIREBASE_EMULATOR: string;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
