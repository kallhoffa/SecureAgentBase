import { BrowserRouter, Routes, Route, Outlet } from 'react-router';
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

interface RootLayoutProps {
  db: Firestore;
}

const RootLayout: React.FC<RootLayoutProps> = ({ db }) => {
  return (
    <>
      <EnvironmentBanner />
      <NavigationBar db={db} />
      <div className="pt-24">
        <Outlet />
      </div>
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
            <Route path="/post" element={<Post db={db}/>} />
            <Route path="/compose-post" element={<RequireAuth><ComposePost db={db} /></RequireAuth>} />
            <Route path="/compose-reply" element={<RequireAuth><ComposeReply db={db} /></RequireAuth>} />
            <Route path="/about" element={<About/>} />
          <Route path="/privacy" element={<Privacy />} />
            <Route path="/profile" element={<RequireAuth><Profile db={db} /></RequireAuth>} />
            {isAppMode && (
              <Route path="/infra-setup" element={<InfraSetup db={db} />} />
            )}
            {isAppMode && (
              <Route path="/create-app" element={<RequireAuth><CreateApp db={db} /></RequireAuth>} />
            )}
            <Route path="/tasks" element={<RequireAuth><Tasks db={db} /></RequireAuth>} />
            <Route path="/preview" element={<Dashboard />} />
          </Route>
          <Route path="/admin" element={<StagingGate db={db}><AdminPanel db={db} /></StagingGate>} />
          <Route path="/admin/feature-flags" element={<StagingGate db={db}><AdminPanel db={db} /></StagingGate>} />
          <Route path="/admin/limits" element={<StagingGate db={db}><AdminPanel db={db} /></StagingGate>} />
        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
};

export default App;
