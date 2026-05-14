import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../firestore-utils/auth-context';
import { Shield, User, Info, CheckCircle } from 'lucide-react';

const appName = import.meta.env.VITE_APP_NAME || 'Your App';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const quickLinks = [
    {
      label: 'Tasks',
      description: 'Manage your tasks with Firestore CRUD',
      icon: CheckCircle,
      action: () => navigate('/tasks'),
      color: 'bg-blue-100 text-blue-600',
    },
    {
      label: 'Profile',
      description: 'View and edit your account',
      icon: User,
      action: () => navigate('/profile'),
      color: 'bg-green-100 text-green-600',
    },
    {
      label: 'About',
      description: 'About this template',
      icon: Info,
      action: () => navigate('/about'),
      color: 'bg-purple-100 text-purple-600',
    },
    {
      label: 'Security',
      description: 'Auth, Firestore rules, and best practices',
      icon: Shield,
      action: () => navigate('/about'),
      color: 'bg-orange-100 text-orange-600',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to {appName}
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            A hardened React + Firebase template with authentication,
            Firestore, and security best practices out of the box.
          </p>
        </div>

        {!user && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8 text-center">
            <p className="text-gray-600 mb-4">
              Sign in to access your tasks and profile.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate('/login')}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate('/signup')}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200"
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {quickLinks.map((link) => (
            <button
              key={link.label}
              onClick={link.action}
              className="bg-white rounded-xl shadow-sm p-6 text-left hover:shadow-md transition-shadow flex items-start gap-4"
            >
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${link.color}`}>
                <link.icon size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{link.label}</h3>
                <p className="text-sm text-gray-600">{link.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
