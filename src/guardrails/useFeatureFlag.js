import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot, Firestore } from 'firebase/firestore';

const cache = new Map();

export const useFeatureFlag = (db, flagName, defaultValue = false) => {
  const [enabled, setEnabled] = useState(() => {
    if (cache.has(flagName)) return cache.get(flagName);
    return defaultValue;
  });

  useEffect(() => {
    if (!db || !flagName) return;

    const ref = doc(db, 'featureFlags', flagName);

    const unsub = onSnapshot(ref, (snap) => {
      const value = snap.exists() ? snap.data().enabled ?? defaultValue : defaultValue;
      cache.set(flagName, value);
      setEnabled(value);
    }, () => {
      setEnabled(defaultValue);
    });

    return unsub;
  }, [db, flagName, defaultValue]);

  return enabled;
};
