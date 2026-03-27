import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './firestore-utils/auth-context';

import * as Sentry from '@sentry/react';

import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_APP_ENV || 'production',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

const env = import.meta.env.VITE_APP_ENV || 'development';
const suffix = env === 'production' ? 'PRODUCTION' : 'STAGING';

const firebaseConfig = {
  apiKey: import.meta.env[`VITE_FIREBASE_API_KEY_${suffix}`],
  authDomain: import.meta.env[`VITE_FIREBASE_AUTH_DOMAIN_${suffix}`],
  projectId: import.meta.env[`VITE_FIREBASE_PROJECT_ID_${suffix}`],
  storageBucket: import.meta.env[`VITE_FIREBASE_STORAGE_BUCKET_${suffix}`],
  messagingSenderId: import.meta.env[`VITE_FIREBASE_MESSAGING_SENDER_ID_${suffix}`],
  appId: import.meta.env[`VITE_FIREBASE_APP_ID_${suffix}`],
  measurementId: import.meta.env[`VITE_FIREBASE_MEASUREMENT_ID_${suffix}`]
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099');
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Sentry.ErrorBoundary fallback={<div>Something went wrong. Please refresh the page.</div>}>
    <AuthProvider auth={auth}>
      <App db={db} auth={auth}/>
    </AuthProvider>
  </Sentry.ErrorBoundary>
);
