import { useState, useEffect, useRef } from 'react';
import { useAuth } from './firestore-utils/auth-context';
import { useNavigate } from 'react-router';
import { useNotification } from './firestore-utils/notification-context';
import { doc, getDoc, Firestore } from 'firebase/firestore';
import { safeSet, safeDelete } from './guardrails/safe-firestore';
import { validate } from './guardrails/validate';
import { useRateLimit } from './guardrails/useRateLimit';
import { Check, AlertTriangle, Trash2, Server, Bot } from 'lucide-react';
import { CloudShellScript, getStartupScript } from './framework/infra-setup/scripts';
import {
  gcpApiFetch, githubApiFetch, setGitHubVariable, ensureGitHubRepo,
  createWorkloadIdentityPool, createWorkloadIdentityProvider,
  createDeployServiceAccount, grantFirebaseRoles, grantPoolAccessToSA,
  smWriteSecret
} from './framework/infra-setup/api';
import { SCHEMAS } from './framework/infra-setup/schemas';
import { StepHeader } from './framework/infra-setup/steps';
import { useWizardProgress } from './framework/infra-setup/useWizardProgress';

// URL builders. User-controlled values always flow through URLSearchParams or
// encodeURIComponent so they are percent-encoded, never interpolated raw into
// hrefs or request URLs (keeps CodeQL js/xss-through-dom and
// js/client-side-request-forgery quiet and is genuinely safer).
const buildDiscordInviteUrl = (clientId) => {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('permissions', '2147551248');
  url.searchParams.set('integration_type', '0');
  url.searchParams.set('scope', 'bot');
  return url.toString();
};

const gcpConsoleUrl = (path, projectId) => {
  const url = new URL(`https://console.cloud.google.com/${path}`);
  if (projectId) url.searchParams.set('project', projectId);
  return url.toString();
};

const gcpApiProjectUrl = (projectId, endpoint) => {
  const url = new URL(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}:${endpoint}`
  );
  return url.toString();
};

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          prompt?: string;
          callback: (response: { error?: string; access_token?: string; scope?: string }) => void;
        }) => { open(): void; requestAccessToken(): void };
      };
    };
  };
}

interface InfraSetupProps {
  db: Firestore;
}

const INFRA_COLLECTION = 'infra_configs';
const LOCALSTORAGE_KEY = 'infra_config_pending';
const FORM_PROGRESS_KEY = 'infra_form_progress';
// Operator-entered secrets: never written to Firestore (GHSA-x49w). Discord
// bot token + GitHub PAT persist to sessionStorage AND localStorage so a fresh
// tab restores steps 1-2 without a GCP token; the SA key is
// sessionStorage-only. See secret-storage.js.




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

const extractClientIdFromToken = (token) => {
  if (!token || !token.includes('.')) return '';
  try {
    const part = token.split('.')[0];
    const decoded = window.atob(part);
    if (/^\d{17,21}$/.test(decoded)) {
      return decoded;
    }
  } catch (err) {
    console.error('Could not decode client ID from token', err);
  }
  return '';
};

const InfraSetup: React.FC<InfraSetupProps> = ({ db }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addNotification } = useNotification();

  // Guardrails: client-side rate limiting for user-triggered actions (5/min min per AGENTS.md)
  const vmRateLimit = useRateLimit('create-vm', 5);
  const saRateLimit = useRateLimit('create-service-account', 5);
  const githubRateLimit = useRateLimit('upload-github-vars', 5);
  const firebaseRateLimit = useRateLimit('setup-firebase', 5);
  const discordRateLimit = useRateLimit('create-discord-bot', 5);
  const githubSaveRateLimit = useRateLimit('save-github-pat', 5);

  const [projectId, setProjectId] = useState('');
  const [githubAppInstalled, setGithubAppInstalled] = useState(false);
  const [vmIp, setVmIp] = useState('');
  const [kimakiBotInvited, setKimakiBotInvited] = useState(false);
  const [kimakiInstallUrl, setKimakiInstallUrl] = useState('');
  const [vmZone, setVmZone] = useState('us-east1-b');
  // Default to e2-small (2 GB) — measured baseline for bot + agent + GCP agents
  // is ~330 MB; e2-small gives ~1.6 GB usable headroom at ~50% the cost of
  // e2-medium. Users who want free-tier pick e2-micro explicitly and see the
  // warning; users who want comfort pick e2-medium. The default is what most
  // users end up paying, so the leaner default saves them money silently.
  const [vmMachineType, setVmMachineType] = useState('e2-small');
const [discordBotToken, setDiscordBotToken] = useState('');
const [discordClientId, setDiscordClientId] = useState('');
const [discordInviteUrl, setDiscordInviteUrl] = useState('');
const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  
  const [gcpConnected, setGcpConnected] = useState(false);
  const [gcpProjectsLoading, setGcpProjectsLoading] = useState(false);
  const [gcpProjects, setGcpProjects] = useState([]);
  const [gcpAccessToken, setGcpAccessToken] = useState(null);
  const [gcpTokenExpiry, setGcpTokenExpiry] = useState(0);
  const [apiNotEnabled, setApiNotEnabled] = useState(false);
  const [serviceAccountJson, setServiceAccountJson] = useState(null);
  const [serviceAccountError, setServiceAccountError] = useState(null);
  const [godSaEmail, setGodSaEmail] = useState(null);

  const [gcpConfigLost, setGcpConfigLost] = useState(false);
  const [gcpConsentEmail, setGcpConsentEmail] = useState('');
  const [gcpEmailMismatch, setGcpEmailMismatch] = useState(false);
  const [checkingCompletion, setCheckingCompletion] = useState(true);

  const [projectName, setProjectName] = useState('');

  const [firebaseConfigStaging, setFirebaseConfigStaging] = useState('');
  const [firebaseConfigProduction, setFirebaseConfigProduction] = useState('');
  const [firebaseStagingData, setFirebaseStagingData] = useState<{ projectId?: string }>({});
  const [firebaseProductionData, setFirebaseProductionData] = useState<{ projectId?: string }>({});
  const [gcpClientIdStaging, setGcpClientIdStaging] = useState('');
  const [gcpClientIdProduction, setGcpClientIdProduction] = useState('');
  const [githubPat, setGithubPat] = useState('');
  const [repoCollision, setRepoCollision] = useState<{ owner: string; name: string; fullName: string } | null>(null);
  const [repoCollisionChoice, setRepoCollisionChoice] = useState<'override' | 'rename' | null>(null);
  const [repoCollisionNewName, setRepoCollisionNewName] = useState('');
  const [discordBotTokenInput, setDiscordBotTokenInput] = useState('');
const [discordGuildId, setDiscordGuildId] = useState('');
const [discordDetecting, setDiscordDetecting] = useState(false);
const [discordBotAdded, setDiscordBotAdded] = useState(false);
  const [vmHttpsUrl, setVmHttpsUrl] = useState('');
  const [formProgressLoaded, setFormProgressLoaded] = useState(false);
  const [useOptimizedBundle, setUseOptimizedBundle] = useState(false);
  const [showRecreateOptions, setShowRecreateOptions] = useState(false);

  const [billingEnabled, setBillingEnabled] = useState(null);
  const [billingChecking, setBillingChecking] = useState(false);
  const [billingAccounts, setBillingAccounts] = useState([]);
  const [selectedBillingAccount, setSelectedBillingAccount] = useState('');
  const [manualBillingAccount, setManualBillingAccount] = useState('');
  const [billingApiError, setBillingApiError] = useState(null);
  const [linkingBilling, setLinkingBilling] = useState(false);
  const [billingLinkedSuccess, setBillingLinkedSuccess] = useState(false);

  const [autoGeneratingSa, setAutoGeneratingSa] = useState(false);
  const [saAutoProgress, setSaAutoProgress] = useState('');
  const [autoGenProjectId, setAutoGenProjectId] = useState('');
  // True only when real e2e credentials were read from URL params/sessionStorage.
  // Deploy builds ship VITE_E2E=true so the Playwright gate works, so isE2EMode
  // alone can't distinguish a test session from a real user's session.
  const [e2eInjected, setE2eInjected] = useState(false);
  // Ref variant of e2eInjected: the load-restore effect runs in the same mount
  // flush as the injection effect, so it reads the ref (mutable, set first) —
  // a state closure would still see `false` on the first pass.
  const e2eInjectedRef = useRef(false);

  const [step3Status, setStep3Status] = useState('idle');
  const [step3Message, setStep3Message] = useState('');
  const [step3Logs, setStep3Logs] = useState([]);
  const [vmLogs, setVmLogs] = useState('');
  const [loadingVmLogs, setLoadingVmLogs] = useState(false);
  const [showInitModal, setShowInitModal] = useState(false);
  const [vmInitComplete, setVmInitComplete] = useState(false);
  const [vmInitLogTail, setVmInitLogTail] = useState('');
  const [botOnline, setBotOnline] = useState(false);
  const [stagingDeployed, setStagingDeployed] = useState(false);

  // NOTE: isE2EMode (build-time VITE_E2E=true, set by deploy workflows for the
  // Playwright gate) is deliberately NOT used to branch runtime behavior for
  // real users — deploy builds ship it, so it can't distinguish a test session
  // from a user's session. e2eInjectedRef (real credentials in URL/sessionStorage)
  // is the discriminator used by the load-restore path and upload error path.

  const [step4Status, setStep4Status] = useState<'idle' | 'enabling' | 'complete' | 'error'>('idle');
  const [step4Message, setStep4Message] = useState('');
  const [step4Logs, setStep4Logs] = useState([]);
  const [step4Retrying, setStep4Retrying] = useState(false);

  const [oidcSetupStatus, setOidcSetupStatus] = useState('idle');
  const [oidcSetupMessage, setOidcSetupMessage] = useState('');
  const [oidcSetupStep, setOidcSetupStep] = useState('');
  const [gcpSaStagingEmail, setGcpSaStagingEmail] = useState('');
  const [gcpSaProductionEmail, setGcpSaProductionEmail] = useState('');
  const [gcpWifPoolName, setGcpWifPoolName] = useState('');
  const [gcpWifProviderName, setGcpWifProviderName] = useState('');
  const [githubVarUploading, setGithubVarUploading] = useState(false);
  const [githubVarUploaded, setGithubVarUploaded] = useState(false);
  const [githubRepoName, setGithubRepoName] = useState('');

  const [firebaseProjects, setFirebaseProjects] = useState([]);
  const [loadingFirebaseProjects, setLoadingFirebaseProjects] = useState(false);
  const [selectedFirebaseStagingProject, setSelectedFirebaseStagingProject] = useState('');
  const [selectedFirebaseProductionProject, setSelectedFirebaseProductionProject] = useState('');
  const [autoConfiguringFirebase, setAutoConfiguringFirebase] = useState(false);
  const [firebaseAutoConfigMessage, setFirebaseAutoConfigMessage] = useState('');

  // Wizard progress reducer — owns expandedSteps and derives step completion
  // from the external signals below. Replaces the legacy inline
  // isStepCompleted/isStepLocked/isStepActive/isStepWarning + setExpandedSteps +
  // setStep3Complete scattered across the component. See wizard-progress.js.
  const wizard = useWizardProgress({
    user,
    serviceAccountJson,
    firebaseStagingData,
    firebaseProductionData,
    billingEnabled,
    githubPat,
    discordBotAdded,
    vmIp,
    projectId,
    gcpConnected,
  });
  const { expandedSteps } = wizard;

  const addStep3Log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setStep3Logs(prev => [...prev, { time: timestamp, message }]);
  };

  const addStep4Log = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setStep4Logs(prev => [...prev, { time: timestamp, message }]);
  };

  const addOidcLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[OIDC] ${message}`);
    setOidcSetupMessage(message);
  };

  const listFirebaseProjects = async (token) => {
    const resp = await fetch('https://firebase.googleapis.com/v1beta1/projects', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`Failed to list Firebase projects (${resp.status}): ${err}`);
    }
    const data = await resp.json();
    return data.results || [];
  };

  const addFirebaseToProject = async (token, gcpProjectId) => {
    const maxAttempts = 6;
    const initialDelay = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const resp = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${gcpProjectId}:addFirebase`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });

      if (resp.ok) return await resp.json();

      const err = await resp.text().catch(() => resp.statusText);
      if (err.includes('ALREADY_FIREBASE_PROJECT') || err.includes('already exists')) {
        return { alreadyExists: true };
      }

      if (resp.status === 403 && attempt < maxAttempts - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`addFirebase 403 (attempt ${attempt + 1}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw new Error(`Failed to add Firebase to project (${resp.status}): ${err}`);
    }
  };

  const listFirebaseWebApps = async (token, firebaseProjectId) => {
    const resp = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${firebaseProjectId}/webApps`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`Failed to list web apps (${resp.status}): ${err}`);
    }
    const data = await resp.json();
    return data.apps || [];
  };

  const createFirebaseWebApp = async (token, firebaseProjectId, displayName) => {
    const resp = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${firebaseProjectId}/webApps`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName })
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`Failed to create web app (${resp.status}): ${err}`);
    }
    return await resp.json();
  };

  const getFirebaseWebAppConfig = async (token, firebaseProjectId, appId) => {
    // After creating a new web app, the config endpoint may return 400 briefly
    // while Firebase provisions the app. Retry with backoff.
    for (let attempt = 0; attempt < 6; attempt++) {
      const resp = await fetch(`https://firebase.googleapis.com/v1beta1/projects/${firebaseProjectId}/webApps/${appId}/config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) {
        return await resp.json();
      }
      if (resp.status === 400 && attempt < 5) {
        console.warn(`getFirebaseWebAppConfig 400 (attempt ${attempt + 1}), retrying...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      const err = await resp.text().catch(() => resp.statusText);
      throw new Error(`Failed to get web app config (${resp.status}): ${err}`);
    }
    throw new Error('Failed to get web app config after retries');
  };

  const updateAuthDomains = async (token, projectId, newDomains) => {
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v2/projects/${projectId}/config`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) return;
    const config = await resp.json();
    const existingDomains = config.authorizedDomains || [];
    const merged = [...new Set([...existingDomains, ...newDomains])];
    if (merged.length === existingDomains.length) return;
    await fetch(`https://identitytoolkit.googleapis.com/v2/projects/${projectId}/config`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizedDomains: merged })
    });
  };

  const findOAuthClientId = async (token, projectId) => {
    // Try to enable Identity Toolkit API first (needed for the config endpoint to work)
    try {
      const enableResp = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/identitytoolkit.googleapis.com:enable`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (enableResp.ok) {
        console.log(`Identity Toolkit API enablement initiated for ${projectId}`);
      } else {
        const errText = await enableResp.text().catch(() => '');
        console.warn(`Identity Toolkit API enablement returned ${enableResp.status}:`, errText);
      }
    } catch (e) {
      console.warn('Could not enable Identity Toolkit API (likely CORS):', e);
    }

    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        const configResp = await fetch(`https://identitytoolkit.googleapis.com/v2/projects/${projectId}/config`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (configResp.ok) {
          const config = await configResp.json();
          if (config.client?.web?.oauthClientId) {
            console.log(`Found OAuth client via Identity Toolkit: ${config.client.web.oauthClientId}`);
            return config.client.web.oauthClientId;
          }
          // Config exists but no OAuth client yet — try enabling sign-in methods
          if (attempt === 0) {
            await fetch(`https://identitytoolkit.googleapis.com/v2/projects/${projectId}/config`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                signIn: { email: { enabled: true, passwordRequired: true } }
              })
            });
          }
        }
        if (configResp.status === 404 && attempt === 0) {
          // Config doesn't exist yet — try creating it via PATCH
          await fetch(`https://identitytoolkit.googleapis.com/v2/projects/${projectId}/config`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              signIn: { email: { enabled: true, passwordRequired: true } }
            })
          });
        }
      } catch (e) {
        console.warn('Identity Toolkit config fetch failed:', e);
      }
      await new Promise(r => setTimeout(r, 5000));
    }
    return null;
  };

  const createOrFindOAuthClient = async (token, projectId, displayName, originUrl) => {
    // Try creating via OAuth API (may fail CORS)
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v1/clients', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: displayName,
          type: 'web',
          javascript_origins: [originUrl, 'http://localhost:3000'],
          redirect_uris: [originUrl]
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.id || null;
      }
      if (resp.status === 409) {
        const data = await resp.json().catch(() => ({}));
        return data.id || null;
      }
      console.warn(`Failed to create OAuth client (${resp.status}), trying alternative...`);
    } catch (e) {
      console.warn('OAuth client creation blocked by CORS. Trying alternative...');
    }

    // Fallback: try Identity Toolkit API (CORS-friendly)
    const clientId = await findOAuthClientId(token, projectId);
    if (clientId) return clientId;

    // Last resort: try listing OAuth clients (also CORS-blocked)
    try {
      const listResp = await fetch('https://www.googleapis.com/oauth2/v1/clients', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (listResp.ok) {
        const clients = await listResp.json();
        const webClient = clients.find(c => c.type === 'web' && c.javascript_origins?.includes?.(originUrl));
        if (webClient?.id) return webClient.id;
      }
    } catch (e) {
      console.warn('Could not list OAuth clients (CORS).');
    }

    console.warn('Unable to discover OAuth client ID. Google Sign-In will need manual config in GCP Console > APIs & Services > Credentials.');
    return null;
  };

  const fetchFirebaseProjects = async () => {
    if (!gcpAccessToken) {
      setError('Please sign in to Google (Step 3) to load Firebase projects.');
      return;
    }
    setLoadingFirebaseProjects(true);
    setFirebaseAutoConfigMessage('Loading Firebase projects...');
    setError(null);
    try {
      const projects = await listFirebaseProjects(gcpAccessToken);
      setFirebaseProjects(projects);
      setFirebaseAutoConfigMessage(`Found ${projects.length} Firebase project(s).`);
    } catch (e) {
      console.error(e);
      if (e.message?.includes('401')) {
        setGcpAccessToken(null);
        setError('Your Google Cloud session has expired. Click "Connect Google Cloud Account" below to refresh, then try again.');
      } else {
        setError('Failed to load Firebase projects: ' + e.message);
      }
      setFirebaseAutoConfigMessage('');
    } finally {
      setLoadingFirebaseProjects(false);
    }
  };


  const ensureGcpProjectExists = async (projectIdVal, displayName, useSaToken = false) => {
    const token = useSaToken ? (await getServiceAccountToken()) : gcpAccessToken;
    if (!token) throw new Error('No auth token available');

    const listRes = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectIdVal}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (listRes.ok) return;

    const resp = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: projectIdVal, name: displayName })
    });
    if (!resp.ok) {
      const err = await resp.json();
      if (err.error?.message?.includes('already exists')) return;
      if (err.error?.code === 403) throw new Error('Cloud Resource Manager API not enabled.');
      throw new Error(err.error?.message || 'Failed to create project');
    }

    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const check = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectIdVal}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (check.ok) return;
    }
    throw new Error('Project created but didn\'t become available within 20s');
  };

  const ensureFirebaseOnProject = async (projectIdVal, useSaToken = false) => {
    const token = useSaToken ? (await getServiceAccountToken()) : gcpAccessToken;
    if (!token) throw new Error('No auth token available');

    // Only ever send requests for a syntactically valid project ID.
    const projectErr = validate({ projectId: projectIdVal }, { projectId: SCHEMAS.projectId });
    if (projectErr) throw new Error(projectErr.projectId);

    const policyResp = await fetch(gcpApiProjectUrl(projectIdVal, 'getIamPolicy'), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (policyResp.ok) {
      const policy = await policyResp.json();
      const bindings = policy.bindings || [];
      // Grant firebase.admin to the GCP consent account's email (the account
      // that owns the OAuth token); fall back to the app-auth email.
      const grantEmail = gcpConsentEmail || user?.email || '';
      if (grantEmail) {
        addMemberToBinding(bindings, 'roles/firebase.admin', `user:${grantEmail}`);
        await fetch(gcpApiProjectUrl(projectIdVal, 'setIamPolicy'), {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ policy: { bindings, etag: policy.etag } })
        });
        await new Promise(r => setTimeout(r, 15000));
      }
    }

    await addFirebaseToProject(token, projectIdVal);
  };

  const setupFirebaseProject = async (projectIdVal, environment) => {
    setFirebaseAutoConfigMessage(`${environment}: Creating web app...`);
    let webApps;
    for (let i = 0; i < 12; i++) {
      try {
        webApps = await listFirebaseWebApps(gcpAccessToken, projectIdVal);
        break;
      } catch (e) {
        if (i >= 11) throw e;
        console.warn(`${environment}: Firebase project not ready (attempt ${i + 1}), retrying...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    let appId;
    if (webApps.length > 0) {
      appId = webApps[0].appId;
    } else {
      const newApp = await createFirebaseWebApp(gcpAccessToken, projectIdVal, `${projectName} ${environment}`);
      appId = newApp.appId;
    }

    setFirebaseAutoConfigMessage(`${environment}: Fetching SDK config...`);
    const config = await getFirebaseWebAppConfig(gcpAccessToken, projectIdVal, appId);

    const originUrl = `https://${config.projectId}.web.app`;
    setFirebaseAutoConfigMessage(`${environment}: Setting up OAuth client...`);
    const clientId = await createOrFindOAuthClient(gcpAccessToken, projectIdVal, `${projectName} (${environment})`, originUrl);

    setFirebaseAutoConfigMessage(`${environment}: Adding authorized domains...`);
    await updateAuthDomains(gcpAccessToken, projectIdVal, [
      'localhost', config.projectId + '.web.app', config.projectId + '.firebaseapp.com',
    ]);

    if (!clientId) {
      addNotification(`${environment}: OAuth client ID not found. Set it in GCP Console > APIs & Services > Credentials for Google Sign-In to work.`, 'info');
    }

    return { config, clientId };
  };

  const handleSetupExistingFirebase = async () => {
    if (!gcpAccessToken) {
      setError('Please sign in to Google (Step 3) first.');
      return;
    }
    if (!projectName && !selectedFirebaseStagingProject && !selectedFirebaseProductionProject) {
      setError('Please set your app name (top of page) or select a Firebase project.');
      return;
    }
    if (!firebaseRateLimit.check()) {
      setError('Rate limit reached for Firebase setup. Try again in a minute.');
      return;
    }
    setAutoConfiguringFirebase(true);
    setFirebaseAutoConfigMessage('Configuring Firebase projects...');
    setError(null);

    let stagingConfig = null, productionConfig = null;
    let stagingClientId = null, productionClientId = null;
    try {
      if (selectedFirebaseStagingProject) {
        const stagingResult = await setupFirebaseProject(selectedFirebaseStagingProject, 'Staging');
        stagingConfig = stagingResult.config;
        stagingClientId = stagingResult.clientId;
        setFirebaseConfigStaging(JSON.stringify(stagingConfig, null, 2));
        setFirebaseStagingData(stagingConfig);
        if (stagingClientId) setGcpClientIdStaging(stagingClientId);
      } else {
        const stagingProjectId = projectId || `${(projectName || 'app').toLowerCase().replace(/[^a-z0-9-]/g, '-')}-staging`;
        setFirebaseAutoConfigMessage(projectId
          ? `Enabling Firebase on existing project ${projectId}...`
          : `Creating staging project: ${stagingProjectId}...`);
        if (projectId) {
          await ensureFirebaseOnProject(projectId);
        } else {
          await ensureGcpProjectExists(stagingProjectId, `${projectName || 'App'} Staging`, false);
          await ensureFirebaseOnProject(stagingProjectId, true);
        }
        const stagingTarget = projectId || stagingProjectId;
        setFirebaseAutoConfigMessage('Setting up staging web app...');
        const stagingResult = await setupFirebaseProject(stagingTarget, 'Staging');
        stagingConfig = stagingResult.config;
        stagingClientId = stagingResult.clientId;
        setFirebaseConfigStaging(JSON.stringify(stagingConfig, null, 2));
        setFirebaseStagingData(stagingConfig);
        if (stagingClientId) setGcpClientIdStaging(stagingClientId);
      }

      if (selectedFirebaseProductionProject) {
        const prodResult = await setupFirebaseProject(selectedFirebaseProductionProject, 'Production');
        productionConfig = prodResult.config;
        productionClientId = prodResult.clientId;
        setFirebaseConfigProduction(JSON.stringify(productionConfig, null, 2));
        setFirebaseProductionData(productionConfig);
        if (productionClientId) setGcpClientIdProduction(productionClientId);
      } else if (gcpAccessToken) {
        const prodProjectId = projectName ? `${projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-production` : `${projectId}-prod`;
        setFirebaseAutoConfigMessage(`Creating production project ${prodProjectId}...`);
        try {
          await ensureGcpProjectExists(prodProjectId, projectName || 'Production', false);
          await ensureFirebaseOnProject(prodProjectId, false);
          setFirebaseAutoConfigMessage('Setting up production web app...');
          const prodResult = await setupFirebaseProject(prodProjectId, 'Production');
          productionConfig = prodResult.config;
          productionClientId = prodResult.clientId;
          setFirebaseConfigProduction(JSON.stringify(productionConfig, null, 2));
          setFirebaseProductionData(productionConfig);
          if (productionClientId) setGcpClientIdProduction(productionClientId);
        } catch (prodErr) {
          console.error('Production auto-creation failed:', prodErr);
          addNotification('Production project setup failed. You can configure it later.', 'info');
        }
      } else {
        addNotification('Production project skipped. Configure it later or connect Google Cloud to auto-create.', 'info');
      }

      setFirebaseAutoConfigMessage('Firebase configuration complete!');
      addNotification('Firebase projects configured successfully!', 'success');
      wizard.dispatch({ type: 'EXPAND_STEP', step: 3 });
      await saveConfig({ firebase_staging: stagingConfig, firebase_production: productionConfig }).catch(() => {});
    } catch (e) {
      console.error(e);
      setError('Firebase setup failed: ' + e.message);
      setFirebaseAutoConfigMessage('');
    } finally {
      setAutoConfiguringFirebase(false);
    }
  };

  const setupOidcInfrastructure = async (repoFullName: string) => {
    if (!githubPat || !repoFullName) return null;
    setOidcSetupStatus('creating');
    setOidcSetupStep('Starting OIDC setup...');
    
    try {
      const token = await getAccessToken();
      if (!token) {
        setError('Need GCP access token. Please reconnect your Google account or re-upload service account key.');
        setOidcSetupStatus('error');
        return null;
      }

      const gcpProject = projectId;
      const poolId = 'firebase-deploy-pool';
      const providerId = 'github-provider';

      // Guard: an empty projectId would build `projects//locations/...` URLs,
      // which GCP rejects with a bare 400 INVALID_ARGUMENT. Surface a clear
      // message instead of a cryptic API error.
      if (!gcpProject || !gcpProject.trim()) {
        setOidcSetupStatus('error');
        setOidcSetupStep('Failed: GCP Project ID is missing');
        throw new Error('Enter your GCP Project ID in the Project section of Step 3 before setting up OIDC.');
      }

      // Create workload identity pool
      setOidcSetupStep('Creating workload identity pool...');
      const poolName = await createWorkloadIdentityPool(token, gcpProject, poolId, addOidcLog);
      setGcpWifPoolName(poolName);

      // Create workload identity provider
      setOidcSetupStep('Creating GitHub OIDC provider...');
      const providerName = await createWorkloadIdentityProvider(token, gcpProject, poolId, providerId, repoFullName, addOidcLog);
      setGcpWifProviderName(providerName);

      // Create staging deploy SA (if we have staging firebase project)
      const stagingProjectId = firebaseStagingData?.projectId;
      const prodProjectId = firebaseProductionData?.projectId;
      let stagingSaEmail = '';
      let prodSaEmail = '';

      if (stagingProjectId) {
        setOidcSetupStep('Creating staging deploy service account...');
        stagingSaEmail = await createDeployServiceAccount(token, gcpProject, 'firebase-deploy-staging', 'Firebase Staging Deployer', addOidcLog);
        setGcpSaStagingEmail(stagingSaEmail);
        
        setOidcSetupStep('Granting Firebase roles for staging...');
        await grantFirebaseRoles(token, stagingProjectId, stagingSaEmail, addOidcLog);
        
        setOidcSetupStep('Granting pool access to staging SA...');
        await grantPoolAccessToSA(token, gcpProject, stagingSaEmail, poolName, repoFullName, addOidcLog);
      }

      if (prodProjectId) {
        setOidcSetupStep('Creating production deploy service account...');
        prodSaEmail = await createDeployServiceAccount(token, gcpProject, 'firebase-deploy-prod', 'Firebase Production Deployer', addOidcLog);
        setGcpSaProductionEmail(prodSaEmail);
        
        setOidcSetupStep('Granting Firebase roles for production...');
        await grantFirebaseRoles(token, prodProjectId, prodSaEmail, addOidcLog);
        
        setOidcSetupStep('Granting pool access to production SA...');
        await grantPoolAccessToSA(token, gcpProject, prodSaEmail, poolName, repoFullName, addOidcLog);
      }

      setOidcSetupStatus('done');
      setOidcSetupStep('OIDC infrastructure ready');

      return {
        wifProvider: providerName,
        saStaging: stagingSaEmail,
        saProduction: prodSaEmail
      };
    } catch (err) {
      console.error('OIDC setup failed:', err);
      setOidcSetupStatus('error');
      if (err.message?.includes('401')) {
        setGcpAccessToken(null);
        setOidcSetupStep('Failed: Google Cloud session expired');
        setError('Your Google Cloud session has expired. Click "Connect Google Cloud Account" in Step 3 to refresh, then try again.');
      } else {
        setOidcSetupStep(`Failed: ${err.message}`);
        setError('OIDC setup failed: ' + err.message);
      }
      return null;
    }
  };

  const uploadGitHubVars = async (oidcData) => {
    if (!githubPat || !githubRepoName) return;
    const errors = validate({ githubPat }, { githubPat: SCHEMAS.githubPat });
    if (errors) {
      setError(errors.githubPat);
      addOidcLog('GitHub variable upload blocked: invalid PAT format');
      setGithubVarUploading(false);
      return;
    }
    if (!githubRateLimit.check()) {
      setError('Rate limit reached for GitHub uploads. Try again in a minute.');
      setGithubVarUploading(false);
      return;
    }
    setGithubVarUploading(true);
    
    try {
      // Ensure the GitHub repo exists before uploading variables
      await ensureGitHubRepo(githubPat, githubRepoName, addOidcLog);

      // Upload Firebase config as GitHub variables (API keys are client-side, not truly secret)
      const firebaseStaging = firebaseStagingData as any;
      const firebaseProd = firebaseProductionData as any;
      if (firebaseStaging) {
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_API_KEY_STAGING', firebaseStaging.apiKey || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_AUTH_DOMAIN_STAGING', firebaseStaging.authDomain || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_PROJECT_ID_STAGING', firebaseStaging.projectId || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_STORAGE_BUCKET_STAGING', firebaseStaging.storageBucket || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_MESSAGING_SENDER_ID_STAGING', firebaseStaging.messagingSenderId || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_APP_ID_STAGING', firebaseStaging.appId || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_MEASUREMENT_ID_STAGING', firebaseStaging.measurementId || '');
      }

      if (firebaseProd) {
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_API_KEY_PRODUCTION', firebaseProd.apiKey || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_AUTH_DOMAIN_PRODUCTION', firebaseProd.authDomain || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_PROJECT_ID_PRODUCTION', firebaseProd.projectId || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_STORAGE_BUCKET_PRODUCTION', firebaseProd.storageBucket || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_MESSAGING_SENDER_ID_PRODUCTION', firebaseProd.messagingSenderId || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_APP_ID_PRODUCTION', firebaseProd.appId || '');
        await setGitHubVariable(githubPat, githubRepoName, 'FIREBASE_MEASUREMENT_ID_PRODUCTION', firebaseProd.measurementId || '');
      }

      // Upload OIDC variables directly from the returned data (bypass React state lag)
      if (oidcData?.wifProvider) {
        await setGitHubVariable(githubPat, githubRepoName, 'GCP_WIF_PROVIDER', oidcData.wifProvider);
      }
      if (oidcData?.saStaging) {
        await setGitHubVariable(githubPat, githubRepoName, 'GCP_SA_STAGING', oidcData.saStaging);
      }
      if (oidcData?.saProduction) {
        await setGitHubVariable(githubPat, githubRepoName, 'GCP_SA_PRODUCTION', oidcData.saProduction);
      }

      // Upload OAuth client IDs for wizard GCP access
      if (gcpClientIdStaging) {
        await setGitHubVariable(githubPat, githubRepoName, 'GCP_CLIENT_ID_STAGING', gcpClientIdStaging);
      }
      if (gcpClientIdProduction) {
        await setGitHubVariable(githubPat, githubRepoName, 'GCP_CLIENT_ID_PRODUCTION', gcpClientIdProduction);
      }

      // Upload app name (user can override this in GitHub settings)
      const repoShortName = githubRepoName.split('/')[1] || 'MyApp';
      await setGitHubVariable(githubPat, githubRepoName, 'VITE_APP_NAME', repoShortName);

      // Upload wizard GitHub username to restrict staging deploys
      const wizardUsername = githubRepoName.split('/')[0];
      if (wizardUsername) {
        await setGitHubVariable(githubPat, githubRepoName, 'WIZARD_GITHUB_USERNAME', wizardUsername);
      }

      setGithubVarUploaded(true);
    } catch (err) {
      console.error('Failed to upload GitHub vars:', err);
      if (e2eInjectedRef.current) {
        // E2E: the test repo's variables already exist with the correct values
        // from the wizard setup, and the e2e PAT may lack the Actions-variables
        // write scope (403 'Resource not accessible'). A failed upload must not
        // render a blocking error box that trips the VM-creation test.
        addOidcLog(`WARNING: GitHub variable upload failed (${err.message}). Existing variables will be used; VM creation can proceed.`);
      } else {
        setError('Failed to upload GitHub variables: ' + err.message);
      }
    } finally {
      setGithubVarUploading(false);
    }
  };

  const getServiceAccountToken = async () => {
    const saEmail = godSaEmail || serviceAccountJson?.client_email;

    // Identity-only (map #36): the operator's Google OAuth token impersonates
    // the agent SA — no SA key is ever held or signed with. Returns null when
    // there is no operator token (legacy SA-key-only flows must reconnect via
    // "Connect Google Cloud Account").
    if (gcpAccessToken && saEmail) {
      try {
        const resp = await fetch(
          `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(saEmail)}:generateAccessToken`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${gcpAccessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              scope: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/compute', 'https://www.googleapis.com/auth/devstorage.read_write', 'https://www.googleapis.com/auth/cloud-billing.readonly'],
              lifetime: '3600s'
            })
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          return data.accessToken;
        }
      } catch (e) {
        console.warn('generateAccessToken failed:', e);
      }
    }

    return null;
  };

  const fetchVmLogs = async () => {
    if (!serviceAccountJson || !projectId || !vmIp) return;
    
    setLoadingVmLogs(true);
    try {
      const token = await getServiceAccountToken();
      if (!token) {
        setError('Failed to get service account token');
        setLoadingVmLogs(false);
        return;
      }

      const zone = vmZone;
      const instanceName = 'secureagent-manager';
      
      const response = await fetch(
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}/serialPort?port=1`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setVmLogs(data.contents || 'No serial port output available yet.');
      } else {
        const err = await response.json();
        setVmLogs(`Error fetching logs: ${err.error?.message || 'Unknown error'}`);
      }
    } catch (e) {
      setVmLogs(`Error: ${e.message}`);
    }
    setLoadingVmLogs(false);
  };

  const deleteVm = async () => {
    if (!serviceAccountJson || !projectId) {
      setError('Service account and project ID required');
      return;
    }

    setDeletingVm(true);
    setError(null);
    setStep4Message('Deleting VM...');
    addStep4Log('Starting VM deletion process...');

    try {
      const token = await getServiceAccountToken();
      if (!token) {
        setError('Failed to authenticate with service account');
        setDeletingVm(false);
        return;
      }
      addStep4Log('Service account authenticated');

      const instanceName = 'secureagent-manager';
      const zones = [vmZone, 'us-central1-b', 'us-central1-c', 'us-west1-a', 'us-west1-b', 'us-east1-c', 'us-east1-d', 'europe-west1-d', 'asia-east1-a'];
      let deleted = false;

      for (const zone of zones) {
        addStep4Log(`Checking for VM in ${zone}...`);
        const checkResp = await fetch(
          `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!checkResp.ok) continue;

        addStep4Log(`Found VM in ${zone}, deleting...`);
        const deleteResp = await fetch(
          `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );

        if (deleteResp.ok) {
          addStep4Log(`VM deleted from ${zone}`);
          deleted = true;
          setVmIp('');
          setStep4Status('idle');
          setStep4Message('');
          break;
        } else {
          const err = await deleteResp.json().catch(() => ({}));
          addStep4Log(`Failed to delete in ${zone}: ${err.error?.message || 'Unknown error'}`);
        }
      }

      if (deleted) {
        addStep4Log('VM deleted successfully');
        setStep4Status('idle');
        setStep4Message('VM deleted');
      } else {
        addStep4Log('No VM found in any zone');
        setStep4Message('No VM found to delete');
      }
    } catch (e) {
      setError(`Failed to delete VM: ${e.message}`);
      addStep4Log(`Error: ${e.message}`);
    }
    setDeletingVm(false);
  };

  const tryEnableBillingApi = async () => {
    if (!projectId || !gcpAccessToken) return 'no_token';
    try {
      console.log('tryEnableBillingApi: enabling cloudbilling.googleapis.com');
      const resp = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/cloudbilling.googleapis.com:enable`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
      });
      if (resp.ok) {
        const op = await resp.json();
        if (op.name && !op.name.includes('noop')) {
          for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const opResp = await fetch(`https://serviceusage.googleapis.com/v1/${op.name}`, {
              headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
            });
            if (opResp.ok) {
              const opData = await opResp.json();
              if (opData.done) {
                console.log('tryEnableBillingApi: operation completed');
                break;
              }
            }
          }
        }
      } else {
        const errText = await resp.text().catch(() => '');
        console.log('tryEnableBillingApi: enable failed', resp.status, errText);
      }
      // Check if billing API is actually enabled now
      const checkResp = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/cloudbilling.googleapis.com`, {
        headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
      });
      if (checkResp.ok) {
        const svc = await checkResp.json();
        console.log('tryEnableBillingApi: cloudbilling state:', svc.state);
      } else {
        const errText = await checkResp.text().catch(() => '');
        console.log('tryEnableBillingApi: check state failed', checkResp.status, errText);
      }

      // Service Usage API can report ENABLED before the Cloud Billing backend honors it.
      // Poll the real endpoint until it responds with something other than SERVICE_DISABLED.
      const start = Date.now();
      const maxWait = 120000; // 2 minutes
      const delays = [2000, 4000, 8000, 15000, 30000, 30000, 30000];
      for (const delay of delays) {
        if (Date.now() - start > maxWait) break;
        const testResp = await fetch('https://cloudbilling.googleapis.com/v1/billingAccounts', {
          headers: { 'Authorization': `Bearer ${gcpAccessToken}`, 'x-goog-user-project': projectId }
        });
        if (testResp.ok) {
          console.log('tryEnableBillingApi: billing API is usable');
          return 'ready';
        }
        if (testResp.status === 403) {
          const body = await testResp.text().catch(() => '');
          if (body.includes('SERVICE_DISABLED')) {
            console.log(`tryEnableBillingApi: still SERVICE_DISABLED, waiting ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        console.log('tryEnableBillingApi: billing API test failed with', testResp.status);
        return 'error';
      }
      console.log('tryEnableBillingApi: billing API still not ready after waiting');
      return 'service_disabled';
    } catch (e) {
      console.error('tryEnableBillingApi: exception', e);
      return 'error';
    }
  };

  const checkBillingStatus = async () => {
    if (!projectId) return null;

    // E2E mode: skip real billing API call, force billing enabled
    // Must set state here too — the E2E injection effect may not have
    // committed yet (effects run in same phase, state is stale).
    if (!import.meta.env.DEV && import.meta.env.VITE_E2E === 'true') {
      setBillingEnabled(true);
      return true;
    }

    await tryEnableBillingApi();

    const tryToken = async (token) => {
      if (!token) return null;
      try {
        const response = await fetch(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`, {
          headers: { 'Authorization': `Bearer ${token}`, 'x-goog-user-project': projectId }
        });
        if (response.ok) {
          const data = await response.json();
          const enabled = !!data.billingEnabled && !!data.billingAccountName;
          setBillingEnabled(enabled);
          return enabled;
        }
        if (response.status === 401 || response.status === 403) {
          const errBody = await response.text().catch(() => '');
          if (errBody) console.log('billingInfo 403 body:', errBody.slice(0, 300));
          return 'forbidden';
        }
        await response.text().catch(() => {});
      } catch {
        return null;
      }
      return false;
    };

    if (gcpAccessToken) {
      const result = await tryToken(gcpAccessToken);
      if (result !== 'forbidden') return result;
    }

    // Fallback: try with SA token if user token lacked permissions
    const saToken = await getServiceAccountToken().catch(() => null);
    if (saToken) {
      const result = await tryToken(saToken);
      if (result !== 'forbidden') return result;
    }

    console.warn('Billing API returned 403 on both user and SA tokens — cannot determine billing status.');
    
    // Auto-fix: grant the GCP consent account's billing role and poll with backoff
    if (gcpAccessToken && projectId && (gcpConsentEmail || user?.email)) {
      console.log('checkBillingStatus: trying grantUserBillingRole');
      const granted = await grantUserBillingRole();
      console.log('checkBillingStatus: grantUserBillingRole returned', granted);
      if (granted) {
        for (let delay of [2000, 4000, 8000, 15000, 30000]) {
          await new Promise(r => setTimeout(r, delay));
          const result = await tryToken(gcpAccessToken);
          console.log(`checkBillingStatus: poll result after ${delay}ms:`, result);
          if (result !== 'forbidden') return result;
        }
      }
    }
    
    setBillingEnabled(null);
    return null;
  };

  const fetchBillingAccounts = async () => {
    setBillingApiError(null);
    const enableStatus = await tryEnableBillingApi();
    if (enableStatus === 'no_token') {
      setBillingApiError('not_connected');
      return [];
    }

    const tryBillingAccountsApi = async (token) => {
      if (!token) return null;
      const response = await fetch(`https://cloudbilling.googleapis.com/v1/billingAccounts`, {
        headers: { 'Authorization': `Bearer ${token}`, 'x-goog-user-project': projectId }
      });
      if (response.ok) {
        const data = await response.json();
        return data.billingAccounts || [];
      }
      if (response.status === 401 || response.status === 403) {
        const errBody = await response.text().catch(() => '');
        if (errBody) console.log('billingAccounts 403 body:', errBody.slice(0, 300));
        return 'forbidden';
      }
      return [];
    };

    if (gcpAccessToken) {
      const result = await tryBillingAccountsApi(gcpAccessToken);
      if (Array.isArray(result)) {
        const accounts = result;
        setBillingAccounts(accounts);
        if (accounts.length > 0) {
          setSelectedBillingAccount(accounts[0].name);
        } else {
          setBillingApiError('no_accounts');
        }
        return accounts;
      }
    }

    // Fallback 1: try SA token on current project's billingInfo
    const saToken = await getServiceAccountToken().catch(() => null);
    if (saToken && projectId) {
      try {
        const billRes = await fetch(
          `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`,
          { headers: { 'Authorization': `Bearer ${saToken}`, 'x-goog-user-project': projectId } }
        );
        if (billRes.ok) {
          const billData = await billRes.json();
          if (billData.billingAccountName && billData.billingEnabled) {
            const shortName = billData.billingAccountName.split('/').pop();
            const accounts = [{
              name: billData.billingAccountName,
              displayName: `Billing Account ${shortName} (linked)`
            }];
            setBillingAccounts(accounts);
            setSelectedBillingAccount(accounts[0].name);
            return accounts;
          }
        }
      } catch { /* skip */ }
    }

    // Fallback 2: discover via user's projects
    if (gcpAccessToken) {
      const accounts = await discoverBillingAccountsViaProjects();
      if (accounts.length > 0) {
        setBillingAccounts(accounts);
        setSelectedBillingAccount(accounts[0].name);
        return accounts;
      }
    }

    // Fallback 3: grant the GCP consent account's billing role and retry with backoff
    if (gcpAccessToken && projectId && (gcpConsentEmail || user?.email)) {
      console.log('fetchBillingAccounts: trying grantUserBillingRole');
      const granted = await grantUserBillingRole();
      console.log('fetchBillingAccounts: grantUserBillingRole returned', granted);
      if (granted) {
        // Poll billingInfo on current project with exponential backoff
        for (let delay of [2000, 4000, 8000, 15000, 30000]) {
          await new Promise(r => setTimeout(r, delay));
          const billRes = await fetch(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`, {
            headers: { 'Authorization': `Bearer ${gcpAccessToken}`, 'x-goog-user-project': projectId }
          });
          if (!billRes.ok) {
            const errBody = await billRes.text().catch(() => '');
            if (errBody) console.log(`fetchBillingAccounts: poll billingInfo 403 body (${delay}ms):`, errBody.slice(0, 300));
          }
          if (billRes.ok) {
            const billData = await billRes.json();
            if (billData.billingAccountName && billData.billingEnabled) {
              const shortName = billData.billingAccountName.split('/').pop();
              const accounts = [{ name: billData.billingAccountName, displayName: `Billing Account ${shortName} (linked)` }];
              setBillingAccounts(accounts);
              setSelectedBillingAccount(accounts[0].name);
              console.log('fetchBillingAccounts: found billing account via polling');
              return accounts;
            }
          }
          console.log(`fetchBillingAccounts: polling billingInfo attempt failed (${delay}ms), retrying...`);
        }
        const accounts = await discoverBillingAccountsViaProjects();
        console.log('fetchBillingAccounts: retry discovered', accounts.length, 'accounts');
        if (accounts.length > 0) {
          setBillingAccounts(accounts);
          setSelectedBillingAccount(accounts[0].name);
          return accounts;
        }
      }
    }

    if (enableStatus === 'service_disabled') {
      setBillingApiError('service_disabled');
    } else if (enableStatus === 'error') {
      setBillingApiError('api_error');
    } else {
      setBillingApiError('no_accounts');
    }
    return [];
  };

  const discoverBillingAccountsViaProjects = async () => {
    try {
      // Get list of projects the user has access to
      const projectsRes = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
        headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
      });
      if (!projectsRes.ok) {
        // Fallback: try SA token on just the current project
        const saToken = await getServiceAccountToken().catch(() => null);
        if (saToken && projectId) {
          return await tryDiscoverFromProjects([{ projectId }], saToken);
        }
        return [];
      }
      const projectsData = await projectsRes.json();
      const projects = projectsData.projects || [];

      // Try user token first, SA token as fallback
      const allTokens = [gcpAccessToken];
      const saToken = await getServiceAccountToken().catch(() => null);
      if (saToken && saToken !== gcpAccessToken) allTokens.push(saToken);

      for (const token of allTokens) {
        const results = await tryDiscoverFromProjects(projects.slice(0, 20), token);
        if (results.length > 0) return results;
      }
      return [];
    } catch (e) {
      console.error('Error discovering billing accounts:', e);
      return [];
    }
  };

  const tryDiscoverFromProjects = async (projects, token) => {
    if (!token) return [];
    const billingSet = new Set();
    const results = [];
    for (const project of projects) {
      try {
        const billRes = await fetch(
          `https://cloudbilling.googleapis.com/v1/projects/${project.projectId}/billingInfo`,
          { headers: { 'Authorization': `Bearer ${token}`, 'x-goog-user-project': project.projectId } }
        );
        if (billRes.ok) {
          const billData = await billRes.json();
          if (billData.billingAccountName && billData.billingEnabled && !billingSet.has(billData.billingAccountName)) {
            billingSet.add(billData.billingAccountName);
            const shortName = billData.billingAccountName.split('/').pop();
            results.push({
              name: billData.billingAccountName,
              displayName: `Billing Account ${shortName}`
            });
          }
        }
      } catch { /* skip projects that error */ }
    }
    return results;
  };

  const linkBillingAccount = async (accountName = selectedBillingAccount) => {
    const account = accountName || selectedBillingAccount || '';
    if (!projectId || !account) return;

    const tryLink = async (token) => {
      if (!token) return 'no_token';
      const response = await fetch(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-goog-user-project': projectId
        },
        body: JSON.stringify({ billingAccountName: account })
      });
      if (response.ok) return 'ok';
      if (response.status === 401 || response.status === 403) return 'forbidden';
      const err = await response.json();
      return err.error?.message || `HTTP ${response.status}`;
    };

    setLinkingBilling(true);
    setError(null);
    try {
      if (gcpAccessToken) {
        const result = await tryLink(gcpAccessToken);
        if (result === 'ok') {
          setBillingLinkedSuccess(true);
          setBillingEnabled(true);
          addNotification('Billing account linked successfully!', 'success');
          return;
        }
        if (result !== 'forbidden' && result !== 'no_token') {
          setError(result);
          return;
        }
      }

      // Fallback: try with SA token
      const saToken = await getServiceAccountToken().catch(() => null);
      if (saToken) {
        const result = await tryLink(saToken);
        if (result === 'ok') {
          setBillingLinkedSuccess(true);
          setBillingEnabled(true);
          addNotification('Billing account linked successfully!', 'success');
          return;
        }
        if (result !== 'forbidden' && result !== 'no_token') {
          setError(result);
          return;
        }
      }

      setError('Cannot link billing via API — insufficient permissions. Please link billing manually in the GCP Console, then click Refresh.');
    } catch (e) {
      console.error('Error linking billing account:', e);
      setError(e.message || 'Error linking billing account');
    } finally {
      setLinkingBilling(false);
    }
  };

  const createServiceAccountProgrammatically = async (token, gcpProjectId) => {
    const accountId = 'secureagent';
    const email = `${accountId}@${gcpProjectId}.iam.gserviceaccount.com`;
    
    try {
      const checkResp = await fetch(`https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts/${email}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (checkResp.ok) {
        return email;
      }
    } catch (e) {
      console.log('SA check failed, attempting creation...', e);
    }

    const resp = await fetch(`https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        accountId: accountId,
        serviceAccount: {
          displayName: 'SecureAgent Service Account'
        }
      })
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error?.message || 'Failed to create service account');
    }

    return email;
  };

  const addMemberToBinding = (bindings, role, member) => {
    let binding = bindings.find(b => b.role === role);
    if (!binding) {
      bindings.push({ role, members: [member] });
    } else if (!binding.members.includes(member)) {
      binding.members.push(member);
    }
  };

  const grantUserBillingRole = async (maxRetries = 5) => {
    // Grant billing.projectManager to the GCP consent account's email (the
    // account that owns the OAuth token). Falls back to the app-auth email.
    const targetEmail = gcpConsentEmail || user?.email;
    if (!gcpAccessToken || !projectId || !targetEmail) {
      console.log('grantUserBillingRole: missing deps', { hasToken: !!gcpAccessToken, projectId, hasEmail: !!targetEmail });
      return false;
    }
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log('grantUserBillingRole: fetching IAM policy for', projectId, '(attempt', attempt + 1, ')');
        const policyResp = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${gcpAccessToken}` }
        });
        if (!policyResp.ok) {
          const errText = await policyResp.text().catch(() => '');
          console.log('grantUserBillingRole: getIamPolicy failed', policyResp.status, errText);
          return false;
        }
        const policy = await policyResp.json();
        const bindings = policy.bindings || [];
        console.log('grantUserBillingRole: current bindings:', bindings.map(b => b.role));
        addMemberToBinding(bindings, 'roles/billing.projectManager', `user:${targetEmail}`);
        console.log('grantUserBillingRole: setting IAM policy (attempt', attempt + 1, ')');
        const setResp = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${gcpAccessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ policy: { bindings, etag: policy.etag } })
        });
        if (setResp.ok) {
          console.log('grantUserBillingRole: IAM policy set successfully, waiting 10s for propagation');
          await new Promise(r => setTimeout(r, 10000));
          console.log('grantUserBillingRole: propagation wait done, returning true');
          return true;
        }
        const errText = await setResp.text().catch(() => '');
        if (setResp.status === 409) {
          console.log('grantUserBillingRole: ETag conflict, will retry in', 2 ** attempt, 's');
          await new Promise(r => setTimeout(r, 2 ** attempt * 1000));
          continue;
        }
        console.log('grantUserBillingRole: setIamPolicy failed', setResp.status, errText);
        return false;
      } catch (e) {
        console.log('grantUserBillingRole: exception', e);
      }
    }
    return false;
  };

  const grantGcpRolesProgrammatically = async (token, gcpProjectId, saEmail, userEmail) => {
    // Minimal role set for the identity-only agent SA (#29): enough to create
    // the VM, read billing/secret metadata, and impersonate — no project-level
    // power (firebase.admin / workloadIdentityPoolAdmin / securityAdmin dropped).
    const roles = [
      'roles/compute.instanceAdmin.v1',
      'roles/serviceusage.serviceUsageAdmin',
      'roles/iam.serviceAccountUser',
      'roles/iam.serviceAccountTokenCreator',
      'roles/secretmanager.secretAccessor',
    ];

    const policyResp = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${gcpProjectId}:getIamPolicy`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!policyResp.ok) {
      const err = await policyResp.json();
      throw new Error(err.error?.message || 'Failed to retrieve IAM policy');
    }

    const policy = await policyResp.json();
    const bindings = policy.bindings || [];

    roles.forEach(role => {
      addMemberToBinding(bindings, role, `serviceAccount:${saEmail}`);
    });

    if (userEmail) {
      addMemberToBinding(bindings, 'roles/firebase.admin', `user:${userEmail}`);
      addMemberToBinding(bindings, 'roles/billing.projectManager', `user:${userEmail}`);
      // Operator needs full Secret Manager control to create secrets, add
      // versions, and bind per-secret accessors during the VM setup (map #36).
      addMemberToBinding(bindings, 'roles/secretmanager.admin', `user:${userEmail}`);
    }

    const setResp = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${gcpProjectId}:setIamPolicy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ policy: { bindings, etag: policy.etag } })
    });

    if (!setResp.ok) {
      const err = await setResp.json();
      throw new Error(err.error?.message || 'Failed to set IAM policy');
    }

    return policy;
  };

  const grantAgentSaTokenCreator = async (token, gcpProjectId, godSaEmail) => {
    const agentSaEmail = `secureagent-manager@${gcpProjectId}.iam.gserviceaccount.com`;
    const member = `serviceAccount:${agentSaEmail}`;

    const maxAttempts = 6;
    const initialDelay = 2000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const policyResp = await fetch(
          `https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts/${encodeURIComponent(godSaEmail)}:getIamPolicy`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );

        if (!policyResp.ok) {
          const errBody = await policyResp.text().catch(() => '');
          if (errBody.includes('404') || policyResp.status === 404) {
            if (attempt < maxAttempts - 1) {
              const delay = initialDelay * Math.pow(2, attempt);
              console.warn(`IAM policy fetch 404 (attempt ${attempt + 1}), retrying in ${delay}ms...`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
          }
          console.warn('grantAgentSaTokenCreator skipped:', policyResp.status, errBody);
          return;
        }

        const policy = await policyResp.json();
        const bindings = policy.bindings || [];
        addMemberToBinding(bindings, 'roles/iam.serviceAccountTokenCreator', member);

        const setResp = await fetch(
          `https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts/${encodeURIComponent(godSaEmail)}:setIamPolicy`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ policy: { bindings, etag: policy.etag } })
          }
        );

        if (!setResp.ok) {
          const errBody = await setResp.text().catch(() => '');
          console.warn('grantAgentSaTokenCreator setIamPolicy skipped:', setResp.status, errBody);
          return;
        }

        return;
      } catch (e) {
        if (attempt < maxAttempts - 1) {
          const delay = initialDelay * Math.pow(2, attempt);
          console.warn(`IAM grant error (attempt ${attempt + 1}), retrying in ${delay}ms...`, e);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.error('Failed to grant agent SA tokenCreator on God SA:', e);
        }
      }
    }
  };

  const deleteExistingServiceAccountKeys = async (token, gcpProjectId, saEmail) => {
    const listResp = await fetch(`https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts/${saEmail}/keys`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!listResp.ok) return;

    const listData = await listResp.json();
    const keys = listData.keys || [];

    for (const key of keys) {
      if (key.keyType === 'USER_MANAGED') {
        await fetch(`https://iam.googleapis.com/v1/${key.name}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    }
  };

  const generateServiceAccountKeyProgrammatically = async (token, gcpProjectId, saEmail) => {
    await deleteExistingServiceAccountKeys(token, gcpProjectId, saEmail);

    const resp = await fetch(`https://iam.googleapis.com/v1/projects/${gcpProjectId}/serviceAccounts/${saEmail}/keys`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error?.message || 'Failed to generate service account key');
    }

    const keyData = await resp.json();
    const decodedKey = window.atob(keyData.privateKeyData);
    return JSON.parse(decodedKey);
  };

  const handleAutoGenerateServiceAccount = async (targetProjectId) => {
    if (!gcpAccessToken) {
      setError('Please sign in to Google (Step 3) to enable auto-generation.');
      return;
    }
    const errors = validate({ projectId: targetProjectId }, { projectId: SCHEMAS.projectId });
    if (errors) {
      setError(errors.projectId);
      return;
    }
    if (!saRateLimit.check()) {
      setError('Rate limit reached for service account creation. Try again in a minute.');
      return;
    }
    setAutoGeneratingSa(true);
    setSaAutoProgress('Creating service account...');
    setError(null);

    try {
      const token = gcpAccessToken;
      const saEmail = await createServiceAccountProgrammatically(token, targetProjectId);
      
      setSaAutoProgress('Assigning IAM permissions (this takes a few seconds)...');
      await grantGcpRolesProgrammatically(token, targetProjectId, saEmail, gcpConsentEmail || user?.email);

      setSaAutoProgress('Granting agent SA impersonation access...');
      await grantAgentSaTokenCreator(token, targetProjectId, saEmail);

      // Identity-only agent service account: no key file is generated. The
      // wizard operates entirely on the operator's Google OAuth token (the
      // SA-key upload path is gone), so the agent SA is created for IAM
      // purposes only and never produces a private key.
      setGodSaEmail(saEmail);
      setProjectId(targetProjectId);
      setSaAutoProgress('');
      
      await saveConfig({
        gcp_project_id: targetProjectId,
      });
      
      addOidcLog('Agent service account created and configured successfully!');
      addNotification('Agent service account created and configured successfully!', 'success');
    } catch (e) {
      console.error(e);
      setError('Auto-generation failed: ' + e.message);
      setSaAutoProgress('');
    } finally {
      setAutoGeneratingSa(false);
    }
  };

  // Step navigation + completion selectors come from the wizardProgress hook
  // (see useWizardProgress). The legacy inline implementations lived here as
  // 5 separate functions reading 8 loose signals; they are now pure selectors
  // on the reducer state, unit-tested in wizard-progress.test.js.
  const {
    isStepCompleted,
    isStepLocked,
    isStepActive,
    toggleStep,
    editStep,
    expandNextStep,
  } = wizard;

  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [enablingApis, setEnablingApis] = useState(false);
  const [deletingVm, setDeletingVm] = useState(false);

  const fetchGcpProjects = async (token) => {
    setGcpProjectsLoading(true);
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
      setGcpProjectsLoading(false);
    }
    return [];
  };

  const GCP_OAUTH_SCOPES = 'openid email https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/cloud-billing.readonly';

  // Shared handler for a GCP OAuth token response (manual consent flow and the
  // silent refresh). Stores the token, refreshes the project list, and
  // repopulates Discord/GitHub tokens from Secret Manager so steps 1-2 stay
  // complete with the keys entered.
  const handleGcpOAuthResponse = async (response, { silent = false } = {}) => {
    if (response.error) {
      if (silent) {
        // Silent refresh failed (e.g. no prior consent or expired Google
        // session) — the manual connect button on step 3 remains the path.
        console.info('Silent Google token refresh unavailable:', response.error);
        return;
      }
      console.error('Google OAuth error:', response.error);
      setError('Failed to connect to Google');
      return;
    }
    const grantedScopes = response.scope || '';
    console.log('GCP OAuth granted scopes:', grantedScopes);
    if (!grantedScopes.includes('cloud-platform') && !grantedScopes.includes('devstorage')) {
      console.warn('cloud-platform scope not granted — token may be restricted');
      if (!silent) {
        setError('Google OAuth did not grant cloud-platform access. Try reconnecting and selecting an account with GCP billing access.');
      }
    }
    // The consent account's email (granted via openid email) is the
    // account we grant IAM roles to — NOT the app-auth account (which
    // may be a different Google account or absent entirely).
    const consentEmail = (response as any).email || '';
    setGcpConsentEmail(consentEmail);
    setGcpEmailMismatch(!!(user?.email && consentEmail && user.email !== consentEmail));
    setGcpAccessToken(response.access_token);
    setGcpTokenExpiry(Date.now() + (((response as any).expires_in || 3600) - 60) * 1000);
    setGcpConnected(true);
    setGcpConfigLost(false);

    const projects = await fetchGcpProjects(response.access_token);
    if (!silent) expandNextStep(3);

    if (user) {
      try {
        await safeSet(db, INFRA_COLLECTION, user.uid, {
          gcp_connected: true,
          gcp_token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, user.uid, { allowFields: ['gcp_connected', 'gcp_token_expiry', 'updated_at'], merge: true });
      } catch (err) {
        console.error('Error auto-saving GCP connection state:', err);
      }
    }
  };

  const getGoogleOAuthClient = (prompt) => {
    const clientId = import.meta.env.VITE_GCP_CLIENT_ID;
    if (!clientId) {
      setError('GCP Client ID not configured. Add VITE_GCP_CLIENT_ID to .env.local');
      return null;
    }
    const googleClient = (window as unknown as { google?: { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; prompt?: string; callback: (response: { error?: string; access_token?: string; scope?: string }) => void }) => { open(): void; requestAccessToken(): void } } } } }).google;
    if (!googleClient) return null;
    return googleClient.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GCP_OAUTH_SCOPES,
      prompt,
      callback: (response) => { void handleGcpOAuthResponse(response); },
    });
  };

  const initGoogleOAuth = (): { open(): void; requestAccessToken(): void } | null => {
    return getGoogleOAuthClient('consent select_account');
  };

  // Try to refresh the GCP token silently (prior consent + active Google
  // session in the browser) so config AND tokens restore without re-consenting.
  // Best-effort: on interaction_required it falls back to the manual
  // "Connect Google Cloud Account" button (step 3).
  const silentGcpTokenRefresh = async () => {
    if (e2eInjectedRef.current) return;
    if (gcpAccessToken) return;
    const clientId = import.meta.env.VITE_GCP_CLIENT_ID;
    if (!clientId) return;
    // The gsi client script is loaded async in index.html — wait for it.
    for (let i = 0; i < 25; i++) {
      const google = (window as unknown as { google?: { accounts?: { oauth2?: unknown } } }).google;
      if (google?.accounts?.oauth2) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const client = getGoogleOAuthClient('');
    if (!client) return;
    try {
      client.requestAccessToken();
    } catch (e) {
      console.info('Silent Google token refresh failed:', e);
    }
  };

  useEffect(() => {
    if (gcpProjects.length > 0 && !autoGenProjectId) {
      setAutoGenProjectId(gcpProjects[0].projectId);
    }
  }, [gcpProjects, autoGenProjectId]);

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
          setBillingChecking(true);
          await checkBillingStatus();
          setBillingChecking(false);
          expandNextStep(3);
          setNewProjectName('');
          // Refresh the project list and pre-select it in the auto-generation
          // dropdown so the just-created/reused project is immediately usable.
          setAutoGenProjectId(projectIdVal);
          await fetchGcpProjects(gcpAccessToken);
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
      
      setBillingChecking(true);
      await checkBillingStatus();
      setBillingChecking(false);
      expandNextStep(3);
      setNewProjectName('');
      // Refresh the project list and pre-select the new project in the
      // auto-generation dropdown (it is not in the list fetched at connect
      // time, so without this the operator can't auto-gen against it).
      setAutoGenProjectId(projectIdVal);
      await fetchGcpProjects(gcpAccessToken);
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
      { name: 'secretmanager.googleapis.com', displayName: 'Secret Manager API' },
      { name: 'cloudbilling.googleapis.com', displayName: 'Cloud Billing API' },
      { name: 'iamcredentials.googleapis.com', displayName: 'IAM Service Account Credentials API' }
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

  const handleConnectGoogle = () => {
    const client = initGoogleOAuth();
    if (client) {
      client.requestAccessToken();
    }
  };

  // E2E test injection: load credentials from URL params (base64-encoded)
  // or sessionStorage (set by Playwright addInitScript to avoid address bar leakage).
  // SECURITY: gated out of production builds. Staging e2e builds set VITE_E2E=true.
  useEffect(() => {
    if (!import.meta.env.DEV && import.meta.env.VITE_E2E !== 'true') return;
    const params = new URLSearchParams(window.location.search);
    const fromStorage = (key) => {
      try { return sessionStorage.getItem(key); } catch { return null; }
    };
    const read = (key) => params.get(key) || fromStorage(key);
    const e2eSA = read('__e2e_sa');
    const e2eToken = read('__e2e_token');
    const e2eProjectId = read('__e2e_project_id');
    const e2eFirebaseStaging = read('__e2e_firebase_staging');
    const e2eFirebaseProd = read('__e2e_firebase_production');
    const e2eGithubPat = read('__e2e_github_pat');
    const e2eProjectName = read('__e2e_project_name');
    const e2eGithubRepo = read('__e2e_github_repo');
    const e2eDiscordToken = read('__e2e_discord_token');
    const e2eDiscordGuild = read('__e2e_discord_guild');
    const e2eDiscordBotAdded = read('__e2e_discord_bot_added');
    const e2eBillingEnabled = read('__e2e_billing_enabled');

    if (e2eSA) {
      try {
        const saJson = JSON.parse(atob(e2eSA));
        if (saJson.private_key) {
          setServiceAccountJson(saJson);
          setGodSaEmail(saJson.client_email || (saJson.project_id ? `secureagent@${saJson.project_id}.iam.gserviceaccount.com` : null));
          if (saJson.project_id) setProjectId(saJson.project_id);
        }
      } catch (e) {
        console.warn('E2E: Failed to parse __e2e_sa param:', e);
      }
    }
    if (e2eProjectId) {
      setProjectId(e2eProjectId);
    }
    if (e2eToken) {
      try {
        setGcpAccessToken(atob(e2eToken));
      } catch (e) {
        console.warn('E2E: Failed to decode __e2e_token param:', e);
      }
    }
    if (e2eFirebaseStaging) {
      try {
        const config = JSON.parse(atob(e2eFirebaseStaging));
        setFirebaseConfigStaging(JSON.stringify(config, null, 2));
        setFirebaseStagingData(config);
      } catch (e) {
        console.warn('E2E: Failed to parse __e2e_firebase_staging:', e);
      }
    }
    if (e2eFirebaseProd) {
      try {
        const config = JSON.parse(atob(e2eFirebaseProd));
        setFirebaseConfigProduction(JSON.stringify(config, null, 2));
        setFirebaseProductionData(config);
      } catch (e) {
        console.warn('E2E: Failed to parse __e2e_firebase_production:', e);
      }
    }
    if (e2eGithubPat) {
      try {
        setGithubPat(atob(e2eGithubPat));
      } catch (e) {
        console.warn('E2E: Failed to decode __e2e_github_pat:', e);
      }
    }
    if (e2eProjectName) {
      try {
        const decoded = atob(e2eProjectName);
        setProjectName(decoded);
      } catch (e) {
        console.warn('E2E: Failed to decode __e2e_project_name:', e);
      }
    }
    if (e2eGithubRepo) {
      try {
        const decoded = atob(e2eGithubRepo);
        setGithubRepoName(decoded);
      } catch (e) {
        console.warn('E2E: Failed to decode __e2e_github_repo:', e);
      }
    }
    if (e2eDiscordToken) {
      try {
        setDiscordBotToken(atob(e2eDiscordToken));
      } catch (e) {
        console.warn('E2E: Failed to decode __e2e_discord_token:', e);
      }
    }
    if (e2eDiscordGuild) {
      try {
        setDiscordGuildId(atob(e2eDiscordGuild));
      } catch (e) {
        console.warn('E2E: Failed to decode __e2e_discord_guild:', e);
      }
    }
    if (e2eDiscordBotAdded) {
      try {
        const val = atob(e2eDiscordBotAdded);
        if (val === 'true' || val === '1') {
          setDiscordBotAdded(true);
        }
      } catch (e) {
        console.warn('E2E: Failed to decode __e2e_discord_bot_added:', e);
      }
    }
    if (e2eBillingEnabled) {
      try {
        const val = atob(e2eBillingEnabled);
        if (val === 'true' || val === '1') {
          setBillingEnabled(true);
        }
      } catch (e) {
        console.warn('E2E: Failed to decode __e2e_billing_enabled:', e);
      }
    }

    // Capability-only injections (GCP access token, project id, billing flag)
    // do NOT flip the e2e flag: they only stand in for a connected Google
    // account, so the REAL sync/restore/config-restore paths still run against
    // live credentials (token-persistence regression test). Only actual
    // credential injections (SA key, Firebase configs, PAT, Discord
    // token/guild/bot-added) mark the session as e2e-injected and skip those
    // paths.
    const hasE2eCredentials = !!(e2eSA || e2eFirebaseStaging || e2eFirebaseProd || e2eGithubPat || e2eDiscordToken || e2eDiscordGuild || e2eDiscordBotAdded);
    if (hasE2eCredentials) {
      console.log('E2E mode active: credentials injected from URL params');
      setE2eInjected(true);
      e2eInjectedRef.current = true;
    }
  }, []);

  // E2E auto-setup: once githubPat + githubRepoName are injected, automatically
  // run OIDC setup + upload GitHub variables (Steps 5-6 are skipped in e2e).
  // The fine-grained PAT can't set variables (403), so the wizard must do it.
  // SECURITY/UX: gated on e2eInjected (real e2e credentials present in the
  // URL/sessionStorage), NOT on isE2EMode — deploy builds ship VITE_E2E=true
  // so the Playwright gate works, and a real user's session would otherwise
  // auto-run OIDC the moment Google connects, against an incomplete project
  // state (empty projectId → 400 INVALID_ARGUMENT on `projects//...` URLs),
  // racing the operator's input. Real users set up OIDC via the explicit
  // "Save & Setup OIDC Deployment" button.
  const e2eOidcDoneRef = useRef(false);
  useEffect(() => {
    if (e2eOidcDoneRef.current) return;
    if (!e2eInjected) return;
    if (!githubPat || !githubRepoName || !gcpAccessToken) return;
    if (!firebaseStagingData && !firebaseProductionData) return;

    e2eOidcDoneRef.current = true;
    console.log(`E2E: Auto-setting up OIDC + uploading GitHub vars for ${githubRepoName}...`);

    (async () => {
      try {
        const oidcData = await setupOidcInfrastructure(githubRepoName);
        if (oidcData) {
          console.log('E2E: OIDC setup complete, uploading GitHub vars...');
          await uploadGitHubVars(oidcData);
          console.log('E2E: GitHub vars uploaded successfully');
        } else {
          console.warn('E2E: OIDC setup returned null — variables not uploaded');
        }
      } catch (err) {
        console.error('E2E: Failed to auto-setup OIDC:', err);
      }
    })();
  }, [e2eInjected, githubPat, githubRepoName, gcpAccessToken, firebaseStagingData, firebaseProductionData]);

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
      if (formProgress.vmHttpsUrl) setVmHttpsUrl(formProgress.vmHttpsUrl);
      if (formProgress.expandedSteps) wizard.dispatch({ type: 'SET_EXPANDED', steps: formProgress.expandedSteps });
      // Note: serviceAccountJson is NOT restored from storage since it contains sensitive private_key
      // User must re-upload the service account JSON each session
      if (formProgress.projectId) setProjectId(formProgress.projectId);
    }
    setFormProgressLoaded(true);
  }, []);

  useEffect(() => {
    if (!formProgressLoaded) return;
    
    if (!import.meta.env.DEV) return;
    const formData = {
      firebaseConfigStaging,
      firebaseConfigProduction,
      githubPat: githubPat ? 'saved' : null,
      discordBotToken: discordBotToken ? 'saved' : null,
      discordGuildId,
      expandedSteps,
      serviceAccountJson: serviceAccountJson ? 'saved' : null,
      projectId,
      godSaEmail,
      gcpAccessToken: gcpAccessToken ? 'saved' : null,
    };
    saveFormProgress(formData);
  }, [formProgressLoaded, firebaseConfigStaging, firebaseConfigProduction, githubPat, discordBotToken, discordGuildId, expandedSteps, serviceAccountJson, projectId, godSaEmail, gcpAccessToken]);

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
        // E2E injection sets projectId from URL params; don't overwrite with a
        // stale Firestore value (e.g. empty string) that would break the VM
        // creation guard (`if (!serviceAccountJson || !projectId)`) and block
        // the e2e test. Deploy builds ship VITE_E2E=true, so isE2EMode is true
        // for real users too — gate on e2eInjectedRef instead (real credentials
        // injected), otherwise real users would lose their saved config on load.
        if (!e2eInjectedRef.current) setProjectId(configData.gcp_project_id || '');
        // GCP access token is NOT restored — it's short-lived (~1h) and
        // gcpTokenExpiry can't be restored either, so getAccessToken() can't
        // tell if it's valid. The user clicks "Connect Google Cloud Account"
        // to get a fresh token when needed.
        setGithubAppInstalled(configData.github_app_installed || false);
        // vm_ip is NOT restored when real e2e credentials are injected: it
        // marks step 3 complete and replaces the "Create VM" button with the
        // VM-management view. The shared e2e user's Firestore doc carries a
        // stale vm_ip from earlier runs, which would hide the Create button
        // and fail the wizard test. E2E mode always creates a fresh VM, so the
        // IP is never needed on load.
        if (!e2eInjectedRef.current) setVmIp(configData.vm_ip || '');
        // discord_bot_token intentionally NOT restored from Firestore (GHSA-x49w).
        // Restored from browser storage in the dedicated mount effect below.
        setDiscordGuildId(configData.discord_guild_id || configData.discordGuildId || '');
        // discord_bot_added intentionally NOT restored from Firestore — the
        // wizard should start with step 1 incomplete each time. The user
        // re-enters their bot token and clicks "Create Bot" to complete it.
        // E2E injection still sets it via URL params.
        // Firebase configs intentionally NOT restored from Firestore.
        // The wizard re-runs Firebase setup on each session — pre-populating
        // with stale data from a prior run causes confusion and 400 errors.
        // E2E injection still sets them via URL params.
        // github_pat intentionally NOT restored from Firestore (GHSA-x49w).
        // Restored from browser storage in the dedicated mount effect below.
        
        // Restore OIDC values so Step 7 can build VM metadata on reload
        if (configData.gcp_wif_provider) setGcpWifProviderName(configData.gcp_wif_provider);
        if (configData.gcp_sa_staging) setGcpSaStagingEmail(configData.gcp_sa_staging);
        if (configData.gcp_sa_production) setGcpSaProductionEmail(configData.gcp_sa_production);
        if (configData.github_repo) setGithubRepoName(configData.github_repo);
        
        // Restore operator-entered secrets (Discord token, GitHub PAT, SA key)
        // happens in a dedicated mount effect (below) that reads browser
        // storage directly — deliberately NOT gated on this Firestore fetch,
        // so a slow/unreachable Firestore backend can't delay the restore.
        // Not Firestore (GHSA-x49w).

        // Note: service_account_key is NOT restored from Firestore (private_key
        // sensitive) — browser-storage restore covers the same-tab/fresh-tab
        // cases (see the dedicated mount effect).

        if (!e2eInjectedRef.current && configData.god_sa_email) setGodSaEmail(configData.god_sa_email);

        // Stale vm_ip must not expand step 3 when e2e credentials are injected
        // (see above).
        if (!e2eInjectedRef.current && configData.vm_ip && !expandedSteps.includes(3)) {
          wizard.dispatch({ type: 'EXPAND_STEP', step: 3 });
        }

        if (configData.gcp_project_id && !configData.gcp_access_token) {
          setGcpConfigLost(true);
        }
      }

      // Signed in via step 0 but no GCP token yet: try a silent Google token
      // refresh (prior consent) so the saved config AND Secret Manager tokens
      // restore without the operator re-consenting on step 3. Falls back to
      // the manual connect button when the browser has no Google session.
      if (!e2eInjectedRef.current && configData?.gcp_project_id) {
        void silentGcpTokenRefresh();
      }

      setLoading(false);
      setCheckingCompletion(false);
    };

    loadInfraConfig();
  }, [db, user]);

  // NOTE: Auto-collapse of completed steps was removed — it collapsed step 3
  // on sign-in when vm_ip was restored from Firestore, confusing the operator.
  // Users control step expansion manually via the accordion headers.

  const handleCopyScript = () => {
    navigator.clipboard.writeText(CloudShellScript({ projectId }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    // Auto-expand step 1 (Discord) on mount. Deliberately mount-only.
    if (!expandedSteps.includes(1) && isStepLocked(1) === false) {
      wizard.dispatch({ type: 'EXPAND_STEP', step: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!vmIp) return;
    
    // Auto-refresh VM logs to detect Kimaki OAuth URL
    const pollVmLogs = async () => {
      if (!serviceAccountJson || !projectId) return;
      
      try {
        const token = await getServiceAccountToken();
        if (!token) return;

        const zone = vmZone;
        const instanceName = 'secureagent-manager';
        
        const response = await fetch(
          `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}/serialPort?port=1`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          const logs = data.contents || '';
          
          // Keep a short tail for the init modal
          setVmInitLogTail(logs.split('\n').slice(-12).join('\n'));

          // Parse Kimaki OAuth URL from serial port output
          const oauthUrlMatch = logs.match(/KIMAKI_OAUTH_URL=(https:\/\/discord\.com\/oauth2\/authorize[^"\s]*)/);
          if (oauthUrlMatch && oauthUrlMatch[1] && !kimakiInstallUrl) {
            console.log('Found Kimaki OAuth URL in serial port:', oauthUrlMatch[1]);
            setKimakiInstallUrl(oauthUrlMatch[1]);
          }
          
          // Detect completion marker emitted by the startup script
          if (logs.includes('=== Kimaki installation complete! ===')) {
            setVmInitComplete(true);
          }
          
          // Detect Discord bot online marker from kimaki-register.service
          if (logs.includes('KIMAKI_BOT_ONLINE')) {
            setBotOnline(true);
          }
          
          // Check for setup pending
          const setupPending = logs.includes('KIMAKI_SETUP_PENDING');
          if (setupPending) {
            console.log('Kimaki setup is pending');
          }
        }
      } catch (e) {
        console.error('VM log polling error:', e);
      }
    };
    
    const interval = setInterval(pollVmLogs, 10000);
    pollVmLogs();
    
    return () => clearInterval(interval);
  }, [vmIp, projectId, vmZone, serviceAccountJson]);

  // Clean up God SA long-lived key once VM initialization is complete
  useEffect(() => {
    if (!vmInitComplete || !gcpAccessToken || !projectId || !godSaEmail) return;
    deleteExistingServiceAccountKeys(gcpAccessToken, projectId, godSaEmail).catch(e =>
      console.error('Failed to clean up God SA key:', e)
    );
  }, [vmInitComplete, gcpAccessToken, projectId, godSaEmail]);

  // Poll staging URL after VM init completes
  useEffect(() => {
    if (!vmInitComplete) return;
    const stagingProjectId = firebaseStagingData?.projectId;
    if (!stagingProjectId) return;

    const checkStagingDeploy = async () => {
      try {
        const res = await fetch(`https://${stagingProjectId}.web.app`, { method: 'HEAD', mode: 'no-cors' });
        // no-cors HEAD returns opaque (status 0) on success — that's fine
        setStagingDeployed(true);
      } catch {
        // Site not reachable yet
      }
    };

    checkStagingDeploy();
    const interval = setInterval(checkStagingDeploy, 30000);
    return () => clearInterval(interval);
  }, [vmInitComplete, firebaseStagingData?.projectId]);

  // Auto-generate Discord invite URL when token is loaded from storage
  useEffect(() => {
    if (!discordBotToken || discordInviteUrl || !discordClientId) return;

    // Generate invite URL using manually entered Client ID
    const url = buildDiscordInviteUrl(discordClientId);
    setDiscordInviteUrl(url);
    console.log('Discord invite URL regenerated from saved token and client ID');
  }, [discordBotToken, discordClientId]);

  // Check billing when the GCP step opens
  useEffect(() => {
    if (expandedSteps.includes(3) && projectId && gcpAccessToken) {
      setBillingChecking(true);
      (async () => {
        await checkBillingStatus();
        await fetchBillingAccounts();
      })().catch(() => {}).finally(() => setBillingChecking(false));
    }
  }, [expandedSteps, gcpAccessToken, projectId]);

  const saveConfig = async (configData) => {
    const finalData = {
      ...configData,
      // Never persist an empty project id — an auto-save firing before the
      // operator enters the ID would restore as '' and later produce
      // `projects//...` GCP URLs (400 INVALID_ARGUMENT). Absent key = merge
      // keeps the previously stored value.
      ...(projectId.trim() ? { gcp_project_id: projectId.trim() } : {}),
      github_app_installed: githubAppInstalled,
      github_repo: githubRepoName,
      god_sa_email: godSaEmail,
      // Explicit vm_ip in configData wins over state — handleManualVMIP sets
      // state asynchronously and would otherwise persist a stale/empty value.
      vm_ip: configData.vm_ip !== undefined ? configData.vm_ip : vmIp,
      firebase_staging_project_id: firebaseStagingData?.projectId || null,
      firebase_production_project_id: firebaseProductionData?.projectId || null,
      updated_at: new Date().toISOString(),
    };

    if (user) {
      await safeSet(db, INFRA_COLLECTION, user.uid, finalData, user.uid, {
        allowFields: [
          'gcp_project_id', 'gcp_connected', 'gcp_token_expiry',
          'service_account_email', 'service_account_project_id',
          'github_app_installed', 'god_sa_email', 'vm_ip', 'github_repo',
          'firebase_staging', 'firebase_production',
          'firebase_staging_project_id', 'firebase_production_project_id',
          'gcp_wif_provider', 'gcp_sa_staging', 'gcp_sa_production',
          'sm_secrets', 'discord_client_id', 'discord_guild_id',
          'discord_bot_added', 'updated_at'
        ],
        merge: true
      });
      localStorage.removeItem(LOCALSTORAGE_KEY);
    } else {
      saveToLocalStorage(finalData);
    }
  };

  // When the operator switches to a different GCP project, clear the
  // Discord token, GitHub PAT, and related state so steps 1-2 start empty
  // for the new project.
  //
  // Gate: only fires AFTER loadInfraConfig finishes (loading→false).
  // During the initial load, injection and the config doc can both set
  // projectId to different values — clearing on that transient mismatch
  // would wipe freshly-entered tokens mid-test. The wasLoadingRef
  // captures the config-loaded projectId as the baseline so the very
  // first post-load render never clears.
  const prevProjectIdForClearRef = useRef('');
  const wasLoadingRef = useRef(true);
  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      return;
    }
    // First render after config loads: snapshot the baseline, don't clear.
    if (wasLoadingRef.current) {
      wasLoadingRef.current = false;
      prevProjectIdForClearRef.current = projectId;
      return;
    }
    const prev = prevProjectIdForClearRef.current;
    prevProjectIdForClearRef.current = projectId;
    if (prev !== projectId && prev.trim()) {
      setDiscordBotToken('');
      setDiscordBotTokenInput('');
      setDiscordClientId('');
      setGithubPat('');
      setDiscordBotAdded(false);
    }
  }, [projectId, loading]);

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your infrastructure? This will clear all local setups.')) {
      return;
    }

    try {
      if (user) {
        await safeDelete(db, INFRA_COLLECTION, user.uid, user.uid);
      }
      localStorage.removeItem(LOCALSTORAGE_KEY);
      localStorage.removeItem(FORM_PROGRESS_KEY);
      
      setProjectId('');
      setGcpConnected(false);
      setGcpAccessToken(null);
      setServiceAccountJson(null);
      setServiceAccountError(null);
      setVmIp('');
      setDiscordBotToken('');
      setDiscordBotTokenInput('');
      setDiscordClientId('');
      setDiscordInviteUrl('');
      setDiscordGuildId('');
      setGithubAppInstalled(false);
      setGithubPat('');
      setGithubRepoName('');
      setFirebaseConfigStaging('');
      setFirebaseConfigProduction('');
      setFirebaseStagingData({});
      setFirebaseProductionData({});
      
      setProjectName('');
      
      setGcpConfigLost(false);
      setGcpConsentEmail('');
      setGcpEmailMismatch(false);
      
      wizard.dispatch({ type: 'CLEAR' });
      setError(null);
      
      addNotification('Infrastructure disconnected successfully!', 'success');
    } catch (err) {
      console.error('Error disconnecting:', err);
      setError('Failed to disconnect');
    }
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
    if (!firebaseRateLimit.check()) {
      setError('Rate limit reached for Firebase setup. Try again in a minute.');
      return;
    }
    
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
    
    wizard.dispatch({ type: 'EXPAND_STEP', step: 3 });
    try {
      await saveConfig({
        firebase_staging: stagingConfig,
        firebase_production: productionConfig,
      });
    } catch (err) {
      console.error('Error saving Firebase config:', err);
    }
  };

  const buildVmMetadata = (startupScript: string) => {
    const items = [
      { key: 'startup-script', value: startupScript },
      { key: 'github_repo', value: githubRepoName || projectName || 'SecureAgentBase' },
      { key: 'discord_guild_id', value: discordGuildId || '' },
      { key: 'firebase_staging', value: firebaseStagingData?.projectId || '' },
      { key: 'firebase_production', value: firebaseProductionData?.projectId || '' },
      { key: 'gcp_wif_provider', value: gcpWifProviderName || '' },
      { key: 'gcp_sa_staging', value: gcpSaStagingEmail || '' },
      { key: 'gcp_sa_production', value: gcpSaProductionEmail || '' },
      { key: 'firebase_staging_config', value: firebaseStagingData ? JSON.stringify(firebaseStagingData) : '' },
      { key: 'firebase_production_config', value: firebaseProductionData ? JSON.stringify(firebaseProductionData) : '' },
      { key: 'vite_app_name', value: projectName || 'MyApp' },
      { key: 'serial-port-enable', value: 'TRUE' },
      { key: 'enable-oslogin', value: 'false' },
    ];
    return { items };
  };

  // Map #36: persist GitHub PAT + Discord bot token to Secret Manager (never
  // Firestore) so the VM can boot with secrets fetched via the metadata server
  // identity. Returns the secret resource names for Firestore refs only.
  // Accessors are per-secret and least-privilege: the operator's Google
  // account, the identity-only agent SA (the VM's intended identity), and the
  // project's default compute SA (fallback identity for VMs created without an
  // explicit SA — legacy/e2e flows).
  const projectNumberRef = useRef<string | null>(null);
  const getProjectNumber = async (token) => {
    if (projectNumberRef.current) return projectNumberRef.current;
    try {
      const proj = await gcpApiFetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`, token);
      if (proj.projectNumber) {
        projectNumberRef.current = String(proj.projectNumber);
      }
    } catch (e) {
      console.warn('Failed to fetch project number:', e.message);
    }
    return projectNumberRef.current;
  };

  const writeSecretsToSecretManager = async (token, log) => {
    const refs: Record<string, string> = {};
    const members = [];
    if (gcpConsentEmail) members.push(`user:${gcpConsentEmail}`);
    if (godSaEmail) members.push(`serviceAccount:${godSaEmail}`);
    const projectNumber = await getProjectNumber(token);
    if (projectNumber) members.push(`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`);
    if (githubPat || discordBotToken) {
      // The VM boots with a service account and fetches these secrets via the
      // metadata-server identity. If NO ONE has secretAccessor, the VM silently
      // gets empty secrets and never pushes — fail fast instead of creating a
      // broken VM. (e2e/legacy flows have no Google sign-in or god SA, so the
      // default compute SA below is their only accessor — it must resolve.)
      if (members.length === 0) {
        throw new Error('Cannot store secrets in Secret Manager: no service account granted access. Connect Google Cloud (Step 3) first.');
      }
    }
    if (githubPat) {
      refs.github_pat = await smWriteSecret(token, projectId, 'github-pat', githubPat, members, log);
    }
    if (discordBotToken) {
      refs.discord_bot_token = await smWriteSecret(token, projectId, 'discord-bot-token', discordBotToken, members, log);
    }
    return refs;
  };

  const createVmWithSetup = async ({ isRecreate = false } = {}) => {
    const log = (msg) => addStep4Log(msg);
    const processLabel = isRecreate ? 'recreation' : 'creation';

    if (!projectId || !gcpAccessToken) {
      setError('GCP project and Google Cloud connection required');
      return;
    }
    if (!vmRateLimit.check()) {
      setError('Rate limit reached for VM creation. Try again in a minute.');
      return;
    }
    const errors = validate({ projectId }, { projectId: SCHEMAS.projectId });
    if (errors) {
      setError(errors.projectId);
      return;
    }
    if (!discordGuildId) {
      log('WARNING: Discord Guild ID not set - Discord channel will not be created');
    }

    setStep4Status('enabling');
    if (!isRecreate) {
      setStep4Message('Clearing previous VM state...');
      log('Clearing previous VM state...');
      setVmIp('');
    }
    setStep4Message('Checking billing status...');
    log(`Starting VM ${processLabel} process...`);

    // Check billing with user's OAuth token first. Billing must be linked
    // manually (or via the Billing section above) — the wizard never
    // auto-links an account on the operator's behalf.
    const billingOk = await checkBillingStatus();
    if (billingOk === null) {
      log('Billing API not accessible, skipping auto-check');
    } else if (billingOk === true) {
      log('Billing is enabled');
    } else {
      log('Billing not enabled - operator must link a billing account first');
      setError(`Billing is required. Link a billing account at https://console.cloud.google.com/billing/linkedaccount?project=${projectId} then retry.`);
      setStep4Status('error');
      return;
    }

    setStep4Message('Getting Google Cloud access token...');
    log('Authenticating with Google Cloud...');

    const token = await getAccessToken();
    if (!token) {
      setError('Failed to authenticate with Google Cloud. Reconnect your Google account in Step 3.');
      setStep4Status('error');
      return;
    }
    log('Google Cloud authenticated');

    const apis = [
      { name: 'compute.googleapis.com', displayName: 'Compute Engine API' },
      { name: 'cloudresourcemanager.googleapis.com', displayName: 'Cloud Resource Manager API' },
      { name: 'serviceusage.googleapis.com', displayName: 'Service Usage API' },
      { name: 'secretmanager.googleapis.com', displayName: 'Secret Manager API' },
      { name: 'cloudbilling.googleapis.com', displayName: 'Cloud Billing API' },
      { name: 'iamcredentials.googleapis.com', displayName: 'IAM Service Account Credentials API' }
    ];

    for (const api of apis) {
      setStep4Message(`Enabling ${api.displayName}...`);
      log(`Enabling ${api.displayName}...`);

      const enableToken = gcpAccessToken || token;
      if (!enableToken) {
        log(`No token available to enable ${api.displayName}`);
        continue;
      }

      try {
        const response = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api.name}:enable`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${enableToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          log(`${api.displayName} enable request accepted, waiting for activation...`);
        } else {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || '';
          if (errMsg.includes('billing') || errMsg.includes('Billing')) {
            setError(`Billing must be enabled on project ${projectId}. Go to Google Cloud Console > Billing to link a billing account.`);
            log(`ERROR: Billing required for ${api.displayName}`);
            setStep4Status('error');
            return;
          } else if (errMsg.includes('already') || errMsg.includes('enabled') || errMsg.includes('ALREADY')) {
            log(`${api.displayName} already enabled`);
          } else if (errMsg.includes('permission') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('403')) {
            log(`Permission denied enabling ${api.displayName} with current token, trying user token...`);
            if (enableToken !== gcpAccessToken && gcpAccessToken) {
              const retryRes = await fetch(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${api.name}:enable`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${gcpAccessToken}`,
                  'Content-Type': 'application/json'
                }
              });
              if (!retryRes.ok) {
                log(`Failed to enable ${api.displayName} with user token too`);
              } else {
                log(`${api.displayName} enable request accepted with user token`);
              }
            } else {
              log(`Cannot enable ${api.displayName} - insufficient permissions`);
            }
          } else {
            setError(`Failed to enable ${api.displayName}: ${errMsg || response.statusText} (${response.status})`);
            log(`ERROR: ${errMsg}`);
            setStep4Status('error');
            return;
          }
        }
      } catch (e) {
        log(`Error enabling ${api.displayName}: ${e.message}`);
      }

      let activated = false;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const active = await checkApiStatus(api.name);
        if (active) {
          log(`${api.displayName} is now active`);
          activated = true;
          break;
        }
        log(`Waiting for ${api.displayName} to activate... (${i + 1}/10)`);
      }
      if (!activated && api.name === 'compute.googleapis.com') {
        log('Compute Engine API did not activate yet, will attempt VM creation anyway');
      }
    }

    setStep4Message('Storing secrets in Secret Manager...');
    log('Storing secrets in Secret Manager...');
    let smRefs = {};
    try {
      smRefs = await writeSecretsToSecretManager(token, log);
      if (Object.keys(smRefs).length > 0) {
        await saveConfig({ sm_secrets: smRefs }).catch(() => {});
      }
    } catch (e) {
      // Map #36: there is no metadata fallback anymore — the VM fetches secrets
      // from Secret Manager via its attached identity. A failed write (e.g. no
      // accessor granted) produces a VM that silently never pushes and never
      // deploys. Abort VM creation with a visible error instead.
      log(`ERROR: Secret Manager write failed: ${e.message}`);
      setStep4Status('error');
      setError(`Failed to store secrets in Secret Manager: ${e.message}`);
      return;
    }

    setStep4Message('Creating VM...');
    log('Creating VM...');

    const instanceName = 'secureagent-manager';
    const startupScript = getStartupScript(useOptimizedBundle);
    const zones = [vmZone, 'us-central1-b', 'us-central1-c', 'us-west1-a', 'us-west1-b', 'us-east1-c', 'us-east1-d', 'europe-west1-d', 'asia-east1-a'];
    let vmCreated = false;

    for (const tryZone of zones) {
      try {
        setStep4Message(`Creating VM in ${tryZone}...`);
        log(`Attempting VM creation in ${tryZone}...`);

        // Map #36: the VM runs as the identity-only agent SA (cloud-platform
        // scope) so the startup script can fetch the GitHub PAT + Discord
        // token from Secret Manager via the metadata server. When no agent SA
        // exists (legacy/e2e), fall back to the project's default compute SA —
        // it is granted per-secret secretAccessor at write time.
        const vmSaEmail = godSaEmail || serviceAccountJson?.client_email ||
          (projectNumberRef.current ? `${projectNumberRef.current}-compute@developer.gserviceaccount.com` : null);

        const vmResponse = await fetch(
          `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: instanceName,
              machineType: `zones/${tryZone}/machineTypes/${vmMachineType}`,
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
              ...(vmSaEmail ? {
                serviceAccounts: [{ email: vmSaEmail, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }]
              } : {}),
              metadata: buildVmMetadata(startupScript)
            })
          }
        );

        if (vmResponse.ok) {
          setVmZone(tryZone);
          log(`VM creation started in ${tryZone}, waiting for completion...`);
          await new Promise(r => setTimeout(r, 15000));

          const instanceResp = await fetch(
            `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances/${instanceName}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          const instanceData = await instanceResp.json();
          const vmStatus = instanceData.status;
          const ip = instanceData.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;

          if (vmStatus !== 'RUNNING') {
            log(`VM status: ${vmStatus} - waiting for startup...`);

            await new Promise(r => setTimeout(r, 10000));

            const recheckResp = await fetch(
              `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${tryZone}/instances/${instanceName}`,
              { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const recheckData = await recheckResp.json();
            const recheckStatus = recheckData.status;

            if (recheckStatus !== 'RUNNING') {
              log(`VM failed to start. Status: ${recheckStatus}`);
              if (recheckStatus === 'TERMINATED') {
                setError('VM terminated. Check startup script logs in GCP Console for errors.');
              } else {
                setError(`VM is in "${recheckStatus}" state. Please check GCP Console.`);
              }
              setStep4Status('error');
              break;
            }
          }

          if (ip) {
            setVmIp(ip);
            log(`VM ready at ${ip}`);
            // Persist so a reload/rehydrate can restore step-3 completion.
            await saveConfig({ vm_ip: ip }).catch(() => {});
          }
          vmCreated = true;
          setStep4Status('complete');
          setStep4Message('VM created successfully!');
          setShowRecreateOptions(false);
          setVmInitComplete(false);
          setKimakiInstallUrl('');
          setShowInitModal(true);
          expandNextStep(3);
          break;
        } else {
          const err = await vmResponse.json();
          const errStr = JSON.stringify(err);
          const errMsg = err.error?.message || '';
          const errStatus = err.error?.status || '';
          const statusMsg = err.status?.message || '';

          log(`VM response not ok: ${errMsg || statusMsg || errStr}`);

          if (errStr.toLowerCase().includes('zone') &&
              (errStr.toLowerCase().includes('exhausted') ||
               errStr.toLowerCase().includes('unavailable') ||
               errStr.toLowerCase().includes('resource'))) {
            log(`Zone ${tryZone} may be out of capacity, trying next zone...`);
            continue;
          }

          if (errMsg.includes('ZONE_RESOURCE_POOL_EXHAUSTED') ||
              errStr.includes('RESOURCE_EXHAUSTED') ||
              errStr.includes('resource_availability') ||
              errStatus === 'RESOURCE_EXHAUSTED' ||
              statusMsg.includes('ZONE_RESOURCE_POOL_EXHAUSTED') ||
              (errMsg.includes('unavailable') && errMsg.includes('zone'))) {
            log(`Zone ${tryZone} out of capacity, trying next zone...`);
            continue;
          }

          log(`VM creation failed: ${errMsg || statusMsg || errStr}`);
          setError(`Failed to create VM: ${errMsg || statusMsg}`);
          setStep4Status('error');
          break;
        }
      } catch (e) {
        log(`Error creating VM in ${tryZone}: ${e.message}, trying next zone...`);
        continue;
      }
    }

    if (!vmCreated && step4Status !== 'error') {
      log('All zones exhausted, could not create VM');
      setError('All zones are out of capacity. Please try again later.');
      setStep4Status('error');
    }
  };

  const handleManualVMIP = () => {
    const ip = prompt('Enter your Kimaki VM IP address:');
    if (ip) {
      setVmIp(ip);
      saveConfig({ vm_ip: ip }).catch((err) => {
        console.error('Failed to save manual VM IP:', err);
        setError('VM IP saved in memory but failed to persist: ' + err.message);
      });
    }
  };

  const getAccessToken = async () => {
    if (gcpAccessToken) {
      if (gcpTokenExpiry && Date.now() < gcpTokenExpiry) return gcpAccessToken;
      // If expiry unknown (0 or not set), still use the token — let API return 401 if expired
      if (!gcpTokenExpiry) return gcpAccessToken;
      setGcpAccessToken(null);
    }
    if (serviceAccountJson) {
      const saToken = await getServiceAccountToken();
      if (saToken) return saToken;
    }
    return null;
  };

  const proceedWithOidcSetup = async (actualRepoName: string) => {
    setGithubRepoName(actualRepoName);

    const token = await getAccessToken();
    if (!token) {
      throw new Error('Google Cloud connection required. Click "Connect Google Cloud Account" above to get a token, then try again.');
    }

    const oidcData = await setupOidcInfrastructure(actualRepoName);
    if (!oidcData) {
      throw new Error('Google Cloud session expired. Click "Connect Google Cloud Account" in Step 3 to refresh, then try again.');
    }

    await saveConfig({
      gcp_wif_provider: oidcData.wifProvider,
      gcp_sa_staging: oidcData.saStaging,
      gcp_sa_production: oidcData.saProduction,
      github_repo: actualRepoName,
    });
    setGithubVarUploaded(true);
    setRepoCollision(null);
    setRepoCollisionChoice(null);
    wizard.dispatch({ type: 'EXPAND_STEP', step: 3 });
  };

  const handleCreateDiscordBot = async () => {
    const errors = validate({ discordBotToken: discordBotTokenInput, discordClientId }, { discordBotToken: SCHEMAS.discordBotToken, discordClientId: SCHEMAS.discordClientId });
    if (errors) {
      setError(errors.discordBotToken || errors.discordClientId);
      return;
    }

    if (!discordRateLimit.check()) {
      setError('Rate limit reached for Discord bot setup. Try again in a minute.');
      return;
    }

    setSaving(true);
    setError(null);
    setDiscordDetecting(true);

    try {
      // Generate invite URL using the manually entered Client ID
      const inviteUrl = buildDiscordInviteUrl(discordClientId);
      setDiscordInviteUrl(inviteUrl);

      // Discord guild detection now happens server-side on the VM
      // The VM startup script already auto-detects guilds using the bot token from metadata
      // User can also manually enter their Guild ID in the field below
      let detectedGuildId = discordGuildId;

      setDiscordBotToken(discordBotTokenInput);
      console.log('Saving Discord config:', {
        discord_bot_token: '[REDACTED]',
        invite_url_generated: !!inviteUrl
      });

      // Discord bot token intentionally NOT saved to Firestore (GHSA-x49w).
      // Persisted to sessionStorage (same-tab reload restores it; cleared on
      // tab close) — same pattern as SA key. GCP token is never persisted.

      console.log('Discord config saved');
    } catch (err) {
      console.error('Error saving discord bot token:', err);
      setError(err.message);
    } finally {
      setSaving(false);
      setDiscordDetecting(false);
    }
  };

  const handleBotAdded = () => {
    setDiscordBotAdded(true);
    saveConfig({ discord_bot_added: true });
    wizard.dispatch({ type: 'COLLAPSE_AND_EXPAND', remove: [1], add: 2 });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Infrastructure Setup</h1>
          <p className="text-gray-600">Configure GCP, GitHub, and Discord for autonomous deployments</p>
          <button
            onClick={() => window.open('/preview', '_blank')}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mt-1"
          >
            <span>👁️</span>
            Preview deployed template in new tab →
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Back to Home
          </button>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
        <div className="mb-0">
          <label className="block text-sm font-medium text-gray-700 mb-1">Project Name:</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Enter project name (e.g., my-app-staging)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>


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

        {/* Step 1: Discord Bot */}
        <div className="space-y-2">
          <StepHeader stepNumber={1} title="Step 1: Discord Bot" icon={<Bot className="text-blue-600" size={24} />} isComplete={isStepCompleted(1)} isActive={isStepActive(1)} isLocked={isStepLocked(1)} info="Configure your Discord bot token and server. The VM will use this to interact with Discord." onEdit={() => editStep(1)} expandedSteps={expandedSteps} toggleStep={toggleStep} />
        
          {expandedSteps.includes(1) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
                     <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                       <p className="text-blue-800 font-medium mb-2">Create a Discord bot:</p>
                        <ol className="list-decimal list-inside space-y-2 text-blue-700 text-sm">
                          <li>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer" className="underline font-medium">Discord Developer Portal</a></li>
                          <li>Click "New Application" → give it a name (e.g., "Kimaki") — a bot is created automatically</li>
                          <li>Go to <strong>"Installation"</strong> → set <strong>"Install Link" to "None"</strong> (we generate our own invite link below)</li>
                          <li>Go to "Bot" → disable <strong>"Public Bot"</strong></li>
                          <li>In "Bot", scroll to "Privileged Gateway Intents" → enable <strong>Message Content Intent</strong> (required for Kimaki to read messages)</li>
                          <li>Go to "Bot" → click "Reset Token" → copy the token</li>
                          <li>Enter the token below — your Client ID will be extracted automatically, then click <strong>"Save Discord Bot"</strong></li>
                          <li>Click the invite link below to add the bot to your server, then click <strong>"Bot Added"</strong> to proceed</li>
                        </ol>
                     </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Discord Bot Token:</label>
                         <input
                           type="password"
                           value={discordBotTokenInput}
                           onChange={(e) => {
                             const token = e.target.value;
                             setDiscordBotTokenInput(token);
                             setDiscordInviteUrl('');
                             const extractedId = extractClientIdFromToken(token);
                             if (extractedId) {
                               setDiscordClientId(extractedId);
                             }
                           }}
                           placeholder="MTE4MzEyODU2MTc0ODQxMDA5OH.GxXxXx.xxxxxxxx"
                           className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                         />
                        <p className="text-gray-500 text-xs mt-1">
                          Your bot token from Discord Developer Portal → Bot → Reset Token
                        </p>
                      </div>

                      {discordBotTokenInput.trim() && !discordInviteUrl && (
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Discord Client ID {discordClientId ? '(auto-detected)' : ''}
                          </label>
                          <input
                            type="text"
                            value={discordClientId}
                            onChange={(e) => setDiscordClientId(e.target.value)}
                            placeholder={discordClientId ? '' : "Could not auto-detect — paste Client ID from OAuth2 → General"}
                            className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                            readOnly={!!discordClientId}
                          />
                          {!discordClientId && (
                            <p className="text-gray-500 text-xs mt-1">
                              Enter your Discord Application Client ID manually (found in OAuth2 → General).
                            </p>
                          )}
                        </div>
                      )}

                      {discordInviteUrl && (
                      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-green-800 text-sm mb-2 font-medium">Invite link ready!</p>
                        <a
                          href={discordInviteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 underline text-sm break-all"
                        >
                          {discordInviteUrl}
                        </a>
                        <p className="text-green-700 text-xs mt-2">
                          Open this link to invite your bot to your Discord server.
                        </p>
                      </div>
                    )}

                     {error && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                        {error}
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {discordBotTokenInput.trim() && !discordInviteUrl && (
                        <button
                          onClick={handleCreateDiscordBot}
                          disabled={discordDetecting}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                        >
                          {discordDetecting ? (
                            <>
                              <span className="animate-spin">⟳</span>
                              Saving...
                            </>
                          ) : (
                            'Save Discord Bot'
                          )}
                        </button>
                      )}
                      {discordInviteUrl && (
                        <button
                          onClick={handleBotAdded}
                          className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-medium text-sm"
                        >
                          Bot Added — Continue
                        </button>
                      )}
                    </div>
          </div>
          )}
        </div>

        {/* Step 2: GitHub */}
        <div className="space-y-2">
          <StepHeader stepNumber={2} title="Step 2: GitHub" icon={<svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>} isComplete={isStepCompleted(2)} isActive={isStepActive(2)} isLocked={isStepLocked(2)} info="Create a GitHub Personal Access Token for the VM to authenticate with GitHub." onEdit={() => editStep(2)} expandedSteps={expandedSteps} toggleStep={toggleStep} />
        
          {expandedSteps.includes(2) && !isStepLocked(2) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
              {(isStepCompleted(2) && !expandedSteps.includes(2)) ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                  <Check size={20} />
                  <span className="font-medium">GitHub configured</span>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-2">Create a GitHub Personal Access Token:</p>
                    <p className="text-blue-700 text-sm mb-3">
                      The VM needs this to push/pull code from your repo. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token.
                    </p>
                    <p className="text-blue-700 text-sm mb-2">
                      <strong>Required scopes:</strong> <code className="bg-blue-100 px-1">repo</code>, <code className="bg-blue-100 px-1">workflow</code>, <code className="bg-blue-100 px-1">read:org</code>
                    </p>
                    <a 
                      href="https://github.com/settings/tokens/new?scopes=repo,workflow,read:org" 
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
                      Stored in Secret Manager and fetched by your VM at boot
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
                              if (!githubSaveRateLimit.check()) {
                                setError(`Rate limit. Try again in ${Math.ceil(githubSaveRateLimit.resetIn / 1000)}s.`);
                                return;
                              }
                              if (validate({ githubPat }, { githubPat: SCHEMAS.githubPat })) {
                                setError('Please enter a valid GitHub PAT (starts with ghp_ or github_pat_)');
                                return;
                              }
                              try {
                                const userData = await githubApiFetch(githubPat, '/user');
                                const owner = userData.login;
                                const desiredRepoName = projectName || 'SecureAgentBase';
                                const actualRepoName = `${owner}/${desiredRepoName}`;
                                setGithubRepoName(actualRepoName);
                                await saveConfig({ github_repo: actualRepoName });
                                wizard.dispatch({ type: 'EXPAND_NEXT', currentStepNum: 2 });
                              } catch (err) {
                                setError('GitHub setup failed: ' + err.message);
                              }
                            }}
                            disabled={!githubPat.trim()}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                          >
                            Save GitHub Configuration
                          </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Step 3: Google Cloud */}
        <div className="space-y-2">
          <StepHeader stepNumber={3} title="Step 3: Google Cloud" icon={<Server className="text-blue-600" size={24} />} isComplete={isStepCompleted(3)} isActive={isStepActive(3)} isLocked={isStepLocked(3)} info="One Google sign-in powers everything: Firebase apps, CI deploy accounts (WIF), your VM, and the agent service account." onEdit={() => editStep(3)} expandedSteps={expandedSteps} toggleStep={toggleStep} />
        
          {expandedSteps.includes(3) && isStepLocked(3) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 text-center text-gray-500">
              Complete Step 2 first to unlock this step.
            </div>
          )}
        
          {expandedSteps.includes(3) && !isStepLocked(3) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2 space-y-6">
                      {/* Sub-task progress indicators */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Progress</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                          {[
                            { label: 'Connect', done: gcpConnected },
                            { label: 'Service Account', done: !!godSaEmail },
                            { label: 'Project', done: !!projectId },
                            { label: 'Firebase', done: !!(firebaseStagingData && firebaseProductionData) },
                            { label: 'Billing', done: billingEnabled === true },
                            { label: 'OIDC', done: !!(gcpWifProviderName && gcpSaStagingEmail && gcpSaProductionEmail) },
                          ].map(({ label, done }) => (
                            <div key={label} className={`flex items-center gap-1.5 px-2 py-1 rounded ${done ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                              {done ? <Check size={12} /> : <span className="w-3 h-3 rounded-full border border-gray-300 inline-block" />}
                              <span>{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {gcpEmailMismatch && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <p className="text-yellow-800 font-medium mb-1">Different Google accounts detected</p>
                          <p className="text-yellow-700 text-sm">
                            You're signed in to the app as <strong>{user?.email}</strong> but connected Google Cloud as <strong>{gcpConsentEmail}</strong>.
                            IAM roles are granted to the Google Cloud account (<strong>{gcpConsentEmail}</strong>) so its own automation works.
                            This is fine if both accounts are you — just be aware your saved configuration lives under the app account.
                          </p>
                        </div>
                      )}
                      {/* 1. Connect Google Cloud & Service Account */}
                      <section>
                        <h3 className="font-semibold text-gray-700 text-sm mb-3">1. Connect Google Cloud & Service Account</h3>
                  {!gcpConnected ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="font-bold text-blue-800 text-sm mb-1">🔌 One-Click Setup Available</h4>
                        <p className="text-blue-700 text-xs">
                          Connect your Google Cloud Account to programmatically create and configure your Service Account in one click.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleConnectGoogle}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1s-10 4.51-10 10 4.51 10 10 10c10.45 0 10-9.285 10-11H12.24z"/></svg>
                        Connect Google Account
                      </button>
                    </div>
                  ) : (
                    gcpProjects.length > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-5">
                        <h4 className="font-bold text-green-800 text-md mb-2 flex items-center gap-1.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-xs text-white">A</span>
                          Programmatic Auto-Generation (Recommended)
                        </h4>
                        <p className="text-green-700 text-xs mb-3">
                          Since you connected your Google Account, we can programmatically create the service account, assign all 6 required roles, and configure this step automatically in one click!
                        </p>
                        
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-semibold text-gray-700">Select GCP Project:</label>
                            <select
                              value={autoGenProjectId}
                              onChange={(e) => setAutoGenProjectId(e.target.value)}
                              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-blue-400 text-gray-800 font-medium"
                            >
                              <option value="">-- Choose project --</option>
                              {gcpProjects.map(p => (
                                <option key={p.projectId} value={p.projectId}>{p.name} ({p.projectId})</option>
                              ))}
                            </select>
                          </div>
                          
                          {autoGenProjectId && (
                            <button
                              type="button"
                              onClick={() => handleAutoGenerateServiceAccount(autoGenProjectId)}
                              disabled={autoGeneratingSa}
                              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                            >
                              {autoGeneratingSa ? (
                                <>
                                  <span className="animate-spin">⟳</span>
                                  {saAutoProgress || 'Auto-Generating...'}
                                </>
                              ) : (
                                <>
                                  ⚡ Programmatically Setup Service Account
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  )}

                  {gcpConnected && gcpProjects.length > 0 && (
                    <div className="text-center text-xs text-gray-400 my-5 flex items-center justify-center gap-2">
                      <span className="h-px bg-gray-200 flex-grow"></span>
                      <span>OR</span>
                      <span className="h-px bg-gray-200 flex-grow"></span>
                    </div>
                  )}

                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-4">
                    <h4 className="font-bold text-gray-700 text-md mb-2 flex items-center gap-1.5">
                      {gcpConnected && gcpProjects.length > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-500 text-xs text-white">B</span>
                      )}
                      Manual Setup Fallback
                    </h4>
                    <p className="text-gray-600 text-xs mb-3">
                      If you prefer to configure permissions yourself, follow these manual steps:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-gray-600 text-xs">
                      <li>Go to <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="underline font-medium">Google Cloud IAM → Service Accounts</a></li>
                      <li>Select your project from the dropdown at the top</li>
                      <li>Click "+ Create Service Account"</li>
                      <li>Name: <code className="bg-gray-200 px-1">secureagent</code></li>
                      <li>Grant roles: <strong>Compute Admin</strong>, <strong>Service Account User</strong>, <strong>Project Billing Manager</strong>, and <strong>Service Usage Admin</strong></li>
                      <li>After creation, click <strong>Actions → Manage keys → Add key → Create new key</strong></li>
                      <li>Select <strong>JSON</strong> and download</li>
                      <li>Open the JSON file, copy all content, paste below</li>
                    </ol>
                  </div>
                      </section>

                      {/* 2. Project */}
                      <section>
                        <h3 className="font-semibold text-gray-700 text-sm mb-3">2. Project</h3>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-blue-800 font-medium mb-2">Select or enter your GCP Project ID:</p>
                    {gcpAccessToken && gcpProjects.length > 0 && (
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-blue-700 mb-1">Choose from your projects:</label>
                        <select
                          value={projectId}
                          onChange={(e) => setProjectId(e.target.value)}
                          className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 bg-white"
                        >
                          <option value="">-- Select a project --</option>
                          {gcpProjects.map(p => (
                            <option key={p.projectId} value={p.projectId}>{p.name} ({p.projectId})</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-blue-700 mb-1">
                        {gcpProjects.length > 0 ? 'Or enter a project ID manually:' : 'Enter your GCP Project ID:'}
                      </label>
                      <input
                        type="text"
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        placeholder="my-gcp-project-123"
                        className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 text-sm"
                      />
                    </div>
                    {serviceAccountJson?.project_id && (
                      <p className="text-blue-600 text-sm mt-2">
                        From saved config: <code className="bg-blue-100 px-1">{serviceAccountJson.project_id}</code>
                        <button
                          type="button"
                          onClick={() => setProjectId(serviceAccountJson.project_id)}
                          className="ml-2 text-blue-600 underline text-xs"
                        >
                          Use this
                        </button>
                      </p>
                    )}
                  </div>

                  <div className="mb-4">
                    {!showNewProjectForm ? (
                      <button
                        type="button"
                        onClick={() => setShowNewProjectForm(true)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
                      >
                        <span className="text-lg leading-none">+</span> Create New GCP Project
                      </button>
                    ) : (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-semibold text-gray-700">Create a new GCP project</p>
                          <button
                            type="button"
                            onClick={() => setShowNewProjectForm(false)}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                        {!gcpAccessToken ? (
                          <div className="text-xs text-yellow-700">
                            Connect your Google Cloud account in section 1 above to create projects programmatically.
                          </div>
                        ) : (
                          <>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Project Name:</label>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={newProjectName}
                                onChange={(e) => setNewProjectName(e.target.value)}
                                placeholder="My App"
                                className="flex-grow px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                              />
                              <button
                                type="button"
                                onClick={createGcpProject}
                                disabled={creatingProject || !newProjectName.trim()}
                                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm whitespace-nowrap"
                              >
                                {creatingProject ? 'Creating...' : 'Create Project'}
                              </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              A project ID will be auto-generated from the name.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {billingEnabled === false && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                      <p className="text-yellow-800 font-semibold text-xs mb-1">⚠️ Billing Not Linked</p>
                      <p className="text-yellow-700 text-xs">
                        Billing is linked in the Billing section below. You can continue and come back to link it later.
                      </p>
                    </div>
                  )}

                      </section>

                      {/* 3. Firebase */}
                      <section>
                        <h3 className="font-semibold text-gray-700 text-sm mb-3">3. Firebase (staging + production)</h3>
                  {!gcpAccessToken && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                      <p className="text-yellow-800 font-medium mb-2">Google Cloud Connection Required</p>
                      <p className="text-yellow-700 text-sm mb-3">
                        Connect Google Cloud below to enable automatic Firebase project discovery.
                      </p>
                      <button
                        onClick={handleConnectGoogle}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
                      >
                        Connect Google Cloud Account
                      </button>
                    </div>
                  )}

                  {gcpAccessToken && (
                    <>
                      {/* Load existing Firebase projects dropdowns */}
                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-2">Select existing or auto-create both:</p>
                        {firebaseProjects.length === 0 && !loadingFirebaseProjects && (
                          <div className="mb-4">
                            <button
                              onClick={fetchFirebaseProjects}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
                            >
                              Load My Firebase Projects
                            </button>
                          </div>
                        )}

                        {loadingFirebaseProjects && (
                          <div className="flex items-center gap-2 text-blue-700 mb-4">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            <span className="text-sm">{firebaseAutoConfigMessage || 'Loading Firebase projects...'}</span>
                          </div>
                        )}

                        {firebaseProjects.length > 0 && (
                          <div className="space-y-4 mb-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Staging Firebase Project (leave blank to auto-create):</label>
                              <select
                                value={selectedFirebaseStagingProject}
                                onChange={(e) => setSelectedFirebaseStagingProject(e.target.value)}
                                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                              >
                                <option value="">— Auto-create staging —</option>
                                {firebaseProjects.map(proj => (
                                  <option key={proj.projectId} value={proj.projectId}>
                                    {proj.displayName} ({proj.projectId})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Production Firebase Project (leave blank to auto-create):</label>
                              <select
                                value={selectedFirebaseProductionProject}
                                onChange={(e) => setSelectedFirebaseProductionProject(e.target.value)}
                                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                              >
                                <option value="">— Auto-create production —</option>
                                {firebaseProjects.map(proj => (
                                  <option key={proj.projectId} value={proj.projectId}>
                                    {proj.displayName} ({proj.projectId})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <p className="text-xs text-gray-500">
                              Staging uses {projectId ? `existing project "${projectId}"` : 'a new project'}.
                              Production is always a new project.
                            </p>

                            <button
                              onClick={handleSetupExistingFirebase}
                              disabled={autoConfiguringFirebase}
                              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm"
                            >
                              {autoConfiguringFirebase ? 'Configuring...' : 'Configure & Auto-Create Firebase'}
                            </button>
                          </div>
                        )}

                      </div>

                      {firebaseAutoConfigMessage && !autoConfiguringFirebase && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
                          {firebaseAutoConfigMessage}
                        </div>
                      )}

                      {autoConfiguringFirebase && (
                        <div className="flex items-center gap-2 text-blue-700 mb-4">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          <span className="text-sm">{firebaseAutoConfigMessage}</span>
                        </div>
                      )}
                    </>
                  )}

                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Or paste Firebase configs manually:</p>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Staging Firebase SDK config:</label>
                      <textarea
                        value={firebaseConfigStaging}
                        onChange={(e) => setFirebaseConfigStaging(e.target.value)}
                        placeholder='{"apiKey": "AIza...", "authDomain": "...", "projectId": "..."}'
                        className="w-full h-28 px-3 py-2 border-2 border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-blue-400"
                      />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Production Firebase SDK config:</label>
                      <textarea
                        value={firebaseConfigProduction}
                        onChange={(e) => setFirebaseConfigProduction(e.target.value)}
                        placeholder='{"apiKey": "AIza...", "authDomain": "...", "projectId": "..."}'
                        className="w-full h-28 px-3 py-2 border-2 border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-blue-400"
                      />
                    </div>

                    <button
                      onClick={handleSetupFirebase}
                      disabled={!firebaseConfigStaging.trim() || !firebaseConfigProduction.trim()}
                      className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                    >
                      Configure Firebase Manually
                    </button>
                  </div>
                      </section>

                      {/* 4. Billing */}
                      <section>
                        <h3 className="font-semibold text-gray-700 text-sm mb-3">4. Billing</h3>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    GCP requires an active billing account linked to your project to enable Compute Engine and create your VM. Select your Google Cloud billing account below to link it programmatically.
                  </p>

                  {billingChecking && (
                    <p className="text-xs text-blue-600 flex items-center gap-1">
                      <span className="animate-spin text-sm">⟳</span>
                      Detecting billing accounts from your Google Cloud profile...
                    </p>
                  )}

                  {!billingChecking && billingAccounts.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-gray-700">Billing Account:</label>
                        <select
                          value={selectedBillingAccount}
                          onChange={(e) => setSelectedBillingAccount(e.target.value)}
                          className="flex-grow px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-blue-400 text-gray-800 font-medium"
                        >
                          {billingAccounts.map(acc => (
                            <option key={acc.name} value={acc.name}>{acc.displayName}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => linkBillingAccount()}
                        disabled={linkingBilling}
                        className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        {linkingBilling ? (
                          <>
                            <span className="animate-spin">⟳</span>
                            Linking Billing...
                          </>
                        ) : (
                          <>
                            Link Selected Billing Account
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {!billingChecking && billingAccounts.length === 0 && billingApiError === 'service_disabled' && (
                    <div className="space-y-3">
                      <p className="text-xs text-yellow-700">
                        The Cloud Billing API is enabled but still propagating across Google's infrastructure. This can take a few minutes. You can wait and retry, or paste your billing account name below to continue without waiting.
                      </p>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-gray-700">Billing Account:</label>
                        <input
                          type="text"
                          value={manualBillingAccount}
                          onChange={(e) => setManualBillingAccount(e.target.value)}
                          placeholder="billingAccounts/012345-678901-234567"
                          className="flex-grow px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-blue-400 text-gray-800 font-medium"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => linkBillingAccount(manualBillingAccount)}
                        disabled={linkingBilling || !manualBillingAccount}
                        className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        {linkingBilling ? (
                          <>
                            <span className="animate-spin">⟳</span>
                            Linking Billing...
                          </>
                        ) : (
                          <>
                            Link Entered Billing Account
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {!billingChecking && billingAccounts.length === 0 && billingApiError === 'no_accounts' && (
                    <div className="text-xs text-yellow-700">
                      No billing accounts found on your Google Cloud profile. Please click <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-yellow-800 hover:text-yellow-950">here to configure billing manually</a>, then click <strong>Re-check Billing</strong>.
                    </div>
                  )}

                  {!billingChecking && billingAccounts.length === 0 && (billingApiError === 'api_error' || billingApiError === 'not_connected') && (
                    <div className="text-xs text-yellow-700">
                      Could not connect to Google Cloud billing APIs. Please reconnect your Google Cloud account below and try again.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      setBillingChecking(true);
                      await checkBillingStatus();
                      await fetchBillingAccounts();
                      setBillingChecking(false);
                    }}
                    className="mt-3 text-xs text-yellow-800 underline hover:text-yellow-950 font-semibold block"
                  >
                    Re-check Billing Status
                  </button>
                </div>
                      </section>

                      {/* 5. CI Deployment (OIDC) */}
                      <section>
                        <h3 className="font-semibold text-gray-700 text-sm mb-3">5. CI Deployment (OIDC)</h3>
                  {!gcpAccessToken && (
                    <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <p className="text-yellow-800 font-medium mb-1">Google Cloud Connection Required</p>
                      <p className="text-yellow-700 text-sm mb-3">
                        OIDC setup requires a Google Cloud access token. Connect your account to continue.
                      </p>
                      <button
                        onClick={handleConnectGoogle}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
                      >
                        Connect Google Cloud Account
                      </button>
                    </div>
                  )}

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
                          // Determine repo owner from PAT
                          const userData = await githubApiFetch(githubPat, '/user');
                          const owner = userData.login;
                          const desiredRepoName = projectName || 'SecureAgentBase';

                          // Check if repo already exists
                          const actualRepoName = `${owner}/${desiredRepoName}`;
                          try {
                            await githubApiFetch(githubPat, `/repos/${owner}/${desiredRepoName}`);
                            // Repo exists — show collision warning, don't proceed
                            setRepoCollision({ owner, name: desiredRepoName, fullName: actualRepoName });
                            setRepoCollisionChoice(null);
                            setRepoCollisionNewName('');
                            return;
                          } catch (checkErr) {
                            // 404 = repo doesn't exist, use the original name
                          }

                          await proceedWithOidcSetup(actualRepoName);
                        } catch (err) {
                          setError('GitHub setup failed: ' + err.message);
                        }
                      } else {
                        setError('Please enter a valid GitHub PAT (starts with ghp_)');
                      }
                    }}
                    disabled={!githubPat.trim() || oidcSetupStatus === 'creating'}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg"
                  >
                    {oidcSetupStatus === 'creating' ? 'Setting up OIDC...' : 'Save & Setup OIDC Deployment'}
                  </button>

                  {/* Repo collision warning */}
                  {repoCollision && !repoCollisionChoice && (
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={18} className="text-yellow-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-yellow-800 font-medium">Repository already exists</p>
                          <p className="text-yellow-700 text-sm mt-1">
                            A repository named <code className="bg-yellow-100 px-1 rounded">{repoCollision.fullName}</code> already exists on your GitHub account.
                          </p>
                        </div>
                      </div>
                      <p className="text-yellow-700 text-sm">Would you like to override the code in this repository, or use a different name?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setRepoCollisionChoice('override');
                          }}
                          className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                        >
                          Override existing code
                        </button>
                        <button
                          onClick={() => {
                            setRepoCollisionChoice('rename');
                          }}
                          className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium"
                        >
                          Choose different name
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Repo collision: user chose to override */}
                  {repoCollision && repoCollisionChoice === 'override' && (
                    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-yellow-800 text-sm">
                        The VM will overwrite the contents of <code className="bg-yellow-100 px-1 rounded">{repoCollision.fullName}</code> with the SecureAgentBase template.
                      </p>
                      <button
                        onClick={async () => {
                          setError(null);
                          try {
                            await proceedWithOidcSetup(repoCollision.fullName);
                          } catch (err) {
                            setError('GitHub setup failed: ' + err.message);
                          }
                        }}
                        disabled={oidcSetupStatus === 'creating'}
                        className="mt-2 bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                      >
                        {oidcSetupStatus === 'creating' ? 'Setting up OIDC...' : 'Confirm override'}
                      </button>
                    </div>
                  )}

                  {/* Repo collision: user chose different name */}
                  {repoCollision && repoCollisionChoice === 'rename' && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                      <label className="block text-sm font-medium text-blue-800">Enter a new repository name:</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={repoCollisionNewName}
                          onChange={(e) => setRepoCollisionNewName(e.target.value)}
                          placeholder={`${repoCollision.name}-new`}
                          className="flex-1 px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={async () => {
                            const newName = repoCollisionNewName.trim() || `${repoCollision.name}-new`;
                            const fullName = `${repoCollision.owner}/${newName}`;
                            setError(null);
                            try {
                              await proceedWithOidcSetup(fullName);
                            } catch (err) {
                              setError('GitHub setup failed: ' + err.message);
                            }
                          }}
                          disabled={oidcSetupStatus === 'creating'}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                        >
                          {oidcSetupStatus === 'creating' ? 'Setting up OIDC...' : 'Continue'}
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {oidcSetupStatus === 'creating' && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-700">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="text-sm font-medium">{oidcSetupStep}</span>
                      </div>
                    </div>
                  )}

                  {oidcSetupStatus === 'done' && githubVarUploaded && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-700">
                        <Check size={18} />
                        <span className="text-sm font-medium">
                          OIDC infrastructure configured for {githubRepoName}
                        </span>
                      </div>
                      <p className="text-green-600 text-xs mt-1">
                        Staging SA: {gcpSaStagingEmail} | Prod SA: {gcpSaProductionEmail}
                      </p>
                      <p className="text-green-600 text-xs mt-1">
                        GitHub variables will be uploaded to your repo automatically when the VM is created in Step 3.
                      </p>
                    </div>
                  )}

                  {oidcSetupStatus === 'error' && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="text-red-500" size={18} />
                      <span className="text-red-700 text-sm">{oidcSetupStep}</span>
                    </div>
                  )}
                      </section>

                      {/* 6. Create VM */}
                      <section>
                        <h3 className="font-semibold text-gray-700 text-sm mb-3">6. Create VM</h3>
                        {isStepCompleted(3) && !showRecreateOptions ? (
                 <div className="space-y-4">
                   <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
                     <Check size={20} />
                     <span className="font-medium">VM created and ready at {vmIp}</span>
                   </div>
                   
                   <div className="border border-gray-200 rounded-lg p-4">
                     <div className="flex items-center justify-between mb-3">
                       <h3 className="font-medium text-gray-700">VM Serial Port Logs</h3>
                       <button
                         onClick={fetchVmLogs}
                         disabled={loadingVmLogs}
                         className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-lg flex items-center gap-1"
                       >
                         {loadingVmLogs ? (
                           <span className="animate-spin">⟳</span>
                         ) : (
                           <span>↻</span>
                         )}
                         Refresh Logs
                       </button>
                     </div>
                     {loadingVmLogs ? (
                       <div className="flex items-center justify-center py-8 text-blue-600">
                         <div className="animate-spin mr-2">⟳</div>
                         Fetching VM logs...
                       </div>
                     ) : vmLogs ? (
                       <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs font-mono max-h-64 overflow-y-auto whitespace-pre-wrap">
                         {vmLogs}
                       </pre>
                     ) : (
                       <p className="text-gray-500 text-sm">Click "Refresh Logs" to view VM startup output</p>
                     )}
                   </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useOptimizedBundle}
                          onChange={(e) => setUseOptimizedBundle(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-600">Optimized</span>
                      </label>
                       <button
                         onClick={async () => {
                           if (!confirm('Delete the VM? This will destroy it. A new one can be recreated.')) return;
                           await deleteVm();
                         }}
                         disabled={deletingVm}
                         className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                       >
                         {deletingVm ? 'Deleting...' : 'Delete VM'}
                       </button>
                       <button
                         onClick={() => { setShowRecreateOptions(true); setStep4Status('idle'); setError(null); }}
                         className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
                       >
                         Recreate VM
                       </button>
                    </div>
                 </div>
                        ) : (
                          <>
                  <p className="text-gray-600 mb-4">
                    Enable required APIs and create a VM. The VM will automatically fork SecureAgentBase, set up GitHub Actions, download Kimaki, and create a Discord channel.
                  </p>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">GCP Zone:</label>
                    <select
                      value={vmZone}
                      onChange={(e) => setVmZone(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    >
                      <option value="us-east1-b">us-east1-b</option>
                      <option value="us-east1-c">us-east1-c</option>
                      <option value="us-east1-d">us-east1-d</option>
                      <option value="us-central1-a">us-central1-a</option>
                      <option value="us-central1-b">us-central1-b</option>
                      <option value="us-central1-c">us-central1-c</option>
                      <option value="us-west1-a">us-west1-a</option>
                      <option value="us-west1-b">us-west1-b</option>
                      <option value="europe-west1-d">europe-west1-d</option>
                      <option value="europe-west1-c">europe-west1-c</option>
                      <option value="asia-east1-a">asia-east1-a</option>
                      <option value="asia-east1-b">asia-east1-b</option>
                      <option value="asia-southeast1-a">asia-southeast1-a</option>
                      <option value="asia-southeast1-b">asia-southeast1-b</option>
                    </select>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Machine Type:</label>
                    <select
                      value={vmMachineType}
                      onChange={(e) => setVmMachineType(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                    >
                      <option value="e2-micro">e2-micro (1 vCPU, 1GB RAM - Free)</option>
                      <option value="e2-small">e2-small (2 vCPU, 2GB RAM - ~$6-12/mo)</option>
                      <option value="e2-medium">e2-medium (2 vCPU, 4GB RAM - ~$12-24/mo)</option>
                    </select>
                    {vmMachineType === 'e2-micro' && (
                      <p className="mt-2 text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
                        ⚠️ <strong>Reality check on 1GB RAM:</strong> Kimaki (~170 MB) + Node (~40 MB) + GCP guest agents (~120 MB) consume ~330 MB baseline. After the OS, usable headroom is ~520 MB — that fills fast when running agent sessions or installing npm packages. Strongly consider e2-small (~$6-12/mo) unless you're certain your workload fits.
                      </p>
                    )}
                  </div>
                  
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useOptimizedBundle}
                        onChange={(e) => setUseOptimizedBundle(e.target.checked)}
                        className="mt-1 w-5 h-5 rounded border-blue-300"
                      />
                      <div>
                        <span className="font-medium text-blue-800">Use optimized deployment</span>
                        <p className="text-sm text-blue-700 mt-1">
                          Download pre-bundled packages from GCS for ~60% faster setup. 
                          The bundle is GPG-signed for integrity verification.
                        </p>
                        {!useOptimizedBundle && (
                          <p className="text-xs text-blue-600 mt-2">
                            Recommended for faster deployment. Uses standard apt/npm sources by default.
                          </p>
                        )}
                      </div>
                    </label>
                    </div>

                    {step4Status === 'idle' && !gcpAccessToken && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                        <p className="text-yellow-800 font-semibold text-xs mb-1">⚠️ Google Cloud Disconnected</p>
                        <p className="text-yellow-700 text-xs mb-3">
                          Your Google Cloud session expired. Reconnect to check billing and enable APIs.
                        </p>
                        <button
                          type="button"
                          onClick={handleConnectGoogle}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
                        >
                          Reconnect Google Cloud
                        </button>
                      </div>
                    )}

                    {(billingEnabled === false || billingEnabled === null) && gcpAccessToken && step4Status === 'idle' && (
                     <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                       <p className="text-yellow-800 font-semibold text-xs mb-1">⚠️ Billing Required</p>
                       <p className="text-yellow-700 text-xs mb-3">
                         Compute Engine requires an active billing account. Select one below before creating your VM.
                       </p>
                       {billingAccounts.length > 0 ? (
                         <div className="space-y-3">
                           <div className="flex items-center gap-2">
                             <label className="text-xs font-semibold text-gray-700">Billing Account:</label>
                             <select
                               value={selectedBillingAccount}
                               onChange={(e) => setSelectedBillingAccount(e.target.value)}
                               className="flex-grow px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-blue-400 text-gray-800 font-medium"
                             >
                               {billingAccounts.map(acc => (
                                 <option key={acc.name} value={acc.name}>{acc.displayName}</option>
                               ))}
                             </select>
                           </div>
                           <button
                             type="button"
                             onClick={() => linkBillingAccount()}
                             disabled={linkingBilling}
                             className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                           >
                             {linkingBilling ? (
                               <>
                                 <span className="animate-spin">⟳</span>
                                 Linking Billing...
                               </>
                             ) : (
                               'Link Selected Billing Account'
                             )}
                           </button>
                         </div>
                        ) : (
                          <div className="text-xs text-yellow-700 space-y-2">
                            <p>No billing accounts found via API. You can enable billing at{' '}
                              <a href={gcpConsoleUrl('billing/linkedaccount', projectId)} target="_blank" rel="noopener noreferrer" className="underline font-semibold">Cloud Console</a>, then click{' '}
                              <button
                                type="button"
                                onClick={async () => {
                                  await checkBillingStatus();
                                  await fetchBillingAccounts();
                                }}
                                className="underline font-semibold"
                              >
                                Re-check
                              </button>.
                            </p>
                            <p className="mt-2">
                              Or paste your billing account ID manually (find it in Cloud Console → Billing):
                            </p>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={selectedBillingAccount}
                                onChange={(e) => setSelectedBillingAccount(e.target.value)}
                                placeholder="billingAccounts/XXXXXX-XXXXXX-XXXXXX"
                                className="flex-grow px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-blue-400"
                              />
                              <button
                                type="button"
                                onClick={() => linkBillingAccount()}
                                disabled={linkingBilling || !selectedBillingAccount}
                                className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                              >
                                {linkingBilling ? 'Linking...' : 'Link'}
                              </button>
                            </div>
                          </div>
                       )}
                       <button
                         type="button"
                         onClick={async () => {
                           await checkBillingStatus();
                           await fetchBillingAccounts();
                         }}
                         className="mt-2 text-xs text-yellow-800 underline hover:text-yellow-950 font-semibold block"
                       >
                         Re-check Billing Status
                       </button>
                     </div>
                   )}
                   
                    {step4Status === 'idle' && (
                     <div className="flex gap-2 flex-wrap">
                       <button
                         id="recreate-vm-trigger"
                         onClick={async () => {
                           createVmWithSetup({ isRecreate: false });
                         }}
                         disabled={billingEnabled === false}
                         title={billingEnabled === false ? 'Enable billing on this project first (section 4 above)' : undefined}
                         className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                       >
                         Enable APIs & Create VM
                       </button>
                       <button
                         type="button"
                         onClick={handleManualVMIP}
                         className="border border-gray-300 hover:bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm"
                       >
                         I already have a VM — enter its IP
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

                  {step4Status === 'idle' && (
                  <div className="mt-4 flex gap-2">
                      <button
                        onClick={async () => {
                          createVmWithSetup({ isRecreate: true });
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                      >
                        Recreate VM
                      </button>
                    </div>
                  )}
                          </>
                        )}
                      </section>
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
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Resources</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <a
              href={gcpConsoleUrl('compute/instances', projectId)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>☁️</span>
              GCP Compute Console
            </a>
            <a
              href="https://console.firebase.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>🔥</span>
              Firebase Console
            </a>
            <a
              href="https://github.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>🐙</span>
              GitHub
            </a>
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>💬</span>
              Discord Developer Portal
            </a>
            <button
              onClick={() => window.open('/preview', '_blank')}
              className="flex items-center gap-2 p-3 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 text-sm text-blue-700 font-medium w-full text-left"
            >
              <span>👁️</span>
              View Deployed Template Preview
            </button>
            <a
              href="https://github.com/kallhoffa/kimaki"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-sm text-gray-700"
            >
              <span>🤖</span>
              Kimaki CLI
            </a>
          </div>
        </div>
      </div>

      {showInitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            {/* Dynamic header */}
            <div className="flex items-center gap-3">
              {stagingDeployed ? (
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                  <Check size={20} className="text-green-600" />
                </div>
              ) : (
                <div className="animate-spin text-2xl shrink-0">⟳</div>
              )}
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {!vmInitComplete
                    ? 'VM is initializing...'
                    : !botOnline
                      ? 'Waiting for Kimaki...'
                      : !stagingDeployed
                        ? 'Waiting for staging deploy...'
                        : 'All done!'
                  }
                </h2>
                <p className="text-gray-500 text-xs">
                  {!vmInitComplete
                    ? 'Cloning SecureAgentBase, installing Kimaki, and connecting to Discord. Usually 2-3 minutes.'
                    : !botOnline
                      ? 'VM is ready. Kimaki is installing dependencies and connecting to Discord.'
                      : !stagingDeployed
                        ? 'Bot is online. Waiting for first deploy to complete.'
                        : 'Your Kimaki agent is online and staging is live.'
                  }
                </p>
              </div>
            </div>

            {/* Progress stages */}
            <div className="space-y-2.5">
              {/* Stage 1: VM initialized */}
              <div className="flex items-center gap-2.5 text-sm">
                {vmInitComplete ? (
                  <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <Check size={12} className="text-green-600" />
                  </div>
                ) : (
                  <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full shrink-0" />
                )}
                <span className={vmInitComplete ? 'text-green-700 font-medium' : 'text-gray-700'}>
                  VM initialized
                </span>
                {vmInitComplete && <span className="text-gray-400 text-xs ml-auto">ready</span>}
              </div>

              {/* Stage 2: Kimaki online */}
              <div className="flex items-center gap-2.5 text-sm">
                {botOnline ? (
                  <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <Check size={12} className="text-green-600" />
                  </div>
                ) : vmInitComplete ? (
                  <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full shrink-0" />
                ) : (
                  <div className="w-5 h-5 border-2 border-gray-200 rounded-full shrink-0" />
                )}
                <span className={
                  botOnline ? 'text-green-700 font-medium'
                    : vmInitComplete ? 'text-gray-700' : 'text-gray-400'
                }>
                  Kimaki online
                </span>
                {botOnline && <span className="text-gray-400 text-xs ml-auto">connected</span>}
              </div>

              {/* Stage 3: Staging deployed */}
              <div className="flex items-center gap-2.5 text-sm">
                {stagingDeployed ? (
                  <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                    <Check size={12} className="text-green-600" />
                  </div>
                ) : botOnline ? (
                  <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full shrink-0" />
                ) : (
                  <div className="w-5 h-5 border-2 border-gray-200 rounded-full shrink-0" />
                )}
                <span className={
                  stagingDeployed ? 'text-green-700 font-medium'
                    : botOnline ? 'text-gray-700' : 'text-gray-400'
                }>
                  Staging deployed
                </span>
                {stagingDeployed && <span className="text-gray-400 text-xs ml-auto">live</span>}
              </div>
            </div>

            {/* Serial port logs — always visible */}
            <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">
              {vmInitLogTail || 'Waiting for serial port logs...'}
            </div>

            {/* Authorize button */}
            {kimakiInstallUrl && (
              <a
                href={kimakiInstallUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium w-fit"
              >
                <Bot size={18} />
                Authorize Kimaki in Discord
              </a>
            )}

            {/* Close / Continue in background */}
            <button
              onClick={() => setShowInitModal(false)}
              className="block text-gray-500 hover:text-gray-700 text-sm underline"
            >
              {stagingDeployed ? 'Close' : 'Continue in background'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InfraSetup;
