import { BrowserRouter, Routes, Route, Outlet, Link, Navigate } from 'react-router';
import { Firestore } from 'firebase/firestore';
import { Auth } from 'firebase/auth';
import LandingPage from './posts';
import { useAuth } from './firestore-utils/auth-context';
import Post from './post';
import ComposePost from './compose-post';
import ComposeReply from './compose-reply';
import EnvironmentBanner from './environment-banner';
import About from './about';
import Privacy from './privacy';
import Terms from './terms';
import NavigationBar from './navigation-bar';
import Login from './login';
import Signup from './signup';
import Profile from './profile';
import InfraSetup from './infra-setup';
import CreateApp from './create-app';

import { Dashboard, Tasks } from './template';
import AdminPanel from './admin/AdminPanel';
import { NotificationProvider } from './firestore-utils/notification-context';
import { RequireAuth, RedirectIfAuthed } from './components/ProtectedRoute';
import { StagingGate } from './guardrails/StagingGate';

const isAppMode = import.meta.env.VITE_APP_MODE === 'true';
const appName = import.meta.env.VITE_APP_NAME || (isAppMode ? 'SecureAgentBase' : 'Your App');

interface RootLayoutProps {
  db: Firestore;
}

const RootLayout: React.FC<RootLayoutProps> = ({ db }) => {
  return (
    <>
      <EnvironmentBanner />
      <NavigationBar db={db} />
      <div className="pt-24 min-h-[calc(100vh-10rem)]">
        <Outlet />
      </div>
      <footer className="border-t border-gray-200 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
          <span>&copy; {new Date().getFullYear()} {appName}</span>
          <nav className="flex items-center space-x-4">
            <Link to="/privacy" className="hover:text-blue-600">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-blue-600">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </>
  );
};

// Standalone layout — same chrome as RootLayout but wraps children directly
// (no Outlet) so routes outside the StagingGate layout can use it.
const StandaloneLayout: React.FC<RootLayoutProps & { children: React.ReactNode }> = ({ db, children }) => {
  return (
    <>
      <EnvironmentBanner />
      <NavigationBar db={db} />
      <div className="pt-24 min-h-[calc(100vh-10rem)]">
        {children}
      </div>
      <footer className="border-t border-gray-200 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-gray-500">
          <span>&copy; {new Date().getFullYear()} {appName}</span>
          <nav className="flex items-center space-x-4">
            <Link to="/privacy" className="hover:text-blue-600">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-blue-600">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </>
  );
};

const HomePage: React.FC = () => {
  const { loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (isAppMode) {
    return <LandingPage />;
  }
  return <Dashboard />;
};

interface AppProps {
  db: Firestore;
  auth: Auth;
}

const App: React.FC<AppProps> = ({ db }) => {
  return (
    <NotificationProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
          <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
          <Route element={<StagingGate db={db}><RootLayout db={db} /></StagingGate>}>
            <Route path="/" element={<HomePage />} />
            {isAppMode ? (
              <>
                {/* The template repo (this deployment) must not accept user
                    posts. Posts are a feature of the apps users copy from the
                    template — so they live in template mode instead. */}
                <Route path="/post" element={<Navigate to="/" replace />} />
                <Route path="/compose-post" element={<Navigate to="/" replace />} />
                <Route path="/compose-reply" element={<Navigate to="/" replace />} />
              </>
            ) : (
              <>
                {/* Copied apps (template mode) get the posts feature:
                    create a post, view it, reply. */}
                <Route path="/post" element={<Post db={db}/>} />
                <Route path="/compose-post" element={<RequireAuth><ComposePost db={db} /></RequireAuth>} />
                <Route path="/compose-reply" element={<RequireAuth><ComposeReply db={db} /></RequireAuth>} />
              </>
            )}
            <Route path="/about" element={<About/>} />
          <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/profile" element={<RequireAuth><Profile db={db} /></RequireAuth>} />
            {isAppMode && (
              <Route path="/create-app" element={<RequireAuth><CreateApp db={db} /></RequireAuth>} />
            )}
            <Route path="/tasks" element={<RequireAuth><Tasks db={db} /></RequireAuth>} />
            <Route path="/preview" element={<Dashboard />} />
          </Route>
          {/* Infra-setup lives outside StagingGate — it doesn't require
              Firebase auth (works via localStorage fallback) and the wizard
              operator needs unconditional access during setup. */}
          {isAppMode && (
            <Route path="/infra-setup" element={
              <StandaloneLayout db={db}>
                <InfraSetup db={db} />
              </StandaloneLayout>
            } />
          )}
          <Route path="/admin" element={<StagingGate db={db}><AdminPanel db={db} /></StagingGate>} />
          <Route path="/admin/feature-flags" element={<StagingGate db={db}><AdminPanel db={db} /></StagingGate>} />
          <Route path="/admin/limits" element={<StagingGate db={db}><AdminPanel db={db} /></StagingGate>} />
        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
};

export default App;
