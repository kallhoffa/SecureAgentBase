import { getRemoteConfig, fetchAndActivate, getString, RemoteConfig } from 'firebase/remote-config';
import { getFirebaseApp } from '../../firebase';
import { FEATURE_FLAGS } from '../config/featureFlags';

let remoteConfigInstance: RemoteConfig | null = null;

export const getRemoteConfigInstance = (): RemoteConfig => {
  if (!remoteConfigInstance) {
    const app = getFirebaseApp();
    remoteConfigInstance = getRemoteConfig(app);
    
    remoteConfigInstance.settings = {
      minimumFetchIntervalMillis: import.meta.env.PROD ? 3600000 : 30000,
      fetchTimeoutMillis: 5000,
    };
  }
  return remoteConfigInstance;
};

export const fetchFeatureFlags = async (): Promise<Record<string, string | boolean>> => {
  try {
    const rc = getRemoteConfigInstance();
    
    const defaults: Record<string, string | boolean> = {};
    for (const flag of Object.values(FEATURE_FLAGS)) {
      defaults[flag.key] = flag.default;
    }
    
    rc.defaultConfig = defaults;
    
    await fetchAndActivate(rc);
    
    const flags: Record<string, string> = {};
    for (const flag of Object.values(FEATURE_FLAGS)) {
      flags[flag.key] = getString(rc, flag.key);
    }
    
    return flags;
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    
    const fallback: Record<string, string | boolean> = {};
    for (const flag of Object.values(FEATURE_FLAGS)) {
      fallback[flag.key] = flag.default;
    }
    return fallback;
  }
};
