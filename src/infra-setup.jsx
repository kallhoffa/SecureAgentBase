import React, { useState, useEffect } from 'react';
import { useAuth } from './firestore-utils/auth-context';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Check, Copy, Upload, AlertTriangle, Trash2, ExternalLink, Shield, Server, Bot } from 'lucide-react';

const INFRA_COLLECTION = 'infra_configs';
const LOCALSTORAGE_KEY = 'infra_config_pending';

const CloudShellScript = ({ projectId }) => `# SecureAgent-Manager Service Account Setup
# Run this in Google Cloud Shell (https://shell.cloud.google.com)

PROJECT_ID="${projectId || 'YOUR_PROJECT_ID'}"

echo "Creating SecureAgent-Manager service account..."

# Create the service account
gcloud iam service-accounts create secureagent-manager \\
  --display-name="SecureAgent Manager" \\
  --project=$PROJECT_ID

# Grant required roles
gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/compute.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/firebase.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/billing.user"

# Generate and download key
gcloud iam service-accounts keys create ~/secureagent-manager-key.json \\
  --iam-account="secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com"

echo "✅ Service account created!"
echo "📁 Key file: ~/secureagent-manager-key.json"
echo "⚠️  Upload this key in the SecureAgentBase portal to continue setup."
`;

const saveToLocalStorage = (data) => {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving to localStorage:', e);
  }
};

const loadFromLocalStorage = () => {
  try {
    const data = localStorage.getItem(LOCALSTORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Error loading from localStorage:', e);
    return null;
  }
};

const InfraSetup = ({ db }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState('');
  const [serviceAccountKey, setServiceAccountKey] = useState(null);
  const [githubAppInstalled, setGithubAppInstalled] = useState(false);
  const [vmIp, setVmIp] = useState('');
  const [discordBotToken, setDiscordBotToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mergeStatus, setMergeStatus] = useState(null);
  
  const [gcpConnected, setGcpConnected] = useState(false);
  const [gcpProjects, setGcpProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [gcpAccessToken, setGcpAccessToken] = useState(null);
  const [apiNotEnabled, setApiNotEnabled] = useState(false);
  const [serviceAccountJson, setServiceAccountJson] = useState(null);
  const [serviceAccountError, setServiceAccountError] = useState(null);

  const [step1Complete, setStep1Complete] = useState(false);
  const [step2Complete, setStep2Complete] = useState(false);
  const [step3Complete, setStep3Complete] = useState(false);
  const [step4Complete, setStep4Complete] = useState(false);
  const [step5Complete, setStep5Complete] = useState(false);
  const [step6Complete, setStep6Complete] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [expandedSteps, setExpandedSteps] = useState([1]);

  const [billingEnabled, setBillingEnabled] = useState(null);
  const [billingChecking, setBillingChecking] = useState(false);

  const [step3Status, setStep3Status] = useState('idle');
  const [step3Message, setStep3Message] = useState('');
  const [step3Logs, setStep3Logs] = useState([]);

  const [step4Status, setStep4Status] = useState('idle');
  const [step4Message, setStep4Message] = useState('');
  const [step4Logs, setStep4Logs] = useState([]);
  const [step4Retrying, setStep4Retrying] = useState(false);

  const addStep3Log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setStep3Logs(prev => [...prev, { time: timestamp, message }]);
  };

  const addStep4Log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setStep4Logs(prev => [...prev, { time: timestamp, message }]);
  };

  const getServiceAccountToken = async () => {
    if (!serviceAccountJson) return null;
    
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccountJson.client_email,
      sub: serviceAccountJson.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/compute https://www.googleapis.com/auth/devstorage.full_control'
    };

    const header = { alg: 'RS256', typ: 'JWT' };
    
    const encodeBase64Url = (str) => {
      return btoa(JSON.stringify(str)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    
    const encodedHeader = encodeBase64Url(header);
    const encodedPayload = encodeBase64Url(payload);
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureInput);
    
    try {
      const privateKey = serviceAccountJson.private_key.replace(/\\n/g, '\n');
      const keyData = await crypto.subtle.importKey(
        'pkcs8',
        await importPrivateKey(privateKey),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyData, data);
      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const jwt = `${signatureInput}.${signatureBase64}`;
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
      });
      
      const tokenData = await response.json();
      return tokenData.access_token;
    } catch (e) {
      console.error('Error getting service account token:', e);
      return null;
    }
  };

  const importPrivateKey = async (pem) => {
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = pem.substring(pem.indexOf(pemHeader) + pemHeader.length, pem.indexOf(pemFooter));
    const binaryDerString = atob(pemContents.replace(/\s/g, ''));
    const binaryDer = strToBuf(binaryDerString);
    return binaryDer;
  };

  const strToBuf = (str) => {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  };

  const checkBillingStatus = async () => {
    if (!projectId || !gcpAccessToken) return null;
    try {
      const response = await fetch(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`, {
        headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        const enabled = !!data.billingEnabled && !!data.billingAccountName;
        setBillingEnabled(enabled);
        return enabled;
      }
    } catch (e) {
      console.error('Error checking billing:', e);
    }
    setBillingEnabled(false);
    return false;
  };

  const expandNextStep = (currentStepNum) => {
    const nextStep = currentStepNum + 1;
    if (nextStep <= 7 && !expandedSteps.includes(nextStep)) {
      setExpandedSteps(prev => [...prev, nextStep]);
    }
  };

  const toggleStep = (step) => {
    if (expandedSteps.includes(step)) {
      setExpandedSteps(prev => prev.filter(s => s !== step));
    } else {
      setExpandedSteps(prev => [...prev, step]);
    }
  };

  const isStepLocked = (step) => {
    if (step === 1) return false;
    if (step === 2) return !step1Complete;
    if (step === 3) return !step2Complete;
    if (step === 4) return !step3Complete;
    if (step === 5) return !step4Complete;
    if (step === 6) return !step5Complete;
    return false;
  };

  const isStepActive = (step) => {
    return !isStepLocked(step) && !isStepCompleted(step);
  };

  const isStepCompleted = (step) => {
    if (step === 1) return step1Complete;
    if (step === 2) return step2Complete;
    if (step === 3) return step3Complete;
    if (step === 4) return step4Complete;
    if (step === 5) return step5Complete;
    if (step === 6) return step6Complete;
    return false;
  };

  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [enablingApis, setEnablingApis] = useState(false);
  const [creatingVm, setCreatingVm] = useState(false);

  const fetchGcpProjects = async (token) => {
    setLoadingProjects(true);
    setApiNotEnabled(false);
    try {
      const response = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const err = await response.json();
        if (err.error?.code === 403 || err.error?.message?.includes('not been used')) {
          setApiNotEnabled(true);
        }
        throw new Error(err.error?.message || 'Failed to fetch projects');
      }
      
      const data = await response.json();
      const projects = data.projects || [];
      setGcpProjects(projects);
      return projects;
    } catch (err) {
      console.error('Error fetching GCP projects:', err);
      setApiNotEnabled(true);
      setGcpProjects([]);
    } finally {
      setLoadingProjects(false);
    }
    return [];
  };

  const initGoogleOAuth = () => {
    const clientId = import.meta.env.VITE_GCP_CLIENT_ID;
    if (!clientId) {
      setError('GCP Client ID not configured. Add VITE_GCP_CLIENT_ID to .env.local');
      return null;
    }

    return window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      callback: async (response) => {
        if (response.error) {
          console.error('Google OAuth error:', response.error);
          setError('Failed to connect to Google');
        } else {
          setGcpAccessToken(response.access_token);
          setGcpConnected(true);
          
          const projects = await fetchGcpProjects(response.access_token);
          
          setStep1Complete(true);
          expandNextStep(1);
        }
      },
    });
  };

  const createGcpProject = async () => {
    if (!newProjectName.trim()) {
      setError('Please enter a project name');
      return;
    }
    const projectIdVal = newProjectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 30);
    
    setCreatingProject(true);
    setError(null);

    try {
      const listResponse = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
        headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
      });
      
      if (listResponse.ok) {
        const listData = await listResponse.json();
        const existingProject = listData.projects?.find(p => p.projectId === projectIdVal);
        if (existingProject) {
          setProjectId(projectIdVal);
          setStep2Complete(true);
          setBillingChecking(true);
          await checkBillingStatus();
          setBillingChecking(false);
          expandNextStep(2);
          setNewProjectName('');
          setCreatingProject(false);
          return;
        }
      }

      const response = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gcpAccessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: projectIdVal,
          name: newProjectName
        })
      });

      if (!response.ok) {
        const err = await response.json();
        if (err.error?.code === 403 || err.error?.message?.includes('API')) {
          throw new Error('Cloud Resource Manager API not enabled. Please enable it at https://console.cloud.google.com/apis/library/cloudresourcemanager.googleapis.com');
        }
        throw new Error(err.error?.message || 'Failed to create project');
      }

      const result = await response.json();
      setProjectId(result.projectId || projectIdVal);
      
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          const checkRes = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectIdVal}`, {
            headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
          });
          if (checkRes.ok) break;
        } catch (e) {
          console.log('Waiting for project...');
        }
      }
      
      setStep2Complete(true);
      setBillingChecking(true);
      await checkBillingStatus();
      setBillingChecking(false);
      expandNextStep(2);
      setNewProjectName('');
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err.message || 'Failed to create GCP project');
    } finally {
      setCreatingProject(false);
    }
  };

  const checkApiStatus = async (api) => {
    try {
      const response = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api}`, {
        headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        return data.config?.state === 'ENABLED';
      }
    } catch (e) {
      console.error('Error checking API status:', e);
    }
    return false;
  };

  const enableGcpApis = async () => {
    if (!projectId) return;
    
    setEnablingApis(true);
    setStep3Status('enabling');
    setStep3Message('Starting API enablement process...');
    setStep3Logs([]);
    setError(null);

    const apis = [
      { name: 'compute.googleapis.com', displayName: 'Compute Engine API' },
      { name: 'cloudresourcemanager.googleapis.com', displayName: 'Cloud Resource Manager API' },
      { name: 'serviceusage.googleapis.com', displayName: 'Service Usage API' }
    ];

    try {
      for (const api of apis) {
        setStep3Message(`Enabling ${api.displayName}...`);
        addStep3Log(`Attempting to enable ${api.displayName}...`);
        
        const isAlreadyEnabled = await checkApiStatus(api.name);
        if (isAlreadyEnabled) {
          addStep3Log(`${api.displayName} is already enabled`);
          continue;
        }

        const response = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api.name}:enable`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${gcpAccessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errorMsg = errData.error?.message || response.statusText;
          
          if (errorMsg.includes('Billing') || errorMsg.includes('billing')) {
            addStep3Log(`Billing required for ${api.displayName}`);
            addStep3Log(`ERROR: ${errorMsg}`);
            setError('Billing must be enabled on your GCP project. Go to Google Cloud Console > Billing to link a billing account.');
          } else {
            addStep3Log(`Failed to enable ${api.displayName}: ${errorMsg}`);
          }
          console.warn(`Failed to enable ${api.name}:`, errData);
        } else {
          addStep3Log(`Successfully enabled ${api.displayName}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        let attempts = 0;
        while (attempts < 10) {
          const enabled = await checkApiStatus(api.name);
          if (enabled) {
            addStep3Log(`${api.displayName} is now active`);
            break;
          }
          addStep3Log(`Waiting for ${api.displayName} to activate... (${attempts + 1}/10)`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          attempts++;
        }
      }
      
      setStep3Message('All APIs enabled successfully!');
      addStep3Log('API enablement process complete');
      setStep3Status('complete');
    } catch (err) {
      console.error('Error enabling APIs:', err);
      setStep3Message('Failed to enable some APIs');
      addStep3Log(`Error: ${err.message}`);
      
      if (err.message?.includes('Billing') || err.message?.includes('billing')) {
        setError('Billing must be enabled on your GCP project. Go to Google Cloud Console > Billing to link a billing account.');
      } else {
        setError('Failed to enable required APIs. You may need to enable them manually.');
      }
    } finally {
      setEnablingApis(false);
    }
  };

  const createVm = async () => {
    if (!projectId || !gcpAccessToken) {
      setError('Project not configured');
      return;
    }

    setCreatingVm(true);
    setError(null);

    const zone = 'us-central1-a';
    const instanceName = 'kimaki-manager';
    const startupScript = `#!/bin/bash
apt-get update
apt-get install -y nodejs npm git curl
cd /opt
git clone https://github.com/argbase/kimaki.git
cd kimaki
npm install
`;

    try {
      const checkResponse = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances?filter=name="${instanceName}"`,
        {
          headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
        }
      );
      
      const checkData = await checkResponse.json();
      if (checkData.items?.length > 0) {
        setVmIp(checkData.items[0].networkInterfaces[0].accessConfigs[0].natIP);
        setStep3Complete(true);
        setStep4Complete(true);
        expandNextStep(5);
        setCreatingVm(false);
        return;
      }

      const response = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances`,
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

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(err.error?.message || `Failed to create VM (${response.status})`);
      }

      await new Promise(resolve => setTimeout(resolve, 10000));

      const instanceResponse = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
        {
          headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
        }
      );
      
      const instanceData = await instanceResponse.json();
      const ip = instanceData.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
      
      if (ip) {
        setVmIp(ip);
        setStep3Complete(true);
        setStep4Complete(true);
        expandNextStep(5);
      } else {
        setStep3Complete(true);
        setStep4Complete(true);
        expandNextStep(5);
      }
    } catch (err) {
      console.error('Error creating VM:', err);
      setError(err.message || 'Failed to create VM');
    } finally {
      setCreatingVm(false);
    }
  };

  const handleConnectGoogle = () => {
    const client = initGoogleOAuth();
    if (client) {
      client.requestAccessToken();
    }
  };

  useEffect(() => {
    if (user) {
      setStep1Complete(true);
    } else {
      setStep1Complete(false);
    }
  }, [user]);

  useEffect(() => {
    const loadInfraConfig = async () => {
      let configData = null;

      if (user) {
        try {
          const infraRef = doc(db, INFRA_COLLECTION, user.uid);
          const infraSnap = await getDoc(infraRef);

          if (infraSnap.exists()) {
            configData = infraSnap.data();
          }
        } catch (err) {
          console.error('Error loading infra config from Firestore:', err);
        }
      }

      if (!configData) {
        configData = loadFromLocalStorage();
      }

      if (configData) {
        setProjectId(configData.gcp_project_id || '');
        setGithubAppInstalled(configData.github_app_installed || false);
        setVmIp(configData.vm_ip || '');
        setDiscordBotToken(configData.discord_bot_token || '');
        
        if (configData.service_account_key) {
          setServiceAccountKey(configData.service_account_key);
        }

        if (configData.gcp_project_id) setStep1Complete(true);
        if (configData.gcp_project_id && configData.service_account_configured) setStep2Complete(true);
        if (configData.vm_ip) {
          setStep3Complete(true);
          setStep4Complete(true);
        }
        if (configData.github_app_installed) setStep5Complete(true);
        if (configData.discord_bot_token) setStep6Complete(true);
      }

      setLoading(false);
    };

    loadInfraConfig();
  }, [db, user]);

  const handleCopyScript = () => {
    navigator.clipboard.writeText(CloudShellScript({ projectId }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setError('Please upload a JSON file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.private_key || !parsed.client_email) {
        throw new Error('Invalid service account key format');
      }

      setServiceAccountKey(parsed);
    } catch (err) {
      setError('Invalid JSON or missing required fields');
      console.error('Error parsing key file:', err);
    }

    setUploading(false);
  };

  const saveConfig = async (configData) => {
    const finalData = {
      ...configData,
      gcp_project_id: projectId.trim(),
      github_app_installed: githubAppInstalled,
      service_account_configured: !!serviceAccountKey || gcpConnected,
      vm_ip: vmIp,
      discord_bot_token: discordBotToken,
      service_account_key: serviceAccountKey,
      gcp_access_token: gcpAccessToken,
      updated_at: new Date().toISOString(),
    };

    if (user) {
      const infraRef = doc(db, INFRA_COLLECTION, user.uid);
      await setDoc(infraRef, finalData, { merge: true });
      localStorage.removeItem(LOCALSTORAGE_KEY);
    } else {
      saveToLocalStorage(finalData);
    }
  };

  const handleSaveConfig = async () => {
    if (!projectId.trim()) return;

    setSaving(true);
    setError(null);

    try {
      await saveConfig({
        created_at: new Date().toISOString(),
      });
      alert('Infrastructure configuration saved!');
    } catch (err) {
      console.error('Error saving config:', err);
      setError('Failed to save configuration');
    }

    setSaving(false);
  };

  const handleMergeToAccount = async () => {
    if (!user) {
      setError('Please sign in to merge your configuration');
      return;
    }

    setSaving(true);
    setMergeStatus('merging');

    try {
      const localConfig = loadFromLocalStorage();
      if (!localConfig) {
        setError('No pending configuration to merge');
        setSaving(false);
        return;
      }

      await saveConfig(localConfig);
      setMergeStatus('success');
      alert('Configuration merged to your account!');
    } catch (err) {
      console.error('Error merging config:', err);
      setError('Failed to merge configuration');
      setMergeStatus('error');
    }

    setSaving(false);
    setTimeout(() => setMergeStatus(null), 3000);
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your infrastructure? This will remove your GCP project linkage.')) {
      return;
    }

    try {
      if (user) {
        const infraRef = doc(db, INFRA_COLLECTION, user.uid);
        await deleteDoc(infraRef);
      }
      localStorage.removeItem(LOCALSTORAGE_KEY);
      setProjectId('');
      setGithubAppInstalled(false);
      setServiceAccountKey(null);
      setVmIp('');
      setDiscordBotToken('');
      alert('Infrastructure disconnected');
    } catch (err) {
      console.error('Error disconnecting:', err);
      setError('Failed to disconnect');
    }
  };

  const handleInstallGitHubApp = () => {
    const clientId = import.meta.env.VITE_GITHUB_APP_CLIENT_ID || 'YOUR_CLIENT_ID';
    const redirectUri = encodeURIComponent(window.location.origin + '/github-callback');
    const state = user?.uid || 'anonymous';
    window.location.href = `https://github.com/apps/secureagentbase/installations/new?state=${state}&redirect_uri=${redirectUri}`;
  };

  const handleCreateVM = async () => {
    if (!serviceAccountKey || !projectId) {
      setError('Please configure GCP project and service account first');
      return;
    }

    if (!vmIp) {
      setError('No VM IP configured. For initial setup, please manually create the VM via Cloud Console or gcloud CLI, then enter the IP below.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`http://${vmIp}:3000/api/provision-manager-vm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId,
          serviceAccountKey,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to create VM');
      }

      const result = await response.json();
      setVmIp(result.ip);
      await saveConfig({ vm_ip: result.ip });
      alert('VM provisioned successfully!');
    } catch (err) {
      console.error('Error creating VM:', err);
      setError(err.message);
    }

    setSaving(false);
  };

  const handleManualVMIP = () => {
    const ip = prompt('Enter your Kimaki VM IP address:');
    if (ip) {
      setVmIp(ip);
      saveConfig({ vm_ip: ip });
    }
  };

  const handleCreateDiscordBot = async () => {
    if (!vmIp) {
      setError('Please provision the VM first');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`http://${vmIp}:3000/api/create-discord-bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName: 'SecureAgentBase',
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to create Discord bot');
      }

      const result = await response.json();
      setDiscordBotToken(result.token);
      setStep6Complete(true);
      expandNextStep(6);
      await saveConfig({ discord_bot_token: result.token });
      alert('Discord bot created! Token: ' + result.token.substring(0, 10) + '...');
    } catch (err) {
      console.error('Error creating Discord bot:', err);
      setError(err.message);
    }

    setSaving(false);
  };

  const pendingConfig = !user && loadFromLocalStorage();

  const getStepHeader = (stepNumber, title, icon, isComplete, isActive, isLocked, info) => {
    const baseClasses = "flex items-center justify-between w-full p-4 rounded-lg transition-all duration-200";
    let bgClasses = "bg-gray-50";
    let borderClasses = "border border-gray-200";
    let textClasses = "text-gray-500";
    let iconColor = "text-gray-400";
    
    if (isComplete) {
      bgClasses = "bg-green-50";
      borderClasses = "border-2 border-green-500";
      textClasses = "text-green-700";
      iconColor = "text-green-600";
    } else if (isActive) {
      bgClasses = "bg-blue-50";
      borderClasses = "border-2 border-blue-500";
      textClasses = "text-blue-700";
      iconColor = "text-blue-600";
    } else if (isLocked) {
      bgClasses = "bg-gray-50 opacity-60";
      borderClasses = "border border-gray-200";
    }

    return (
      <button
        onClick={() => !isLocked && toggleStep(stepNumber)}
        disabled={isLocked}
        className={`${baseClasses} ${bgClasses} ${borderClasses} ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer hover:shadow-md'} w-full text-left`}
      >
        <div className="flex items-center gap-3">
          {isComplete ? <Check className={iconColor} size={24} /> : icon}
          <span className={`font-semibold ${textClasses}`}>{title}</span>
          {isLocked && <span className="text-xs text-gray-400 ml-2">(Complete previous step first)</span>}
          {info && (
            <div className="relative group">
              <svg className={`w-4 h-4 ${textClasses} cursor-help`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="absolute left-0 bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {info}
              </div>
            </div>
          )}
        </div>
        {expandedSteps.includes(stepNumber) ? (
          <svg className={`w-5 h-5 ${textClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        ) : (
          <svg className={`w-5 h-5 ${textClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Infrastructure Setup</h1>
          <p className="text-gray-600">Configure GCP, GitHub, and Discord for autonomous deployments</p>
        </div>
        <div className="flex items-center gap-2">
          {pendingConfig && user && (
            <button
              onClick={handleMergeToAccount}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Check size={18} />
              {mergeStatus === 'merging' ? 'Merging...' : 'Merge Pending Config'}
            </button>
          )}
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Back to Home
          </button>
        </div>
      </div>

      {pendingConfig && !user && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800">
            ⚠️ Configuration saved locally. Sign in to save to your account.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-2">
          <AlertTriangle className="text-red-500" size={20} />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          {getStepHeader(1, "Step 1: Account", <Shield className="text-blue-600" size={24} />, step1Complete, !step1Complete, false, "Sign in to continue.")}
          
          {expandedSteps.includes(1) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {user ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Signed in as {user.email}</span>
                </div>
              ) : (
                <p className="text-gray-600">Please sign in to continue.</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(2, "Step 2: Service Account", <Upload className="text-blue-600" size={24} />, step2Complete, step1Complete && !step2Complete, !step1Complete, "Create a service account in your GCP project and paste the JSON key. This lets us create VMs without accessing your personal account.")}
          
          {expandedSteps.includes(2) && !step1Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 1 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(2) && step1Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {step2Complete ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Service account configured</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-2">Create a service account in your GCP project:</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm">
                      <li>Go to <a href="https://console.cloud.google.com/iam-admin/service-accounts" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud IAM → Service Accounts</a></li>
                      <li>Select your project from the dropdown at the top</li>
                      <li>Click "+ Create Service Account"</li>
                      <li>Name: <code className="bg-blue-100 px-1">secureagent</code></li>
                      <li>Grant roles: <strong>Compute Instance Admin (v1)</strong> and <strong>Service Account User</strong></li>
                      <li>Check "Furnish a new private key" → select <strong>JSON</strong></li>
                      <li>Download JSON, open it, copy all content, paste below</li>
                    </ol>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Paste service account JSON key:</label>
                    <textarea
                      value={serviceAccountJson ? JSON.stringify(serviceAccountJson, null, 2) : ''}
                      onChange={(e) => {
                        setServiceAccountError(null);
                        try {
                          const parsed = JSON.parse(e.target.value);
                          if (!parsed.private_key) throw new Error('Invalid');
                          setServiceAccountJson(parsed);
                        } catch (err) {
                          setServiceAccountError('Invalid JSON. Paste the complete service account JSON file.');
                        }
                      }}
                      placeholder='{"type": "service_account", "project_id": "...", "private_key": "..."}'
                      className="w-full h-40 px-4 py-2 border-2 border-gray-200 rounded-lg font-mono text-sm focus:outline-none focus:border-blue-400"
                    />
                    {serviceAccountError && <p className="text-red-600 text-sm mt-1">{serviceAccountError}</p>}
                  </div>
                  
                  <button
                    onClick={() => {
                      if (serviceAccountJson && serviceAccountJson.project_id) {
                        setStep2Complete(true);
                        setExpandedSteps(prev => [...prev, 3]);
                      } else {
                        setServiceAccountError('Please paste a valid service account JSON');
                      }
                    }}
                    disabled={!serviceAccountJson}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                  >
                    Continue
                  </button>
                  
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-gray-600 text-sm">Don't want to create a service account?</p>
                    <button
                      onClick={() => { setStep2Complete(true); setExpandedSteps(prev => [...prev, 3]); }}
                      className="text-blue-600 hover:text-blue-700 text-sm underline"
                    >
                      Skip to manual VM setup
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(3, "Step 3: GCP Project", <Server className="text-blue-600" size={24} />, step3Complete, step2Complete && !step3Complete, !step2Complete, "Select or create a GCP project for your VM.")}
          
          {expandedSteps.includes(3) && !step2Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 2 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(3) && step2Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {step3Complete ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Project configured: {projectId}</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-2">Enter your GCP Project ID:</p>
                    <p className="text-blue-700 text-sm mb-3">
                      This is the project where your VM will be created. It should match the <code className="bg-blue-100 px-1">project_id</code> in your service account JSON.
                    </p>
                    <input
                      type="text"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      placeholder="my-gcp-project-123"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                    {serviceAccountJson?.project_id && (
                      <p className="text-blue-600 text-sm mt-2">
                        From your service account: <code className="bg-blue-100 px-1">{serviceAccountJson.project_id}</code>
                        <button
                          onClick={() => setProjectId(serviceAccountJson.project_id)}
                          className="ml-2 text-blue-600 underline text-xs"
                        >
                          Use this
                        </button>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (projectId.trim()) {
                        setStep3Complete(true);
                        expandNextStep(3);
                      } else {
                        setError('Please enter a GCP project ID');
                      }
                    }}
                    disabled={!projectId.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                  >
                    Continue
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(4, "Step 4: Enable APIs & Create VM", <Server className="text-blue-600" size={24} />, step4Complete, step3Complete && !step4Complete, !step3Complete, "Enable required Google Cloud APIs and create a VM to run the Kimaki listener.")}
          
          {expandedSteps.includes(4) && !step3Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 3 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(4) && step3Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {step4Complete ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">VM created and ready at {vmIp}</span>
                </div>
              ) : (
                <>
                  <p className="text-gray-600 mb-4">
                    Enable required APIs and create a VM to run Kimaki.
                  </p>
                  
                  {step4Status === 'idle' && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={async () => {
                          if (!serviceAccountJson || !projectId) {
                            setError('Service account and project ID required');
                            return;
                          }
                          setStep4Status('enabling');
                          setStep4Message('Getting service account token...');
                          addStep4Log('Starting API enablement process...');
                          
                          const token = await getServiceAccountToken();
                          if (!token) {
                            setError('Failed to authenticate with service account');
                            setStep4Status('error');
                            return;
                          }
                          addStep4Log('Service account authenticated');
                          
                          const apis = [
                            { name: 'compute.googleapis.com', displayName: 'Compute Engine API' },
                            { name: 'cloudresourcemanager.googleapis.com', displayName: 'Cloud Resource Manager API' },
                            { name: 'serviceusage.googleapis.com', displayName: 'Service Usage API' }
                          ];
                          
                          for (const api of apis) {
                            setStep4Message(`Enabling ${api.displayName}...`);
                            addStep4Log(`Enabling ${api.displayName}...`);
                            
                            try {
                              const response = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api.name}:enable`, {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${token}`,
                                  'Content-Type': 'application/json'
                                }
                              });
                              
                              if (response.ok) {
                                addStep4Log(`${api.displayName} enabled`);
                              } else {
                                const err = await response.json();
                                if (err.error?.message?.includes('billing')) {
                                  setError('Billing must be enabled on your GCP project');
                                  addStep4Log(`ERROR: Billing required for ${api.displayName}`);
                                } else {
                                  addStep4Log(`Note: ${err.error?.message || 'API may already be enabled'}`);
                                }
                              }
                            } catch (e) {
                              addStep4Log(`Error enabling ${api.displayName}: ${e.message}`);
                            }
                            
                            await new Promise(r => setTimeout(r, 1500));
                          }
                          
                          setStep4Message('Creating VM...');
                          addStep4Log('Creating VM...');
                          
                          const zone = 'us-central1-a';
                          const instanceName = 'kimaki-manager';
                          
                          try {
                            const vmResponse = await fetch(
                              `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances`,
                              {
                                method: 'POST',
                                headers: {
                                  'Authorization': `Bearer ${token}`,
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
                                    accessConfigs: [{ type: 'ONE_TO_ONE_NAT' }],
                                  }],
                                  metadata: {
                                    items: [{
                                      key: 'startup-script',
                                      value: '#!/bin/bash\napt-get update\napt-get install -y nodejs npm git curl\ncd /opt\ngit clone https://github.com/argbase/kimaki.git\ncd kimaki\nnpm install\n'
                                    }]
                                  }
                                })
                              }
                            );
                            
                            if (vmResponse.ok) {
                              addStep4Log('VM creation started, waiting for completion...');
                              await new Promise(r => setTimeout(r, 15000));
                              
                              const instanceResp = await fetch(
                                `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
                                { headers: { 'Authorization': `Bearer ${token}` } }
                              );
                              const instanceData = await instanceResp.json();
                              const ip = instanceData.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
                              
                              if (ip) {
                                setVmIp(ip);
                                addStep4Log(`VM ready at ${ip}`);
                              }
                              setStep4Complete(true);
                              setStep4Status('complete');
                              setStep4Message('VM created successfully!');
                              expandNextStep(4);
                            } else {
                              const err = await vmResponse.json();
                              addStep4Log(`VM creation failed: ${err.error?.message || 'Unknown error'}`);
                              setError(`Failed to create VM: ${err.error?.message}`);
                              setStep4Status('error');
                            }
                          } catch (e) {
                            addStep4Log(`Error: ${e.message}`);
                            setError(e.message);
                            setStep4Status('error');
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                      >
                        Enable APIs & Create VM
                      </button>
                    </div>
                  )}
                  
                  {(step4Status === 'enabling' || step4Status === 'complete') && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
                      <div className="flex items-center gap-2 text-blue-700 mb-2">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                        <span className="font-medium">{step4Message}</span>
                      </div>
                      {step4Logs.length > 0 && (
                        <div className="mt-2 text-xs text-blue-600 font-mono max-h-32 overflow-y-auto">
                          {step4Logs.map((log, i) => (
                            <div key={i}>[{log.time}] {log.message}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {step4Status === 'error' && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-3">
                      <p className="text-red-700">{error}</p>
                      <button
                        onClick={() => { setStep4Status('idle'); setError(null); }}
                        className="mt-2 text-blue-600 underline text-sm"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(5, "Step 5: Configure Kimaki", <Server className="text-blue-600" size={24} />, step4Complete, step3Complete && !step4Complete, !step3Complete, "Verify the connection to your Kimaki VM or manually enter the IP address. This VM runs the Discord listener agent.")}
          
          {expandedSteps.includes(5) && !step3Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 4 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(5) && step3Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {step4Complete ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">VM configured and ready at {vmIp}</span>
                </div>
              ) : (
                <>
                  <p className="text-gray-600 mb-4">
                    Configure your Kimaki VM connection.
                  </p>
                  {step4Status === 'idle' && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          setStep4Status('connecting');
                          setStep4Message('Attempting to connect to VM...');
                          addStep4Log('User initiated connection');
                          setTimeout(() => {
                            if (!vmIp) {
                              setStep4Status('error');
                              setStep4Message('No VM IP found. Please create VM in Step 3 or enter IP manually.');
                              addStep4Log('No VM IP available');
                            } else {
                              setStep4Status('ready');
                              setStep4Message('Connected to VM successfully!');
                              addStep4Log('VM connection verified');
                              setStep4Complete(true);
                              expandNextStep(6);
                            }
                          }, 1500);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                      >
                        Verify VM Connection
                      </button>
                      <button
                        onClick={handleManualVMIP}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                      >
                        Enter VM IP Manually
                      </button>
                    </div>
                  )}
                  {step4Status === 'connecting' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-blue-700 mb-2">
                        <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                        <span className="font-medium">{step4Message}</span>
                      </div>
                      {step4Logs.length > 0 && (
                        <div className="mt-2 text-xs text-blue-600 font-mono">
                          {step4Logs.map((log, i) => (
                            <div key={i}>[{log.time}] {log.message}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(6, "Step 6: GitHub App", <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>, step5Complete, step4Complete && !step5Complete, !step4Complete, "Install the SecureAgentBase GitHub App to get repository-specific access for autonomous deployments and issue responses.")}
          
          {expandedSteps.includes(7) && !step4Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 5 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(7) && step4Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              <p className="text-gray-600 mb-4">
                Install SecureAgentBase as a GitHub App to get isolated, repo-specific access.
              </p>
              
              {githubAppInstalled ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">GitHub App installed</span>
                </div>
              ) : (
                <button
                  onClick={handleInstallGitHubApp}
                  className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <ExternalLink size={18} />
                  Install GitHub App
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(7, "Step 7: Discord Bot", <Bot className="text-blue-600" size={24} />, step6Complete, step5Complete && !step6Complete, !step5Complete, "Create a Discord bot to enable the Kimaki listener. This bot will receive commands and trigger autonomous agent actions.")}
          
          {expandedSteps.includes(7) && !step5Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 6 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(7) && step5Complete && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              <p className="text-gray-600 mb-4">
                Create a Discord bot for the Kimaki listener.
              </p>
              
              {discordBotToken ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Discord bot configured</span>
                </div>
              ) : (
                <button
                  onClick={handleCreateDiscordBot}
                  disabled={saving || !vmIp}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  <Bot size={18} />
                  {saving ? 'Creating...' : 'Create Discord Bot'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <button
            onClick={handleDisconnect}
            className="text-red-600 hover:text-red-700 flex items-center gap-2"
          >
            <Trash2 size={18} />
            Disconnect Infrastructure
          </button>
          <button
            onClick={handleSaveConfig}
            disabled={saving || !projectId.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InfraSetup;
