import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../firestore-utils/auth-context';

export const useIsAdmin = (db) => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setIsAdmin(false);
      setChecking(false);
      return;
    }

    let mounted = true;
    const check = async () => {
      try {
        const ref = doc(db, 'admins', user.uid);
        const snap = await getDoc(ref);
        if (mounted) setIsAdmin(snap.exists());
      } catch {
        if (mounted) setIsAdmin(false);
      } finally {
        if (mounted) setChecking(false);
      }
    };
    check();
    return () => { mounted = false; };
  }, [db, user]);

  return { isAdmin, checking };
};
