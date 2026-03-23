import React, { useState, useEffect } from 'react';
import { useAuth } from './firestore-utils/auth-context';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Check, Copy, Upload, AlertTriangle, Trash2, ExternalLink, Shield, Server, Bot } from 'lucide-react';

const INFRA_COLLECTION = 'infra_configs';
const LOCALSTORAGE_KEY = 'infra_config_pending';
const FORM_PROGRESS_KEY = 'infra_form_progress';

const saveFormProgress = (data) => {
  try {
    localStorage.setItem(FORM_PROGRESS_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Error saving form progress:', e);
  }
};

const loadFormProgress = () => {
  try {
    const data = localStorage.getItem(FORM_PROGRESS_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Error loading form progress:', e);
    return null;
  }
};

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
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/billing.projectManager"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/serviceusage.serviceUsageAdmin"

gcloud projects add-iam-policy-binding $PROJECT_ID \\
  --member="serviceAccount:secureagent-manager@$PROJECT_ID.iam.gserviceaccount.com" \\
  --role="roles/secretmanager.secretAccessor"

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
  const [step7Complete, setStep7Complete] = useState(false);
  const [step8Complete, setStep8Complete] = useState(false);
  const [step9Complete, setStep9Complete] = useState(false);
  const [gcpConfigLost, setGcpConfigLost] = useState(false);
  const [checkingCompletion, setCheckingCompletion] = useState(true);

  const [firebaseConfigStaging, setFirebaseConfigStaging] = useState('');
  const [firebaseConfigProduction, setFirebaseConfigProduction] = useState('');
  const [firebaseStagingData, setFirebaseStagingData] = useState({});
  const [firebaseProductionData, setFirebaseProductionData] = useState({});
  const [githubPat, setGithubPat] = useState('');
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [discordBotTokenInput, setDiscordBotTokenInput] = useState('');
  const [vmHttpsUrl, setVmHttpsUrl] = useState('');
  const [formProgressLoaded, setFormProgressLoaded] = useState(false);

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
    if (nextStep <= 9 && !expandedSteps.includes(nextStep)) {
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

  const isStepActive = (step) => {
    if (step === 1) return !isStepCompleted(1);
    if (step === 2) return isStepCompleted(1) && !isStepCompleted(2);
    if (step === 3) return isStepCompleted(2) && !isStepCompleted(3);
    if (step === 4) return isStepCompleted(3) && !isStepCompleted(4);
    if (step === 5) return isStepCompleted(4) && !isStepCompleted(5);
    if (step === 6) return isStepCompleted(5) && !isStepCompleted(6);
    if (step === 7) return isStepCompleted(6) && !isStepCompleted(7);
    if (step === 8) return isStepCompleted(7) && !isStepCompleted(8);
    if (step === 9) return isStepCompleted(8) && !isStepCompleted(9);
    return !isStepCompleted(step);
  };

  const hasGcpAccess = () => {
    return !!(projectId && (gcpAccessToken || serviceAccountJson));
  };

  const isStepCompleted = (step) => {
    if (step === 1) return !!user;
    if (step === 2) return !!(serviceAccountJson || (projectId && gcpConnected));
    if (step === 3) return !!projectId;
    if (step === 4) return !!vmIp;
    if (step === 5) return !!vmIp;
    if (step === 6) return !!(firebaseStagingData?.projectId && firebaseProductionData?.projectId);
    if (step === 7) return !!githubRepoUrl;
    if (step === 8) return !!githubPat;
    if (step === 9) {
      if (!discordBotToken) return false;
      return hasGcpAccess();
    }
    return false;
  };

  const isStepLocked = (step) => {
    if (step === 1) return false;
    if (step === 2) return !isStepCompleted(1);
    if (step === 3) return !isStepCompleted(2);
    if (step === 4) return !isStepCompleted(3);
    if (step === 5) return !isStepCompleted(4);
    if (step === 6) return !isStepCompleted(5);
    if (step === 7) return !isStepCompleted(6);
    if (step === 8) return !isStepCompleted(7);
    if (step === 9) {
      if (!isStepCompleted(8)) return true;
      if (!hasGcpAccess()) return true;
      return false;
    }
    return false;
  };

  const isStepWarning = (step) => {
    if (step === 9) {
      return !!(discordBotToken && projectId && !gcpAccessToken && !serviceAccountJson);
    }
    if (step === 2) {
      return !!(projectId && gcpConnected && !serviceAccountJson);
    }
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
          
          if (user) {
            try {
              const infraRef = doc(db, INFRA_COLLECTION, user.uid);
              await setDoc(infraRef, {
                gcp_access_token: response.access_token,
                gcp_connected: true,
                updated_at: new Date().toISOString(),
              }, { merge: true });
            } catch (err) {
              console.error('Error auto-saving GCP token:', err);
            }
          }
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
      { name: 'serviceusage.googleapis.com', displayName: 'Service Usage API' },
      { name: 'secretmanager.googleapis.com', displayName: 'Secret Manager API' }
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
      if (!expandedSteps.includes(2)) {
        setExpandedSteps(prev => [...prev, 2]);
      }
    } else {
      setStep1Complete(false);
    }
  }, [user]);

  useEffect(() => {
    const formProgress = loadFormProgress();
    console.log('Loading form progress:', formProgress);
    if (formProgress) {
      if (formProgress.firebaseConfigStaging) {
        setFirebaseConfigStaging(formProgress.firebaseConfigStaging);
        const parsed = parseFirebaseConfig(formProgress.firebaseConfigStaging);
        if (parsed) setFirebaseStagingData(parsed);
      }
      if (formProgress.firebaseConfigProduction) {
        setFirebaseConfigProduction(formProgress.firebaseConfigProduction);
        const parsed = parseFirebaseConfig(formProgress.firebaseConfigProduction);
        if (parsed) setFirebaseProductionData(parsed);
      }
      if (formProgress.githubRepoUrl) setGithubRepoUrl(formProgress.githubRepoUrl);
      if (formProgress.githubPat) setGithubPat(formProgress.githubPat);
      if (formProgress.vmHttpsUrl) setVmHttpsUrl(formProgress.vmHttpsUrl);
      if (formProgress.expandedSteps) setExpandedSteps(formProgress.expandedSteps);
      if (formProgress.step2Complete) setStep2Complete(formProgress.step2Complete);
      if (formProgress.serviceAccountJson) setServiceAccountJson(formProgress.serviceAccountJson);
      if (formProgress.step6Complete) setStep6Complete(formProgress.step6Complete);
      if (formProgress.step7Complete) setStep7Complete(formProgress.step7Complete);
      if (formProgress.step8Complete) setStep8Complete(formProgress.step8Complete);
      if (formProgress.projectId) setProjectId(formProgress.projectId);
      if (formProgress.step9Complete) setStep9Complete(formProgress.step9Complete);
      if (formProgress.projectId && !formProgress.gcpAccessToken) {
        setGcpConfigLost(true);
      }
    }
    setFormProgressLoaded(true);
  }, []);

  useEffect(() => {
    if (!formProgressLoaded) return;
    
    const formData = {
      firebaseConfigStaging,
      firebaseConfigProduction,
      githubRepoUrl,
      githubPat,
      vmHttpsUrl,
      expandedSteps,
      step2Complete,
      serviceAccountJson,
      step6Complete,
      step7Complete,
      step8Complete,
      projectId,
      gcpAccessToken: gcpAccessToken ? 'saved' : null,
      step9Complete,
    };
    console.log('Saving form progress:', formData);
    saveFormProgress(formData);
  }, [formProgressLoaded, firebaseConfigStaging, firebaseConfigProduction, githubRepoUrl, githubPat, vmHttpsUrl, expandedSteps, step2Complete, serviceAccountJson, step6Complete, step7Complete, step8Complete, projectId, gcpAccessToken, step9Complete]);

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
        setGcpAccessToken(configData.gcp_access_token || null);
        setGithubAppInstalled(configData.github_app_installed || false);
        setVmIp(configData.vm_ip || '');
        setDiscordBotToken(configData.discord_bot_token || '');
        setFirebaseConfigStaging(configData.firebase_staging ? JSON.stringify(configData.firebase_staging, null, 2) : '');
        setFirebaseConfigProduction(configData.firebase_production ? JSON.stringify(configData.firebase_production, null, 2) : '');
        setFirebaseStagingData(configData.firebase_staging || {});
        setFirebaseProductionData(configData.firebase_production || {});
        setGithubRepoUrl(configData.github_repo_url || '');
        setGithubPat(configData.github_pat || '');
        
        if (configData.service_account_key) {
          setServiceAccountKey(configData.service_account_key);
        }

        const formProgress = loadFormProgress();
        
        if (!formProgress?.step1Complete && configData.gcp_project_id) setStep1Complete(true);
        if (!formProgress?.step2Complete && configData.gcp_project_id && configData.service_account_configured) setStep2Complete(true);
        if (!formProgress?.step3Complete && configData.vm_ip) {
          setStep3Complete(true);
          setStep4Complete(true);
          setStep5Complete(true);
        }
        if (!formProgress?.step6Complete && configData.firebase_staging && configData.firebase_production) {
          setStep6Complete(true);
          if (!expandedSteps.includes(7)) {
            setExpandedSteps(prev => [...prev, 7]);
          }
        }
        if (!formProgress?.step7Complete && configData.github_repo_url) {
          setStep7Complete(true);
        }
        if (!formProgress?.step8Complete && configData.github_pat) {
          setStep8Complete(true);
        }
        if (!formProgress?.step9Complete && configData.discord_bot_token) {
          setStep9Complete(true);
        }
        if (!formProgress?.step5Complete && configData.github_app_installed) setStep5Complete(true);
        
        if (configData.vm_ip && !expandedSteps.includes(6)) {
          setExpandedSteps(prev => [...prev, 6]);
        }

        if (configData.gcp_project_id && !configData.gcp_access_token) {
          setGcpConfigLost(true);
        }
      }

      setLoading(false);
      setCheckingCompletion(false);
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
      
      if (user) {
        try {
          const infraRef = doc(db, INFRA_COLLECTION, user.uid);
          await setDoc(infraRef, {
            service_account_key: parsed,
            service_account_configured: true,
            updated_at: new Date().toISOString(),
          }, { merge: true });
        } catch (err) {
          console.error('Error auto-saving service account:', err);
        }
      }
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
      firebase_staging: firebaseStagingData,
      firebase_production: firebaseProductionData,
      github_repo_url: githubRepoUrl,
      github_pat: githubPat,
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
      localStorage.removeItem(FORM_PROGRESS_KEY);
      
      setProjectId('');
      setGcpConnected(false);
      setGcpAccessToken(null);
      setServiceAccountKey(null);
      setServiceAccountError(null);
      setVmIp('');
      setDiscordBotToken('');
      setGithubAppInstalled(false);
      setGithubRepoUrl('');
      setGithubPat('');
      setFirebaseConfigStaging('');
      setFirebaseConfigProduction('');
      setFirebaseStagingData({});
      setFirebaseProductionData({});
      
      setStep1Complete(false);
      setStep2Complete(false);
      setStep3Complete(false);
      setStep4Complete(false);
      setStep5Complete(false);
      setStep6Complete(false);
      setStep7Complete(false);
      setStep8Complete(false);
      setStep9Complete(false);
      setGcpConfigLost(false);
      
      setExpandedSteps([]);
      setError(null);
      
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

  const parseFirebaseConfig = (rawConfig) => {
    try {
      let configStr = rawConfig.trim();
      
      if (configStr.includes('firebaseConfig')) {
        const configMatch = configStr.match(/firebaseConfig\s*=\s*({[^}]+})/s);
        if (configMatch) {
          configStr = configMatch[1];
        }
      }
      
      const parsed = {};
      const keyPairs = configStr.match(/(\w+):\s*["']([^"']+)["']/g);
      if (!keyPairs) return null;
      
      keyPairs.forEach(pair => {
        const match = pair.match(/(\w+):\s*["']([^"']+)["']/);
        if (match) {
          parsed[match[1]] = match[2];
        }
      });
      
      return parsed;
    } catch (e) {
      console.error('Error parsing Firebase config:', e);
      return null;
    }
  };

  const handleSetupFirebase = async () => {
    setError(null);
    
    let stagingConfig = null;
    let productionConfig = null;
    
    if (firebaseConfigStaging.trim()) {
      stagingConfig = parseFirebaseConfig(firebaseConfigStaging);
      if (!stagingConfig) {
        setError('Could not parse Staging Firebase config. Make sure you paste the full firebaseConfig object.');
        return;
      }
      setFirebaseStagingData(stagingConfig);
    } else {
      setError('Please paste the Staging Firebase SDK config');
      return;
    }
    
    if (firebaseConfigProduction.trim()) {
      productionConfig = parseFirebaseConfig(firebaseConfigProduction);
      if (!productionConfig) {
        setError('Could not parse Production Firebase config. Make sure you paste the full firebaseConfig object.');
        return;
      }
      setFirebaseProductionData(productionConfig);
    } else {
      setError('Please paste the Production Firebase SDK config');
      return;
    }
    
    try {
      if (projectId && gcpAccessToken) {
        await saveSecretToGCP('firebase-staging-config', JSON.stringify(stagingConfig));
        await saveSecretToGCP('firebase-production-config', JSON.stringify(productionConfig));
      }
      
      setStep6Complete(true);
      if (!expandedSteps.includes(7)) {
        setExpandedSteps(prev => [...prev, 7]);
      }
      await saveConfig({ 
        firebase_staging: stagingConfig,
        firebase_production: productionConfig,
      });
    } catch (err) {
      console.error('Error setting up Firebase:', err);
      setError('Failed to configure Firebase: ' + err.message);
    }
  };

  const handleForkGitHub = async () => {
    setError(null);
    
    const clientId = import.meta.env.VITE_GITHUB_APP_CLIENT_ID;
    if (!clientId) {
      setError('GitHub OAuth not configured. Please set VITE_GITHUB_APP_CLIENT_ID in environment.');
      return;
    }

    const redirectUri = encodeURIComponent(window.location.origin + '/github-callback');
    const state = user?.uid || 'anonymous';
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo&state=${state}`;
    window.location.href = githubAuthUrl;
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

  const getAccessToken = async () => {
    if (gcpAccessToken) return gcpAccessToken;
    if (serviceAccountJson) {
      const saToken = await getServiceAccountToken();
      if (saToken) return saToken;
    }
    return null;
  };

  const saveSecretToGCP = async (secretName, secretValue) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('GCP not configured. Please connect Google and upload service account key.');
    }

    const secretId = `secureagent-${secretName}`;
    
    const response = await fetch(
      `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${secretId}/versions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payload: {
            data: btoa(secretValue),
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Failed to save secret ${secretName}: ${err.error?.message || response.statusText}`);
    }

    return response.json();
  };

  const handleCreateDiscordBot = async () => {
    if (!discordBotTokenInput.trim()) {
      setError('Please enter your Discord bot token');
      return;
    }

    if (!hasGcpAccess()) {
      const missing = [];
      if (!projectId) missing.push('GCP Project ID');
      if (!serviceAccountJson) missing.push('Service Account Key');
      setError(`Missing: ${missing.join(', ')}. Complete Step 2 to configure.`);
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setError('Failed to get GCP access token. Please re-authenticate in Step 2.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await saveSecretToGCP('discord-bot-token', discordBotTokenInput);
      
      setDiscordBotToken(discordBotTokenInput);
      setStep9Complete(true);
      expandNextStep(9);
      await saveConfig({ discord_bot_token: discordBotTokenInput });
      
      alert('Discord bot token saved to GCP Secret Manager!');
    } catch (err) {
      console.error('Error saving discord bot token:', err);
      setError(err.message);
    }

    setSaving(false);
  };

  const pendingConfig = !user && loadFromLocalStorage();

  const getStepHeader = (stepNumber, title, icon, isComplete, isActive, isLocked, info, isWarning = false) => {
    const baseClasses = "flex items-center justify-between w-full p-4 rounded-lg transition-all duration-200";
    let bgClasses = "bg-gray-50";
    let borderClasses = "border border-gray-200";
    let textClasses = "text-gray-500";
    let iconColor = "text-gray-400";
    
    if (isWarning) {
      bgClasses = "bg-yellow-50";
      borderClasses = "border-2 border-yellow-500";
      textClasses = "text-yellow-700";
      iconColor = "text-yellow-600";
    } else if (isComplete) {
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
          {isComplete || isWarning ? (isWarning ? <AlertTriangle className={iconColor} size={24} /> : <Check className={iconColor} size={24} />) : icon}
          <span className={`font-semibold ${textClasses}`}>{title}</span>
          {isWarning && <span className="text-xs text-yellow-600 ml-2">(Re-authentication required)</span>}
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

      {checkingCompletion && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span className="text-blue-700">Checking completion status...</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          {getStepHeader(1, "Step 1: Account", <Shield className="text-blue-600" size={24} />, isStepCompleted(1), isStepActive(1), isStepLocked(1), "Sign in to continue.")}
          
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
          {getStepHeader(2, "Step 2: Service Account", <Upload className="text-blue-600" size={24} />, isStepCompleted(2), isStepActive(2), isStepLocked(2), "Create a service account in your GCP project and paste the JSON key. This lets us create VMs without accessing your personal account.", isStepWarning(2))}
          
          {expandedSteps.includes(2) && !isStepCompleted(1) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 1 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(2) && isStepCompleted(1) && (
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
                      <li>Go to <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud IAM → Service Accounts</a></li>
                      <li>Select your project from the dropdown at the top</li>
                      <li>Click "+ Create Service Account"</li>
                      <li>Name: <code className="bg-blue-100 px-1">secureagent</code></li>
                      <li>Grant roles: <strong>Compute Admin</strong>, <strong>Service Account User</strong>, <strong>Project Billing Manager</strong>, and <strong>Service Usage Admin</strong></li>
                      <li>After creation, click <strong>Actions → Manage keys → Add key → Create new key</strong></li>
                      <li>Select <strong>JSON</strong> and download</li>
                      <li>Open the JSON file, copy all content, paste below</li>
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
          {getStepHeader(3, "Step 3: GCP Project", <Server className="text-blue-600" size={24} />, isStepCompleted(3), isStepActive(3), isStepLocked(3), "Select or create a GCP project for your VM.")}
          
          {expandedSteps.includes(3) && !isStepCompleted(2) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 2 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(3) && isStepCompleted(2) && (
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
          {getStepHeader(4, "Step 4: Enable APIs & Create VM", <Server className="text-blue-600" size={24} />, isStepCompleted(4), isStepActive(4), isStepLocked(4), "Enable required Google Cloud APIs and create a VM to run the Kimaki listener.")}
          
          {expandedSteps.includes(4) && !isStepCompleted(3) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 3 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(4) && isStepCompleted(3) && (
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
                                const errData = await response.json().catch(() => ({}));
                                const errMsg = errData.error?.message || '';
                                if (errMsg.includes('billing')) {
                                  setError('Billing must be enabled on your GCP project');
                                  addStep4Log(`ERROR: Billing required for ${api.displayName}`);
                                } else if (errMsg.includes('already') || errMsg.includes('enabled')) {
                                  addStep4Log(`${api.displayName} already enabled`);
                                } else {
                                  addStep4Log(`Note: ${errMsg || 'Continuing anyway...'}`);
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
                                      value: `#!/bin/bash
set -e

echo "=== VM Startup Script ==="

# Install dependencies
apt-get update
apt-get install -y nodejs npm git curl wget gnupg ca-certificates apt-transport-https

# Install Google Cloud SDK
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
wget -qO- https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor > /usr/share/keyrings/cloud.google.gpg
apt-get update
apt-get install -y google-cloud-sdk

# Install GitHub CLI
wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null
apt-get update
apt-get install -y gh

# Install Firebase CLI
npm install -g firebase-tools

# Get service account key from metadata
echo "Fetching service account credentials..."
mkdir -p /etc/secrets
curl -s "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" -H "Metadata-Flavor: Google" > /dev/null
gcloud auth activate-service-account --key-file=/etc/secrets/service-account.json || true
gcloud auth configure-docker

# Get secrets from GCP Secret Manager
PROJECT_ID=$(curl -s "http://metadata.google.internal/computeMetadata/v1/project/project-id" -H "Metadata-Flavor: Google")

echo "Reading secrets from GCP Secret Manager..."

# Function to get secret
get_secret() {
  local secret_name=\${1}
  gcloud secrets versions access latest --secret="\${secret_name}" --project="\${PROJECT_ID}" 2>/dev/null || echo ""
}

DISCORD_BOT_TOKEN=$(get_secret "secureagent-discord-bot-token")
GITHUB_PAT=$(get_secret "secureagent-github-pat")
FIREBASE_STAGING_CONFIG=$(get_secret "secureagent-firebase-staging-config")
FIREBASE_PRODUCTION_CONFIG=$(get_secret "secureagent-firebase-production-config")
GITHUB_REPO_URL=$(get_secret "secureagent-github-repo-url")

if [ -z "\${GITHUB_REPO_URL}" ]; then
  echo "ERROR: GitHub repo URL not found in secrets"
  exit 1
fi

# Extract owner and repo from URL
GITHUB_OWNER=$(echo "\${GITHUB_REPO_URL}" | sed -E 's|https://github.com/([^/]+)/.*|\\1|')
GITHUB_REPO=$(echo "\${GITHUB_REPO_URL}" | sed -E 's|https://github.com/[^/]+/([^.]+).*|\\1|')

echo "Configuring GitHub..."
echo "\${GITHUB_PAT}" | gh auth login --with-token

# Clone the repo
cd /opt
git clone "\${GITHUB_REPO_URL}" secureagent-app
cd secureagent-app

# Set GitHub secrets
if [ -n "\${FIREBASE_STAGING_CONFIG}" ]; then
  echo "\${FIREBASE_STAGING_CONFIG}" | gh secret set FIREBASE_STAGING_CONFIG
fi
if [ -n "\${FIREBASE_PRODUCTION_CONFIG}" ]; then
  echo "\${FIREBASE_PRODUCTION_CONFIG}" | gh secret set FIREBASE_PRODUCTION_CONFIG
fi
echo "\${GITHUB_PAT}" | gh secret set GITHUB_TOKEN

# Create GitHub Actions workflow for staging deploy
mkdir -p .github/workflows
cat > .github/workflows/deploy-staging.yml << 'ENDOFFILE'
name: Deploy Staging
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test:ci
      - run: npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '\${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '\${{ secrets.FIREBASE_STAGING_CONFIG }}'
          projectId: '\${{ secrets.FIREBASE_STAGING_CONFIG }}'
          entryPoint: .
ENDOFFILE

# Create GitHub Actions workflow for production deploy
cat > .github/workflows/deploy-production.yml << 'ENDOFFILE'
name: Deploy Production
on:
  release:
    types: [published]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run test:ci
      - run: npm run build
      - uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '\${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '\${{ secrets.FIREBASE_PRODUCTION_CONFIG }}'
          projectId: '\${{ secrets.FIREBASE_PRODUCTION_CONFIG }}'
          entryPoint: .
ENDOFFILE

# Push workflows to repo
git config user.email "agent@secureagentbase.com"
git config user.name "SecureAgentBase"
git add .github/workflows/
git commit -m "Add deploy workflows" || true
git push

# Configure Firebase for staging
if [ -n "\${FIREBASE_STAGING_CONFIG}" ]; then
  echo "\${FIREBASE_STAGING_CONFIG}" > firebase-staging-config.json
  firebase hosting:disable -y --project=staging 2>/dev/null || true
  firebase hosting:enable --project=staging --json firebase-staging-config.json || true
fi

# Configure Firebase for production
if [ -n "\${FIREBASE_PRODUCTION_CONFIG}" ]; then
  echo "\${FIREBASE_PRODUCTION_CONFIG}" > firebase-production-config.json
  firebase hosting:disable -y --project=production 2>/dev/null || true
  firebase hosting:enable --project=production --json firebase-production-config.json || true
fi

# Clone and set up Kimaki
cd /opt
git clone https://github.com/argbase/kimaki.git
cd kimaki
npm install

# Create environment file for Kimaki
cat > .env << ENDENV
DISCORD_BOT_TOKEN=\${DISCORD_BOT_TOKEN}
GITHUB_TOKEN=\${GITHUB_PAT}
GITHUB_OWNER=\${GITHUB_OWNER}
GITHUB_REPO=\${GITHUB_REPO}
SERVICE_ACCOUNT_PATH=/etc/secrets/service-account.json
ENDENV

# Start Kimaki
npm start &
echo "Kimaki started"

echo "=== VM Setup Complete ==="
echo "GitHub repo: \${GITHUB_OWNER}/\${GITHUB_REPO}"
`
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
          {getStepHeader(5, "Step 5: Configure Kimaki", <Server className="text-blue-600" size={24} />, isStepCompleted(5), isStepActive(5), isStepLocked(5), "Verify the connection to your Kimaki VM or manually enter the IP address. This VM runs the Discord listener agent.")}
          
          {expandedSteps.includes(5) && !isStepCompleted(3) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 4 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(5) && isStepCompleted(3) && (
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
                              setStep5Complete(true);
                              setExpandedSteps(prev => prev.includes(6) ? prev : [...prev, 6]);
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
          {getStepHeader(6, "Step 6: Firebase Setup", <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M3.89 15.672L6.255.461A.542.542 0 0 1 7.27.288l2.543 4.771zm16.794 3.692l-2.25-14a.54.54 0 0 0-.919-.295L3.316 19.365l7.856 4.427a1.621 1.621 0 0 0 1.588 0zM14.3 7.147l-1.82-3.482a.542.542 0 0 0-.96 0L3.53 17.984z"/></svg>, isStepCompleted(6), isStepActive(6), isStepLocked(6), "Configure Firebase hosting for your app deployment.")}
          
          {expandedSteps.includes(6) && !isStepCompleted(5) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 5 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(6) && isStepCompleted(5) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {isStepCompleted(6) ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Firebase configured: Staging ({firebaseStagingData.projectId}), Production ({firebaseProductionData.projectId})</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-3">Set up Firebase for staging and production:</p>
                    <p className="text-blue-700 text-sm mb-4">
                      Follow these steps for <strong>each</strong> environment (staging and production):
                    </p>
                    <ol className="list-decimal list-inside space-y-2 text-blue-700 text-sm mb-4">
                      <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-medium">Firebase Console</a></li>
                      <li>Click "Add project" → enter name (e.g., "my-app-staging") → disable Google Analytics → Create</li>
                      <li>Once created, click "Build" → "Hosting" → "Get started" → "Continue" (skip the CLI steps)</li>
                      <li>Click the gear icon ⚙️ → "Project settings"</li>
                      <li>Scroll to "Your apps" → click the web icon &lt;/&gt; → Register app → "Add Firebase SDK" → copy just the <code className="bg-blue-100 px-1">firebaseConfig</code> object (not the whole script tag)</li>
                    </ol>
                    <p className="text-blue-700 text-sm font-medium">
                      Repeat for both staging and production, then paste both configs below.
                    </p>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Staging Firebase SDK config:</label>
                    <textarea
                      value={firebaseConfigStaging}
                      onChange={(e) => setFirebaseConfigStaging(e.target.value)}
                      placeholder={"{\"apiKey\": \"AIza...\", \"authDomain\": \"my-app-staging.firebaseapp.com\", \"projectId\": \"my-app-staging\", \"storageBucket\": \"my-app-staging.appspot.com\", \"messagingSenderId\": \"123456789\", \"appId\": \"1:123456789:web:abc123\"}"}
                      className="w-full h-28 px-3 py-2 border-2 border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-blue-400"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Production Firebase SDK config:</label>
                    <textarea
                      value={firebaseConfigProduction}
                      onChange={(e) => setFirebaseConfigProduction(e.target.value)}
                      placeholder={"{\"apiKey\": \"AIza...\", \"authDomain\": \"my-app-production.firebaseapp.com\", \"projectId\": \"my-app-production\", \"storageBucket\": \"my-app-production.appspot.com\", \"messagingSenderId\": \"123456789\", \"appId\": \"1:123456789:web:abc123\"}"}
                      className="w-full h-28 px-3 py-2 border-2 border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  
                  <button
                    onClick={handleSetupFirebase}
                    disabled={!firebaseConfigStaging.trim() || !firebaseConfigProduction.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                  >
                    Configure Firebase
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(7, "Step 7: GitHub Fork", <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>, isStepCompleted(7), isStepActive(7), isStepLocked(7), "Fork SecureAgentBase to your GitHub account for upstream updates.")}
          
          {expandedSteps.includes(7) && !isStepCompleted(6) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 6 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(7) && isStepCompleted(6) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {step7Complete ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Forked: {githubRepoUrl}</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-2">Fork SecureAgentBase:</p>
                    <p className="text-blue-700 text-sm mb-3">
                      Go to GitHub and fork SecureAgentBase to your account. This gives you your own copy to iterate on.
                    </p>
                    <a 
                      href="https://github.com/kallhoffa/SecureAgentBase/fork" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline text-sm"
                    >
                      Fork on GitHub
                    </a>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Enter your forked repo URL:</label>
                    <input
                      type="text"
                      value={githubRepoUrl}
                      onChange={(e) => setGithubRepoUrl(e.target.value)}
                      placeholder="https://github.com/yourname/SecureAgentBase"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {error}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      console.log('Continue button clicked, URL:', githubRepoUrl);
                      setError(null);
                      if (githubRepoUrl.includes('github.com')) {
                        try {
                          console.log('Marking step 7 complete...');
                          if (projectId && gcpAccessToken) {
                            await saveSecretToGCP('github-repo-url', githubRepoUrl);
                          }
                          setStep7Complete(true);
                          if (!expandedSteps.includes(8)) {
                            setExpandedSteps(prev => [...prev, 8]);
                          }
                          await saveConfig({ github_repo_url: githubRepoUrl });
                          console.log('Step 7 saved successfully');
                        } catch (err) {
                          console.error('Error saving step 7:', err);
                          setStep7Complete(true);
                          if (!expandedSteps.includes(8)) {
                            setExpandedSteps(prev => [...prev, 8]);
                          }
                        }
                      } else {
                        setError('Please enter a valid GitHub repo URL');
                      }
                    }}
                    disabled={!githubRepoUrl.trim() || !githubRepoUrl.includes('github.com')}
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
          {getStepHeader(8, "Step 8: GitHub Auth (VM)", <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>, isStepCompleted(8), isStepActive(8), isStepLocked(8), "Create a GitHub PAT for the VM to authenticate with GitHub.")}
          
          {expandedSteps.includes(8) && !isStepCompleted(7) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 7 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(8) && isStepCompleted(7) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {step8Complete ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">GitHub auth configured</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-2">Create a GitHub Personal Access Token:</p>
                    <p className="text-blue-700 text-sm mb-3">
                      The VM needs this to push/pull code from your repo. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token.
                    </p>
                    <p className="text-blue-700 text-sm mb-2">
                      <strong>Required scopes:</strong> <code className="bg-blue-100 px-1">repo</code>
                    </p>
                    <a 
                      href="https://github.com/settings/tokens/new?scopes=repo" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 underline text-sm"
                    >
                      Create Token on GitHub
                    </a>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Enter your GitHub PAT:</label>
                    <input
                      type="password"
                      value={githubPat}
                      onChange={(e) => setGithubPat(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                    <p className="text-gray-500 text-xs mt-1">
                      This will be stored in Firestore and used by your VM to authenticate with GitHub
                    </p>
                  </div>
                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {error}
                    </div>
                  )}
                  <button
                    onClick={async () => {
                      setError(null);
                      if (githubPat.trim() && githubPat.startsWith('ghp_')) {
                        try {
                          if (projectId && gcpAccessToken) {
                            await saveSecretToGCP('github-pat', githubPat);
                          }
                          setStep8Complete(true);
                          if (!expandedSteps.includes(9)) {
                            setExpandedSteps(prev => [...prev, 9]);
                          }
                          await saveConfig({ github_pat: githubPat });
                        } catch (err) {
                          console.error('Error saving step 8:', err);
                          setStep8Complete(true);
                          if (!expandedSteps.includes(9)) {
                            setExpandedSteps(prev => [...prev, 9]);
                          }
                        }
                      } else {
                        setError('Please enter a valid GitHub PAT (starts with ghp_)');
                      }
                    }}
                    disabled={!githubPat.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                  >
                    Save & Configure VM
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {getStepHeader(9, "Step 9: Discord Bot", <Bot className="text-blue-600" size={24} />, isStepCompleted(9), isStepActive(9), isStepLocked(9), "Create a Discord bot to enable the Kimaki listener.", isStepWarning(9))}
          
          {expandedSteps.includes(9) && !isStepCompleted(8) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 8 first to unlock this step.
            </div>
          )}

          {expandedSteps.includes(9) && isStepCompleted(8) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {gcpConfigLost && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-yellow-800 font-medium mb-1">Re-authentication required</p>
                  <p className="text-yellow-700 text-sm">We don't save your sensitive info, so you need to complete this step again to continue.</p>
                </div>
              )}
              
              {!hasGcpAccess() && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-red-800 font-medium mb-2">Missing Prerequisites:</p>
                  <ul className="text-red-700 text-sm space-y-1">
                    {!projectId && <li>• GCP Project ID (complete Step 3)</li>}
                    {!serviceAccountJson && <li>• Service Account Key (complete Step 2)</li>}
                  </ul>
                  <p className="text-red-600 text-sm mt-2">You must complete Steps 2-3 before configuring Discord bot.</p>
                </div>
              )}
              
              <p className="text-gray-600 mb-4">
                Configure Discord bot token. The VM will read this from GCP Secret Manager to connect Kimaki to Discord.
              </p>
              
              {discordBotToken ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">Discord bot token configured</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-2">Create a Discord bot:</p>
                    <ol className="list-decimal list-inside space-y-2 text-blue-700 text-sm">
                      <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="underline font-medium">Discord Developer Portal</a></li>
                      <li>Click "New Application" → give it a name (e.g., "Kimaki")</li>
                      <li>Go to "Bot" in the left sidebar → click "Add Bot"</li>
                      <li>Scroll down to "Privileged Gateway Intents" → enable <strong>Message Content Intent</strong> (required for Kimaki to read messages)</li>
                      <li>Go to "OAuth2" → "URL Generator"</li>
                      <li>Under "Scopes", check <code className="bg-blue-100 px-1">bot</code></li>
                      <li>Under "Bot Permissions", check <strong>Send Messages</strong>, <strong>Read Message History</strong>, and <strong>Use Slash Commands</strong></li>
                      <li>Copy the generated URL at the bottom, open it in a new tab, and select your server to invite the bot</li>
                      <li>Go back to "Bot" → click "Reset Token" → copy the token</li>
                    </ol>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Discord Bot Token
                    </label>
                    <input
                      type="password"
                      value={discordBotTokenInput}
                      onChange={(e) => setDiscordBotTokenInput(e.target.value)}
                      placeholder="Paste your Discord bot token here"
                      disabled={!hasGcpAccess()}
                      className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {error}
                    </div>
                  )}
                  <button
                    onClick={handleCreateDiscordBot}
                    disabled={saving || !discordBotTokenInput.trim() || !hasGcpAccess()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Bot size={18} />
                    {saving ? 'Saving...' : 'Save Token'}
                  </button>
                </>
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
