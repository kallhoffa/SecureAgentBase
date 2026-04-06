import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './firestore-utils/auth-context';
import { getFirebaseApp, getFirebaseDb } from './firebase';

import * as Sentry from '@sentry/react';

import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore } from 'firebase/firestore';

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

const app = getFirebaseApp();
const db: Firestore = getFirebaseDb();
const auth: Auth = getAuth(app);

if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099');
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <Sentry.ErrorBoundary fallback={<div>Something went wrong. Please refresh the page.</div>}>
    <AuthProvider auth={auth}>
      <App db={db} auth={auth}/>
    </AuthProvider>
  </Sentry.ErrorBoundary>
);
