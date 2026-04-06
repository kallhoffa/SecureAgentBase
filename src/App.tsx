import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Firestore } from 'firebase/firestore';
import { Auth } from 'firebase/auth';
import { LandingPage } from './posts';
import { useAuth } from './firestore-utils/auth-context';
import Post from './post';
import ComposePost from './compose-post';
import ComposeReply from './compose-reply';
import EnvironmentBanner from './environment-banner';
import About from './about';
import NavigationBar from './navigation-bar';
import Login from './login';
import Signup from './signup';
import Profile from './profile';
import InfraSetup from './infra-setup';
import CreateApp from './create-app';
import GitHubCallback from './github-callback';
import { NotificationProvider } from './firestore-utils/notification-context';
import { RequireAuth, RedirectIfAuthed } from './components/ProtectedRoute';

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
  
  return <LandingPage />;
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
          <Route element={<RootLayout db={db} />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/post" element={<Post db={db}/>} />
            <Route path="/compose-post" element={<RequireAuth><ComposePost db={db} /></RequireAuth>} />
            <Route path="/compose-reply" element={<RequireAuth><ComposeReply db={db} /></RequireAuth>} />
            <Route path="/about" element={<About/>} />
            <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
            <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
            <Route path="/profile" element={<RequireAuth><Profile db={db} /></RequireAuth>} />
            <Route path="/infra-setup" element={<RequireAuth><InfraSetup db={db} /></RequireAuth>} />
            <Route path="/create-app" element={<RequireAuth><CreateApp db={db} /></RequireAuth>} />
          </Route>
          <Route path="/github-callback" element={<GitHubCallback db={db} />} />
        </Routes>
      </BrowserRouter>
    </NotificationProvider>
  );
};

export default App;
