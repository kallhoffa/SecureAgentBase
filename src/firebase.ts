import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider, AppCheck } from 'firebase/app-check';

const rawEnv = (import.meta.env.VITE_APP_ENV || '').trim().toLowerCase();
const VALID_ENVS = ['production', 'staging', 'development'];
if (rawEnv && !VALID_ENVS.includes(rawEnv)) {
  console.warn(`Invalid VITE_APP_ENV "${rawEnv}" — expected "production" or "staging". Falling back to staging.`);
}
const isProduction = rawEnv === 'production';
const suffix = isProduction ? 'PRODUCTION' : 'STAGING';

const appCheckSiteKey = import.meta.env[`VITE_FIREBASE_APP_CHECK_SITE_KEY_${suffix}`] as string | undefined;

export const firebaseConfig = {
  apiKey: import.meta.env[`VITE_FIREBASE_API_KEY_${suffix}`] as string,
  authDomain: import.meta.env[`VITE_FIREBASE_AUTH_DOMAIN_${suffix}`] as string,
  projectId: import.meta.env[`VITE_FIREBASE_PROJECT_ID_${suffix}`] as string,
  storageBucket: import.meta.env[`VITE_FIREBASE_STORAGE_BUCKET_${suffix}`] as string,
  messagingSenderId: import.meta.env[`VITE_FIREBASE_MESSAGING_SENDER_ID_${suffix}`] as string,
  appId: import.meta.env[`VITE_FIREBASE_APP_ID_${suffix}`] as string,
  measurementId: import.meta.env[`VITE_FIREBASE_MEASUREMENT_ID_${suffix}`] as string | undefined
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let appCheck: AppCheck | null = null;

export const getFirebaseApp = (): FirebaseApp => {
  if (!app) {
    app = initializeApp(firebaseConfig);
    if (appCheckSiteKey) {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    }
  }
  return app;
};

export const getFirebaseDb = (): Firestore => {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
};
