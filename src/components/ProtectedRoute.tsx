import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from '../firestore-utils/auth-context';
import { Loader2 } from 'lucide-react';

interface RequireAuthProps {
  children: ReactNode;
}

export const RequireAuth: React.FC<RequireAuthProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

interface RedirectIfAuthedProps {
  children: ReactNode;
}

export const RedirectIfAuthed: React.FC<RedirectIfAuthedProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/profile" replace />;
  }

  return <>{children}</>;
};
