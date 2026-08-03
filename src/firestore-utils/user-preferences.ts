import { doc, getDoc, Firestore } from 'firebase/firestore';
import { safeSet } from '../guardrails/safe-firestore';
import type { UserPreferences } from '../types';

export const getUserPreferences = async (db: Firestore, userId: string): Promise<UserPreferences> => {
  const prefsRef = doc(db, 'userPreferences', userId);
  const prefsSnap = await getDoc(prefsRef);
  
  if (prefsSnap.exists()) {
    return prefsSnap.data() as UserPreferences;
  }
  
  return { beta_enabled: false };
};

export const setUserBetaPreference = async (db: Firestore, userId: string, enabled: boolean): Promise<void> => {
  await safeSet(db, 'userPreferences', userId, { beta_enabled: enabled }, userId, {
    allowFields: ['beta_enabled'],
    merge: true,
  });
};
