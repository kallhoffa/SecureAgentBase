import React, { useState, useEffect } from 'react';
import { useAuth } from './firestore-utils/auth-context';
import { useNavigate } from 'react-router-dom';
import { getUserPreferences, setUserBetaPreference } from './firestore-utils/user-preferences';
import { Shield, ExternalLink, Plus } from 'lucide-react';

const Profile = ({ db }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [betaEnabled, setBetaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      if (user) {
        try {
          const prefs = await getUserPreferences(db, user.uid);
          setBetaEnabled(prefs.beta_enabled || false);
        } catch (error) {
          console.error('Error loading preferences:', error);
        }
      }
      setLoading(false);
    };

    loadPreferences();
  }, [db, user]);

  const handleToggleBeta = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const newValue = !betaEnabled;
      await setUserBetaPreference(db, user.uid, newValue);
      setBetaEnabled(newValue);
      localStorage.setItem(`beta_enabled_${user.uid}`, newValue ? 'true' : 'false');
    } catch (error) {
      console.error('Error updating beta preference:', error);
      alert('Failed to update beta preference');
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      alert('Logout failed: ' + error.message);
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p>Please sign in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Account</h2>
        <p className="text-gray-600 mb-2">
          <span className="font-medium">Email:</span> {user.email}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Beta Program</h2>
        <p className="text-gray-600 mb-4">
          Join the beta program to get early access to new features.
        </p>
        
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {betaEnabled ? 'Beta Enabled' : 'Join Beta'}
          </span>
          <button
            onClick={handleToggleBeta}
            disabled={saving || loading}
            className={`px-4 py-2 rounded-full font-medium transition-colors ${
              betaEnabled
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {saving ? 'Saving...' : betaEnabled ? 'Enabled' : 'Enable'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <Plus className="text-green-600" size={24} />
          <h2 className="text-lg font-semibold">Your Apps</h2>
        </div>
        <p className="text-gray-600 mb-4">
          Create and manage your full-stack apps. Build entirely from Discord.
        </p>
        <button
          onClick={() => navigate('/create-app')}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 flex items-center gap-2"
        >
          <Plus size={18} />
          Create New App
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="text-blue-600" size={24} />
          <h2 className="text-lg font-semibold">Infrastructure</h2>
        </div>
        <p className="text-gray-600 mb-4">
          Connect your GCP project and GitHub to enable autonomous deployments.
        </p>
        <button
          onClick={() => navigate('/infra-setup')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
        >
          <ExternalLink size={18} />
          Configure Infrastructure
        </button>
      </div>

      <div className="mt-6">
        <button
          onClick={handleLogout}
          className="text-red-600 hover:text-red-700 font-medium"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default Profile;
