import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export const getUserPreferences = async (db, userId) => {
  try {
    const userDoc = doc(db, 'users', userId);
    const snapshot = await getDoc(userDoc);
    
    if (snapshot.exists()) {
      return snapshot.data();
    }
    
    return { beta_enabled: false };
  } catch (error) {
    console.error('Error getting user preferences:', error);
    return { beta_enabled: false };
  }
};

export const setUserBetaPreference = async (db, userId, betaEnabled) => {
  try {
    const userDoc = doc(db, 'users', userId);
    const snapshot = await getDoc(userDoc);
    
    if (snapshot.exists()) {
      await updateDoc(userDoc, { beta_enabled: betaEnabled });
    } else {
      await setDoc(userDoc, { beta_enabled: betaEnabled, createdAt: new Date() });
    }
  } catch (error) {
    console.error('Error setting beta preference:', error);
    throw error;
  }
};
