import { doc, getDoc, setDoc, Firestore } from 'firebase/firestore';
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
  const prefsRef = doc(db, 'userPreferences', userId);
  await setDoc(prefsRef, { beta_enabled: enabled }, { merge: true });
};
