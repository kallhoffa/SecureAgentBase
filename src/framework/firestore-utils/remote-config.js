import { initializeApp } from 'firebase/app';
import { getRemoteConfig, fetchAndActivate, getString } from 'firebase/remote-config';
import { FEATURE_FLAGS } from '../config/featureFlags';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

let remoteConfigInstance = null;

export const getRemoteConfigInstance = () => {
  if (!remoteConfigInstance) {
    const app = initializeApp(firebaseConfig);
    remoteConfigInstance = getRemoteConfig(app);
    
    remoteConfigInstance.settings = {
      minimumFetchIntervalMillis: import.meta.env.PROD ? 3600000 : 30000,
      fetchTimeoutMillis: 5000,
    };
  }
  return remoteConfigInstance;
};

export const fetchFeatureFlags = async () => {
  try {
    const rc = getRemoteConfigInstance();
    
    const defaults = {};
    for (const flag of Object.values(FEATURE_FLAGS)) {
      defaults[flag.key] = flag.default;
    }
    
    rc.defaultConfig = defaults;
    
    await fetchAndActivate(rc);
    
    const flags = {};
    for (const flag of Object.values(FEATURE_FLAGS)) {
      flags[flag.key] = getString(rc, flag.key);
    }
    
    return flags;
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    
    const fallback = {};
    for (const flag of Object.values(FEATURE_FLAGS)) {
      fallback[flag.key] = flag.default;
    }
    return fallback;
  }
};
