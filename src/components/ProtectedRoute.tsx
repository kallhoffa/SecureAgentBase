import { Navigate, useLocation } from 'react-router';
import { ReactNode } from 'react';
import { useAuth } from '../firestore-utils/auth-context';
import { Loader2 } from 'lucide-react';

interface RequireAuthProps {
  children: ReactNode;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (!user) {
    // Pass the path the user was trying to reach so login can return them
    // there instead of redirecting to /profile (the RedirectIfAuthed default).
    const returnUrl = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnUrl=${returnUrl}`} replace />;
  }

  return <>{children}</>;
};

interface RedirectIfAuthedProps {
  children: ReactNode;
}

export const RedirectIfAuthed: React.FC<RedirectIfAuthedProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (user) {
    // If a returnUrl is present (user was trying to reach a protected route),
    // send them there; otherwise default to /profile for the /login landing flow.
    const params = new URLSearchParams(location.search);
    const returnUrl = params.get('returnUrl');
    if (returnUrl) {
      return <Navigate to={returnUrl} replace />;
    }
    return <Navigate to="/profile" replace />;
  }

  return <>{children}</>;
};
