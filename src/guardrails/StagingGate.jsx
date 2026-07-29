import { useState, useEffect } from 'react';
import { useAuth } from '../firestore-utils/auth-context';
import { doc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router-dom';

const isStaging = import.meta.env.VITE_APP_ENV === 'staging';
const isE2E = import.meta.env.VITE_E2E === 'true';

export const StagingGate = ({ db, children }) => {
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!isStaging) {
      setAuthorized(true);
      setChecking(false);
      return;
    }
    if (loading) return;
    if (!user) {
      setChecking(false);
      return;
    }
    let mounted = true;
    const checkWizard = async () => {
      try {
        const infraDoc = await getDoc(doc(db, 'infra_configs', user.uid));
        if (mounted) setAuthorized(infraDoc.exists());
      } catch {
        if (mounted) setAuthorized(false);
      }
      if (mounted) setChecking(false);
    };
    checkWizard();
    return () => { mounted = false; };
  }, [user, loading, db]);

  if (!isStaging || isE2E) return children;

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white p-8">
        <h1 className="text-3xl font-bold mb-4">Staging Access Restricted</h1>
        <p className="text-gray-400 mb-6 text-center max-w-md">
          This staging environment is restricted to authorized users.
          Please sign in with your Firebase account.
        </p>
        <Link
          to="/login"
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white p-8">
        <h1 className="text-3xl font-bold mb-4">Access Denied</h1>
        <p className="text-gray-400 mb-6 text-center max-w-md">
          Your account does not have access to this staging environment.
        </p>
        <Link
          to="/"
          className="text-blue-400 hover:text-blue-300 underline"
        >
          Go Home
        </Link>
      </div>
    );
  }

  return children;
};
