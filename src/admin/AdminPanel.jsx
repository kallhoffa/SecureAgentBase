import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Shield, Flag, Gauge, ArrowLeft } from 'lucide-react';
import { useAuth } from '../firestore-utils/auth-context';
import { useIsAdmin } from './useIsAdmin';
import FeatureFlags from './FeatureFlags';
import Limits from './Limits';

const SidebarLink = ({ to, icon: Icon, label, current }) => (
  <Link
    to={to}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
      current === to
        ? 'bg-indigo-100 text-indigo-700'
        : 'text-gray-600 hover:bg-gray-100'
    }`}
  >
    <Icon size={18} />
    {label}
  </Link>
);

const DashboardHome = () => (
  <div className="bg-white rounded-xl shadow-sm p-6">
    <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin Dashboard</h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-indigo-50 rounded-lg p-4">
        <Flag size={24} className="text-indigo-600 mb-2" />
        <h3 className="font-medium text-gray-900">Feature Flags</h3>
        <p className="text-sm text-gray-600 mt-1">Manage feature toggles for the app.</p>
      </div>
      <div className="bg-indigo-50 rounded-lg p-4">
        <Shield size={24} className="text-indigo-600 mb-2" />
        <h3 className="font-medium text-gray-900">Rate Limits</h3>
        <p className="text-sm text-gray-600 mt-1">View and configure rate limits.</p>
      </div>
      <div className="bg-indigo-50 rounded-lg p-4">
        <Gauge size={24} className="text-indigo-600 mb-2" />
        <h3 className="font-medium text-gray-900">Budget</h3>
        <p className="text-sm text-gray-600 mt-1">Monitor GCP budget thresholds.</p>
      </div>
    </div>
  </div>
);

const AdminPanel = ({ db }) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, checking } = useIsAdmin(db);
  const location = useLocation();
  const navigate = useNavigate();

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Shield size={48} className="mx-auto text-gray-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Admin Panel</h1>
          <p className="text-gray-600">Sign in to access the admin panel.</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <Shield size={48} className="mx-auto text-red-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">You do not have admin privileges for this app.</p>
          {user && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left text-sm">
              <p className="font-medium text-gray-900 mb-2">To grant yourself admin access:</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-600">
                <li>Open your <span className="font-mono text-xs bg-gray-200 px-1 py-0.5 rounded">admins</span> collection</li>
                <li>Create a new document with ID <span className="font-mono text-xs bg-gray-200 px-1 py-0.5 rounded">{user.uid}</span></li>
                <li>Set any field (e.g. <span className="font-mono text-xs bg-gray-200 px-1 py-0.5 rounded">role: "admin"</span>)</li>
                <li>Refresh this page</li>
              </ol>
              <a
                href={`https://console.firebase.google.com/project/${import.meta.env.VITE_FIREBASE_PROJECT_ID || ''}/firestore/data/admins/${user.uid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
              >
                Open Firestore Console →
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  const section = location.pathname.split('/admin')[1]?.replace(/^\//, '') || 'dashboard';

  const sidebarTabs = [
    { path: '/admin', icon: Gauge, label: 'Dashboard' },
    { path: '/admin/feature-flags', icon: Flag, label: 'Feature Flags' },
    { path: '/admin/limits', icon: Shield, label: 'Limits' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Shield className="text-indigo-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={16} />
            Back to app
          </button>
        </div>

        <div className="flex gap-6">
          <nav className="w-48 flex-shrink-0 space-y-1">
            {sidebarTabs.map((tab) => (
              <SidebarLink
                key={tab.path}
                to={tab.path}
                icon={tab.icon}
                label={tab.label}
                current={location.pathname}
              />
            ))}
          </nav>

          <div className="flex-1">
            {section === 'feature-flags' && <FeatureFlags db={db} />}
            {section === 'limits' && <Limits db={db} />}
            {section === 'dashboard' && <DashboardHome />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
