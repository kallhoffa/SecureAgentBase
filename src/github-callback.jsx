import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { Check, AlertCircle, Loader2, Github } from 'lucide-react';

const GitHubCallback = ({ db }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing...');
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const installationId = searchParams.get('installation_id');
      const setupAction = searchParams.get('setup_action');

      if (setupAction === 'cancel') {
        setStatus('cancelled');
        setMessage('GitHub App installation was cancelled');
        return;
      }

      if (code) {
        await handleOAuthFork(code, state);
      } else if (installationId) {
        await handleAppInstall(installationId, state);
      } else {
        setStatus('error');
        setError('No valid callback parameters received');
      }
    };

    handleCallback();
  }, [db, navigate, searchParams]);

  const handleOAuthFork = async (code, state) => {
    try {
      setMessage('Exchanging code for access token...');
      
      const clientId = import.meta.env.VITE_GITHUB_APP_CLIENT_ID;
      const clientSecret = import.meta.env.VITE_GITHUB_APP_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        setStatus('error');
        setMessage('GitHub OAuth not configured');
        return;
      }

      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
        }),
      });

      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error);
      }

      const accessToken = tokenData.access_token;
      setMessage('Forking SecureAgentBase repo...');

      const forkResponse = await fetch('https://api.github.com/repos/kallhoffa/SecureAgentBase/forks', {
        method: 'POST',
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!forkResponse.ok) {
        const err = await forkResponse.json();
        if (err.message === 'Repository fork already exists') {
          setMessage('Repo already forked! Getting fork info...');
        } else {
          throw new Error(err.message || 'Failed to fork repo');
        }
      }

      const forkData = await forkResponse.json();
      const forkUrl = forkData.html_url || `https://github.com/${forkData.full_name}`;

      const userId = state;
      if (!userId || userId === 'anonymous') {
        setStatus('error');
        setMessage('Invalid user state');
        return;
      }

      setMessage('Saving configuration...');
      
      const infraRef = doc(db, 'infra_configs', userId);
      const infraSnap = await getDoc(infraRef);

      if (infraSnap.exists()) {
        await updateDoc(infraRef, {
          github_repo_url: forkUrl,
          github_forked_at: new Date().toISOString(),
        });
        setStatus('success');
        setMessage('Successfully forked SecureAgentBase!');
        setTimeout(() => navigate('/infra-setup'), 3000);
      } else {
        localStorage.setItem('github_fork_pending', JSON.stringify({
          repo_url: forkUrl,
          timestamp: Date.now(),
        }));
        setStatus('success');
        setMessage('Successfully forked! Save your config to continue.');
        setTimeout(() => navigate('/infra-setup'), 3000);
      }
    } catch (err) {
      console.error('Error forking repo:', err);
      setStatus('error');
      setMessage(err.message || 'Failed to fork repository');
    }
  };

  const handleAppInstall = async (installationId, state) => {
    try {
      if (!state || state === 'anonymous') {
        setStatus('error');
        setMessage('Missing user state');
        return;
      }

      const infraRef = doc(db, 'infra_configs', state);
      const infraSnap = await getDoc(infraRef);

      if (infraSnap.exists()) {
        await updateDoc(infraRef, {
          github_app_installed: true,
          github_installation_id: installationId,
          github_installed_at: new Date().toISOString(),
        });
        setStatus('success');
        setMessage('GitHub App installed successfully!');
        setTimeout(() => navigate('/infra-setup'), 2000);
      } else {
        setStatus('error');
        setMessage('No infrastructure configuration found. Please set up your project first.');
      }
    } catch (err) {
      console.error('Error updating GitHub App status:', err);
      setStatus('error');
      setMessage(err.message);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 mt-20">
      <div className="bg-white rounded-lg shadow p-8 text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="mx-auto text-blue-600 animate-spin mb-4" size={48} />
            <h2 className="text-xl font-semibold mb-2">Processing...</h2>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <Check className="mx-auto text-green-600 mb-4" size={48} />
            <h2 className="text-xl font-semibold mb-2">Success!</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <button
              onClick={() => navigate('/infra-setup')}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Go to Infrastructure Setup
            </button>
          </>
        )}

        {status === 'cancelled' && (
          <>
            <AlertCircle className="mx-auto text-yellow-600 mb-4" size={48} />
            <h2 className="text-xl font-semibold mb-2">Cancelled</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <button
              onClick={() => navigate('/infra-setup')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Try Again
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="mx-auto text-red-600 mb-4" size={48} />
            <h2 className="text-xl font-semibold mb-2">Error</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <button
              onClick={() => navigate('/infra-setup')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Back to Infrastructure Setup
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default GitHubCallback;
