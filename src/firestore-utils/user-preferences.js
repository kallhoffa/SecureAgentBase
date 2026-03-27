import { doc, getDoc, setDoc } from 'firebase/firestore';

export const getUserPreferences = async (db, userId) => {
  const prefsRef = doc(db, 'userPreferences', userId);
  const prefsSnap = await getDoc(prefsRef);
  
  if (prefsSnap.exists()) {
    return prefsSnap.data();
  }
  
  return { beta_enabled: false };
};

export const setUserBetaPreference = async (db, userId, enabled) => {
  const prefsRef = doc(db, 'userPreferences', userId);
  await setDoc(prefsRef, { beta_enabled: enabled }, { merge: true });
};