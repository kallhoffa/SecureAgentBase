import { LogOut, User } from 'lucide-react';
import { useNavigate, NavigateFunction } from 'react-router-dom';
import { useAuth } from './firestore-utils/auth-context';
import { useNotification } from './firestore-utils/notification-context';
import { Firestore } from 'firebase/firestore';

interface NavigationBarProps {
  navigate?: NavigateFunction;
  db?: Firestore;
}

const NavigationBar: React.FC<NavigationBarProps> = ({ navigate: navigationOverride }) => {
  const defaultNavigate = useNavigate();
  const navigate = navigationOverride || defaultNavigate;
  const { user, logout } = useAuth();
  const { addNotification } = useNotification();

  const handleLogout = async (): Promise<void> => {
    try {
      await logout();
    } catch (error) {
      addNotification('Logout failed: ' + (error as Error).message, 'error');
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200 fixed w-full top-8 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <a href="/" className="flex items-center">
            <h1 className="text-2xl font-bold text-blue-900">
              SecureAgentBase
            </h1>
          </a>

          <div className="flex items-center space-x-4">
            <a href="/infra-setup" className="text-gray-600 hover:text-blue-600 text-sm font-medium">
              Deploy
            </a>
            <a href="/about" className="text-gray-600 hover:text-blue-600 text-sm font-medium">
              About
            </a>
            {user ? (
              <>
                <button 
                  onClick={() => navigate('/profile')}
                  className="flex items-center space-x-1 text-gray-600 hover:text-blue-600 text-sm font-medium"
                >
                  <User size={16} />
                  <span>Profile</span>
                </button>
                <button 
                  onClick={handleLogout}
                  className="flex items-center space-x-1 text-gray-600 hover:text-blue-600 text-sm font-medium"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => navigate(`/login?returnUrl=${encodeURIComponent(window.location.pathname)}`)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700"
                >
                  Sign In
                </button>
                <button 
                  onClick={() => navigate(`/signup?returnUrl=${encodeURIComponent(window.location.pathname)}`)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-blue-700"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default NavigationBar;
