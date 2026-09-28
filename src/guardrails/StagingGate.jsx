import { useAuth } from '../firestore-utils/auth-context';
import { Link } from 'react-router';

const isStaging = import.meta.env.VITE_APP_ENV === 'staging';
const isE2E = import.meta.env.VITE_E2E === 'true';
const LOCALSTORAGE_KEY = 'infra_config_pending';

export const StagingGate = ({ children }) => {
  const { user, loading } = useAuth();

  if (!isStaging || isE2E) return children;

  if (loading) {
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

  // infra_configs was removed from Firestore — the wizard now persists a
  // localStorage marker (infra_config_pending) instead. Access is granted
  // when that marker exists. (Deployed staging builds run with VITE_E2E=true
  // and bypass this gate entirely; this only gates local staging dev.)
  const authorized = !!localStorage.getItem(LOCALSTORAGE_KEY);

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
