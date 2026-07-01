import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

const env = import.meta.env.VITE_APP_ENV || 'development';
const suffix = env === 'production' ? 'PRODUCTION' : 'STAGING';

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

export const getFirebaseApp = (): FirebaseApp => {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
};

export const getFirebaseDb = (): Firestore => {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
};
