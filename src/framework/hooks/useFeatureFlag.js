import { useState, useEffect } from 'react';
import { fetchFeatureFlags } from '../firestore-utils/remote-config';

const getTestOverride = () => {
  if (typeof window !== 'undefined') {
    return window.__FLAG_TEST_MODE__;
  }
  return null;
};

const isStaging = () => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('staging');
};

const getBetaFromStorage = () => {
  if (typeof window === 'undefined') return false;
  const keys = Object.keys(localStorage);
  for (const key of keys) {
    if (key.startsWith('beta_enabled_')) {
      return localStorage.getItem(key) === 'true';
    }
  }
  return false;
};

export const useFeatureFlag = (flagKey) => {
  const getInitialValue = () => {
    if (isStaging() && flagKey === 'navigation_banner') {
      return 'beta';
    }
    if (flagKey === 'navigation_banner' && getBetaFromStorage()) {
      return 'beta';
    }
    return null;
  };

  const [flagValue, setFlagValue] = useState(getInitialValue);
  const [loading, setLoading] = useState(() => {
    if (isStaging() && flagKey === 'navigation_banner') {
      return false;
    }
    if (flagKey === 'navigation_banner' && getBetaFromStorage()) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    let mounted = true;

    const loadFlag = async () => {
      try {
        if (isStaging() && flagKey === 'navigation_banner') {
          if (mounted) {
            setFlagValue('beta');
            setLoading(false);
          }
          return;
        }

        if (flagKey === 'navigation_banner' && getBetaFromStorage()) {
          if (mounted) {
            setFlagValue('beta');
            setLoading(false);
          }
          return;
        }

        const testOverride = getTestOverride();
        if (testOverride) {
          if (mounted) {
            setFlagValue(testOverride[flagKey] || null);
            setLoading(false);
          }
          return;
        }

        let flags;
        
        if (window.__FEATURE_FLAGS__) {
          flags = window.__FEATURE_FLAGS__;
        } else {
          flags = await fetchFeatureFlags();
          if (typeof window !== 'undefined') {
            window.__FEATURE_FLAGS__ = flags;
          }
        }

        if (mounted) {
          setFlagValue(flags[flagKey] || null);
          setLoading(false);
        }
      } catch (error) {
        console.error(`Error loading flag ${flagKey}:`, error);
        if (mounted) {
          setFlagValue(null);
          setLoading(false);
        }
      }
    };

    loadFlag();

    return () => {
      mounted = false;
    };
  }, [flagKey]);

  return { flagValue, loading };
};

export default useFeatureFlag;
