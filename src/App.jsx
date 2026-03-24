import './App.css';
import React from 'react';

import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
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


const RootLayout = ({ db }) => {
  return (
    <>
      <EnvironmentBanner />
      <NavigationBar db={db} />
      <div className="pt-12">
        <Outlet />
      </div>
    </>
  );
};

const HomePage = () => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  return <LandingPage />;
};


function App({ db }) {
  
  return (
    <BrowserRouter>
      <Routes>
          <Route element={<RootLayout db={db} />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/post" element={<Post db={db}/>} />
          <Route path="/compose-post" element={<ComposePost db={db} />} />
          <Route path="/compose-reply" element={<ComposeReply db={db} />} />
          <Route path="/about" element={<About/>} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/profile" element={<Profile db={db} />} />
          <Route path="/infra-setup" element={<InfraSetup db={db} />} />
          <Route path="/create-app" element={<CreateApp db={db} />} />
        </Route>
        <Route path="/github-callback" element={<GitHubCallback db={db} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
