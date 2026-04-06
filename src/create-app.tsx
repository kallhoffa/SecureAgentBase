import { useState, useEffect, Fragment } from 'react';
import { useAuth } from './firestore-utils/auth-context';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc, Firestore } from 'firebase/firestore';
import { 
  Check, AlertTriangle, Loader2, Github, Server, 
  MessageSquare, ArrowRight, ExternalLink, Play 
} from 'lucide-react';

interface CreateAppProps {
  db: Firestore;
}

const APPS_COLLECTION = 'user_apps';

const STEPS = [
  { id: 1, title: 'App Details', icon: '1' },
  { id: 2, title: 'GitHub Setup', icon: '2' },
  { id: 3, title: 'Cloud Provision', icon: '3' },
  { id: 4, title: 'Discord Config', icon: '4' },
];

const CreateApp: React.FC<CreateAppProps> = ({ db }) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [appName, setAppName] = useState('');
  const [appDescription, setAppDescription] = useState('');
  const [githubConnected, setGithubConnected] = useState(false);
  const [gcpConnected, setGcpConnected] = useState(false);
  const [gcpProjectId, setGcpProjectId] = useState('');
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [discordChannelId, setDiscordChannelId] = useState('');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadInfraConfig = async (): Promise<void> => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const infraRef = doc(db, 'infra_configs', user.uid);
        const infraSnap = await getDoc(infraRef);
        
        if (infraSnap.exists()) {
          const data = infraSnap.data();
          setGithubConnected(data.github_app_installed || false);
          setGcpConnected(!!data.service_account_configured);
          setGcpProjectId(data.gcp_project_id || '');
        }
      } catch (err) {
        console.error('Error loading infra config:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadInfraConfig();
  }, [db, user]);

  const validateAppName = (name: string): boolean => {
    const regex = /^[a-z0-9-]+$/;
    return regex.test(name) && name.length >= 3 && name.length <= 50;
  };

  const createGitHubRepo = async (githubToken: string): Promise<{ full_name: string; html_url: string }> => {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        name: appName,
        description: appDescription || `Created with SecureAgentBase`,
        private: false,
        auto_init: true,
        license_template: 'apache-2.0',
      }),
    });

    if (!response.ok) {
      const err = await response.json() as { message?: string };
      throw new Error(err.message || 'Failed to create repository');
    }

    return response.json();
  };

  const createVM = async (repoFullName: string): Promise<{ name: string; ip: string }> => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const infraRef = doc(db, 'infra_configs', user.uid);
    const infraSnap = await getDoc(infraRef);
    
    if (!infraSnap.exists()) {
      throw new Error('GCP not configured. Please set up infrastructure first.');
    }

    const infraData = infraSnap.data();
    const gcpAccessToken = infraData.gcp_access_token as string | undefined;
    const serviceAccountKey = infraData.service_account_key as string | undefined;

    if (!gcpAccessToken && !serviceAccountKey) {
      throw new Error('GCP not configured. Please connect your Google account or upload a service account key.');
    }

    const zone = 'us-central1-a';
    const instanceName = `kimaki-${appName}`;
    const startupScript = `#!/bin/bash
apt-get update
apt-get install -y --fix-missing nodejs npm git curl

cd /opt
git clone https://github.com/argbase/kimaki.git
cd kimaki
npm install

cat > .env << 'ENVEOF'
PROJECT_ID=${gcpProjectId}
DISCORD_WEBHOOK=${discordWebhook || ''}
USER_ID=${user.uid}
APP_NAME=${appName}
GITHUB_REPO=${repoFullName}
FIREBASE_API_KEY=${import.meta.env.VITE_FIREBASE_API_KEY}
FIREBASE_PROJECT_ID=${import.meta.env.VITE_FIREBASE_PROJECT_ID}
ENVEOF
npm start
`;

    let response: Response;
    
    if (gcpAccessToken) {
      response = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${gcpProjectId}/zones/${zone}/instances`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${gcpAccessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: instanceName,
            machineType: `zones/${zone}/machineTypes/e2-micro`,
            disks: [{
              boot: true,
              autoDelete: true,
              initializeParams: {
                diskSizeGb: '10',
                sourceImage: 'projects/debian-cloud/global/images/family/debian-11',
              },
            }],
            networkInterfaces: [{
              network: 'global/networks/default',
              accessConfigs: [{
                type: 'ONE_TO_ONE_NAT',
              }],
            }],
            metadata: {
              items: [{
                key: 'startup-script',
                value: startupScript
              }]
            }
          })
        }
      );
    } else if (serviceAccountKey) {
      response = await fetch('/api/provision-vm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: gcpProjectId,
          zone,
          instanceName,
          serviceAccountKey,
          discordWebhook,
        }),
      });
    } else {
      throw new Error('GCP not configured');
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } })) as { error?: { message?: string }; message?: string };
      throw new Error(err.error?.message || err.message || `Failed to create VM (${response.status})`);
    }

    const result = await response.json() as { networkInterfaces?: Array<{ accessConfigs?: Array<{ natIP?: string }> }>; selfLink?: string; ip?: string; error?: { message?: string } };
    
    if (result.error) {
      throw new Error(result.error.message || 'Failed to create VM');
    }

    let ip = '';
    if (result.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP) {
      ip = result.networkInterfaces[0].accessConfigs[0].natIP || '';
    } else if (result.selfLink) {
      const instanceRes = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${gcpProjectId}/zones/${zone}/instances/${instanceName}`,
        {
          headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
        }
      );
      const instanceData = await instanceRes.json() as { networkInterfaces?: Array<{ accessConfigs?: Array<{ natIP?: string }> }> };
      ip = instanceData.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP || '';
    }

    return { name: instanceName, ip: ip || result.ip || '' };
  };

  const handleCreateApp = async (): Promise<void> => {
    if (!user) return;
    
    if (!validateAppName(appName)) {
      setError('App name must be lowercase, 3-50 characters, with dashes only');
      return;
    }

    if (!githubConnected || !gcpConnected) {
      setError('Please complete GitHub and GCP setup first');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const repo = await createGitHubRepo('');
      
      const appData = {
        user_id: user.uid,
        app_name: appName,
        app_description: appDescription,
        github_repo: repo.full_name,
        github_repo_url: repo.html_url,
        gcp_project_id: gcpProjectId,
        discord_webhook: discordWebhook,
        discord_channel_id: discordChannelId,
        status: 'provisioning',
        created_at: new Date().toISOString(),
      };

      const appRef = doc(db, APPS_COLLECTION, `${user.uid}_${appName}`);
      await setDoc(appRef, appData);

      try {
        const vmResult = await createVM(repo.full_name);
        await updateDoc(appRef, {
          vm_ip: vmResult.ip,
          vm_name: vmResult.name,
          status: 'ready',
        });
      } catch (vmErr) {
        console.error('VM creation failed:', vmErr);
        await updateDoc(appRef, {
          status: 'provisioning_failed',
          error: vmErr instanceof Error ? vmErr.message : 'Unknown error',
        });
      }

      setCurrentStep(5);
    } catch (err) {
      console.error('Error creating app:', err);
      setError(err instanceof Error ? err.message : 'Failed to create app');
    }

    setCreating(false);
  };

  const canProceed = (step: number): boolean => {
    switch (step) {
      case 1:
        return validateAppName(appName);
      case 2:
        return githubConnected;
      case 3:
        return gcpConnected;
      case 4:
        return true;
      default:
        return false;
    }
  };

  if (authLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={48} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Create New App</h1>
          <p className="text-gray-600">Build a full-stack app entirely from Discord</p>
        </div>
        <button
          onClick={() => navigate('/profile')}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Back to Profile
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
          <AlertTriangle className="text-red-500" size={20} />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <div className="flex items-center justify-center mb-8">
        {STEPS.map((step, index) => (
          <Fragment key={step.id}>
            <div className="flex items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                currentStep > step.id 
                  ? 'bg-green-600 text-white' 
                  : currentStep === step.id 
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}>
                {currentStep > step.id ? <Check size={20} /> : step.icon}
              </div>
              <span className={`ml-2 font-medium ${
                currentStep === step.id ? 'text-blue-600' : 'text-gray-500'
              }`}>
                {step.title}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={`w-16 h-1 mx-4 ${
                currentStep > step.id ? 'bg-green-600' : 'bg-gray-200'
              }`} />
            )}
          </Fragment>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        {currentStep === 1 && (
          <div>
            <h2 className="text-xl font-semibold mb-4">App Details</h2>
            <p className="text-gray-600 mb-6">
              Give your app a unique name. This will be used for your GitHub repo and VM instance.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                App Name (lowercase, dashes only)
              </label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-awesome-app"
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
              {appName && !validateAppName(appName) && (
                <p className="text-red-500 text-sm mt-1">
                  Must be 3-50 characters, lowercase letters, numbers, and dashes only
                </p>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (optional)
              </label>
              <input
                type="text"
                value={appDescription}
                onChange={(e) => setAppDescription(e.target.value)}
                placeholder="A brief description of your app"
                className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Github className="text-gray-700" size={24} />
              GitHub Setup
            </h2>
            <p className="text-gray-600 mb-6">
              We&apos;ll create a public GitHub repository with Apache 2.0 license for your app&apos;s code.
            </p>
            
            {githubConnected ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
                <Check className="text-green-600" size={20} />
                <span className="text-green-700 font-medium">GitHub App installed</span>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-6 text-center">
                <p className="text-gray-600 mb-4">
                  Connect your GitHub account and install the SecureAgentBase App
                </p>
                <button
                  onClick={() => navigate('/infra-setup')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 mx-auto"
                >
                  <ExternalLink size={18} />
                  Go to Infrastructure Setup
                </button>
              </div>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Server className="text-gray-700" size={24} />
              Cloud Provisioning
            </h2>
            <p className="text-gray-600 mb-6">
              We&apos;ll provision a free e2-micro VM on GCP to run the Discord listener.
            </p>
            
            {gcpConnected ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2">
                  <Check className="text-green-600" size={20} />
                  <span className="text-green-700 font-medium">GCP configured: {gcpProjectId}</span>
                </div>
                <p className="text-gray-600 text-sm">
                  A VM instance will be created automatically when you complete the setup.
                </p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg p-6 text-center">
                <p className="text-gray-600 mb-4">
                  Configure your GCP project first
                </p>
                <button
                  onClick={() => navigate('/infra-setup')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 mx-auto"
                >
                  <ExternalLink size={18} />
                  Go to Infrastructure Setup
                </button>
              </div>
            )}
          </div>
        )}

        {currentStep === 4 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="text-gray-700" size={24} />
              Discord Configuration
            </h2>
            <p className="text-gray-600 mb-6">
              Configure how you&apos;ll interact with your app via Discord.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discord Webhook URL (optional)
                </label>
                <input
                  type="text"
                  value={discordWebhook}
                  onChange={(e) => setDiscordWebhook(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
                <p className="text-gray-500 text-sm mt-1">
                  Create a webhook in your Discord channel settings
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Channel Name / ID (optional)
                </label>
                <input
                  type="text"
                  value={discordChannelId}
                  onChange={(e) => setDiscordChannelId(e.target.value)}
                  placeholder="e.g., app-commands"
                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
          </div>
        )}

        {currentStep === 5 && user && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="text-green-600" size={32} />
            </div>
            <h2 className="text-2xl font-bold mb-2">App Created!</h2>
            <p className="text-gray-600 mb-6">
              Your app &quot;{appName}&quot; has been created successfully.
            </p>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-semibold mb-2">Next Steps:</h3>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• GitHub Repo: <a href={`https://github.com/${user.uid}/${appName}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{user.uid}/{appName}</a></li>
                <li>• VM: Provisioning in progress...</li>
                <li>• Configure Discord bot for your channel</li>
              </ul>
            </div>
            
            <button
              onClick={() => navigate('/profile')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700"
            >
              Back to Profile
            </button>
          </div>
        )}

        {currentStep < 5 && (
          <div className="flex items-center justify-between mt-8 pt-4 border-t">
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              disabled={currentStep === 1}
              className="text-gray-600 hover:text-gray-700 font-medium disabled:opacity-50"
            >
              Back
            </button>
            
            {currentStep < 4 ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={!canProceed(currentStep)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
              >
                Continue
                <ArrowRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleCreateApp}
                disabled={creating || !validateAppName(appName)}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Creating...
                  </>
                ) : (
                  <>
                    <Play size={18} />
                    Create App
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateApp;
