import * as crypto from 'node:crypto';
import inquirer from 'inquirer';
import { AuthClient, createAuth } from '../lib/auth.js';
import {
  listProjects,
  createProject,
  getProject,
  enableApi,
  createServiceAccount,
  grantRole,
  createVm,
  deleteVm,
  fetchVmLogs,
  cleanupVmByName,
  smWriteSecret,
  smFetchSecret,
  smMember,
} from '../lib/gcp.js';
import { setupFirebaseProject } from '../lib/firebase.js';
import { ensureRepo, setGitHubVariable, setupOidc, validatePat } from '../lib/github.js';
import { fetchBillingAccounts, linkBillingAccount, isBillingEnabled } from '../lib/billing.js';
import { loadConfig, saveConfig, clearConfig } from '../utils/config.js';
import { heading, info, success, warn, error, kv } from '../utils/output.js';
import { CLIError } from '../utils/errors.js';
import { getStartupScript } from '../lib/startup-script.js';

export interface InitArgs {
  projectId?: string;
  autoSa?: boolean;
  firebase?: boolean;
  billingAccount?: string;
  githubPat?: string;
  repoName?: string;
  discordToken?: string;
  discordGuild?: string;
  vmZone?: string;
  yes?: boolean;
  vm?: boolean;
}

export async function runInit(args: InitArgs): Promise<void> {
  heading('SecureAgentBase Init');

  // Auth (ADC-only — map #36 decision #6: no service account key support)
  const auth = createAuth();
  const saEmail = await auth.getClientEmail();
  info(`Authenticated as ${saEmail || 'unknown (ADC)'}`);

  const config = loadConfig();

  // Step 1: Select or create GCP project
  await stepProject(auth, config, args);

  // Step 2: Create/configure service account
  await stepServiceAccount(auth, config, args);

  // Step 3: Set up Firebase projects
  if (args.firebase !== false) {
    await stepFirebase(auth, config, args);
  } else {
    info('Skipping Firebase setup (--no-firebase)');
  }

  // Step 4: Link billing
  await stepBilling(auth, config, args);

  // Step 5: GitHub + OIDC
  if (args.githubPat) {
    await stepGitHub(auth, config, args);
  } else {
    info('Skipping GitHub setup (no --github-pat provided)');
  }

  // Step 6: Discord bot
  if (args.discordToken) {
    await stepDiscord(auth, config, args);
  } else {
    info('Skipping Discord setup (no --discord-token provided)');
  }

  // Step 7: Create VM
  if (args.vm === false) {
    info('Skipping VM creation (--no-vm)');
  } else {
    await stepCreateVm(auth, config, args);
  }

  saveConfig(config);
  success('SecureAgentBase deployment complete!');
  kv('VM IP', config.vmIp || 'unknown');
  kv('GitHub Repo', config.githubRepo || 'unknown');
}

async function stepProject(auth: AuthClient, config: any, args: InitArgs): Promise<void> {
  heading('Step 1: GCP Project');

  if (args.projectId) {
    config.gcpProjectId = args.projectId;
    info(`Using project: ${config.gcpProjectId}`);
    saveConfig(config);
    success(`Project: ${config.gcpProjectId}`);
    return;
  }

  const projects = await listProjects(auth);
  const projectChoices = projects.map((p: any) => ({
    name: `${p.name || p.projectId} (${p.projectId})`,
    value: p.projectId,
  }));

  const { gcpProjectId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'gcpProjectId',
      message: 'Select a GCP project:',
      choices: [...projectChoices, { name: 'Create a new project', value: '__new__' }],
    },
  ]);

  if (gcpProjectId === '__new__') {
    const { projectId, displayName } = await inquirer.prompt([
      { type: 'input', name: 'projectId', message: 'New project ID:', validate: (v: string) => v.length > 0 },
      { type: 'input', name: 'displayName', message: 'Display name:', default: 'SecureAgentBase' },
    ]);
    info(`Creating project ${projectId}...`);
    await createProject(auth, projectId, displayName);
    for (let i = 0; i < 10; i++) {
      const p = await getProject(auth, projectId);
      if (p) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    config.gcpProjectId = projectId;
    info(`Project ${projectId} ready`);
  } else {
    config.gcpProjectId = gcpProjectId;
  }

  saveConfig(config);
  success(`Project: ${config.gcpProjectId}`);
}

async function stepServiceAccount(auth: AuthClient, config: any, _args: InitArgs): Promise<void> {
  heading('Step 2: Service Account');

  // Identity-only SA (map #36 decision #6): no key file is ever created or
  // stored — the SA authenticates via ADC at runtime and via metadata server
  // on the VM, so we always create it programmatically.
  const projectId = config.gcpProjectId!;
  const accountId = 'secureagent-manager';

  info('Creating service account...');
  const { email } = await createServiceAccount(auth, projectId, accountId, 'SecureAgent Manager');
  config.saEmail = email;
  info(`SA created: ${email}`);

  const roles = [
    'roles/compute.admin',
    'roles/iam.serviceAccountUser',
    'roles/iam.serviceAccountTokenCreator',
    'roles/billing.projectManager',
    'roles/serviceusage.serviceUsageAdmin',
    'roles/iam.workloadIdentityPoolAdmin',
    'roles/iam.securityAdmin',
    'roles/firebase.admin',
    // Agent SA must read the 2 SM secrets via the metadata-server identity at
    // VM boot (map #36 decision #7). Per-secret accessors are also bound at
    // write time, but the project role covers the legacy default-compute-SA
    // fallback and any re-run that re-fetches secrets.
    'roles/secretmanager.secretAccessor',
  ];

  for (const role of roles) {
    await grantRole(auth, `projects/${projectId}`, `serviceAccount:${email}`, role);
    info(`  Granted ${role}`);
  }

  // Operator needs full Secret Manager control to create secrets, add
  // versions, and bind per-secret accessors during init (map #36).
  const operatorEmail = await auth.getClientEmail();
  if (operatorEmail) {
    await grantRole(auth, `projects/${projectId}`, smMember(operatorEmail), 'roles/secretmanager.admin').catch((e: any) => {
      warn(`Could not grant roles/secretmanager.admin to ${operatorEmail}: ${e.message}`);
    });
    info(`  Granted roles/secretmanager.admin to ${operatorEmail}`);
  } else {
    warn('Could not identify the operator (ADC identity has no email). Skipping roles/secretmanager.admin grant — the calling identity must already have it (e.g. granted via the staging deploy workflow) or SM writes will fail with 403.');
  }

  saveConfig(config);
  success('Service account configured');
}

async function stepFirebase(auth: AuthClient, config: any, _args: InitArgs): Promise<void> {
  heading('Step 3: Firebase Setup');

  const projectId = config.gcpProjectId!;

  // Enable Identity Toolkit
  info('Enabling Identity Toolkit API...');
  await enableApi(auth, projectId, 'identitytoolkit.googleapis.com');

  info('Setting up staging Firebase project...');
  const staging = await setupFirebaseProject(auth, projectId, 'staging');
  config.firebaseStaging = staging.config;
  success(`Staging: ${staging.projectId}`);

  info('Setting up production Firebase project...');
  const production = await setupFirebaseProject(auth, projectId, 'production');
  config.firebaseProduction = production.config;
  success(`Production: ${production.projectId}`);

  saveConfig(config);
}

async function stepBilling(auth: AuthClient, config: any, args: InitArgs): Promise<void> {
  heading('Step 4: Billing Account');

  const projectId = config.gcpProjectId!;

  if (args.billingAccount) {
    info(`Linking billing account: ${args.billingAccount}`);
    await linkBillingAccount(auth, projectId, args.billingAccount);
    success(`Linked billing account: ${args.billingAccount}`);
    return;
  }

  if (await isBillingEnabled(auth, projectId)) {
    info('Billing already enabled');
    return;
  }

  const accounts = await fetchBillingAccounts(auth, projectId);
  if (accounts.length === 0) {
    warn('No billing accounts found');
    const { billingAccountId } = await inquirer.prompt([
      {
        type: 'input',
        name: 'billingAccountId',
        message: 'Enter billing account ID (e.g. XXXXXX-YYYYZZ-AAAAAA):',
      },
    ]);
    await linkBillingAccount(auth, projectId, billingAccountId);
    success(`Linked billing account: ${billingAccountId}`);
  } else {
    const { selectedAccount } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedAccount',
        message: 'Select a billing account:',
        choices: accounts.map((a: any) => ({
          name: `${a.displayName || a.name} (${a.name?.replace('billingAccounts/', '')})`,
          value: a.name?.replace('billingAccounts/', ''),
        })),
      },
    ]);
    await linkBillingAccount(auth, projectId, selectedAccount);
    success(`Linked billing account: ${selectedAccount}`);
  }
}

async function stepGitHub(auth: AuthClient, config: any, args: InitArgs): Promise<void> {
  heading('Step 5: GitHub + OIDC Setup');

  const projectId = config.gcpProjectId!;

  // Secret values are written to Secret Manager and used only in-memory during
  // this run (map #36 decision #7/#8: config carries references only).
  let pat = args.githubPat || '';
  if (!pat) {
    // Re-run with an existing ref → read on demand from SM instead of prompting.
    if (config.smSecrets?.githubPat) {
      info('Reading GitHub PAT from Secret Manager...');
      pat = (await smFetchSecret(auth, projectId, 'github-pat')) || '';
    }
  }
  if (!pat) {
    const { pat: entered } = await inquirer.prompt([
      {
        type: 'password',
        name: 'pat',
        message: 'GitHub Personal Access Token (repo, workflow, read:org):',
        validate: (v: string) => v.length > 0 || 'Required',
      },
    ]);
    pat = entered;
  }

  // Activate SM API (idempotent) before writing.
  await enableApi(auth, projectId, 'secretmanager.googleapis.com');

  const members = await buildSmMembers(auth, config);
  if (members.length === 0) {
    throw new CLIError('Cannot store GitHub PAT: no service account or operator identity found.');
  }
  const secretRef = await smWriteSecret(auth, projectId, 'github-pat', pat, members, info);
  config.smSecrets = { ...(config.smSecrets || {}), githubPat: secretRef };

  const userInfo = await validatePat(pat);
  info(`GitHub user: ${userInfo.login}`);

  const repoName = args.repoName || (await inquirer.prompt([
    {
      type: 'input',
      name: 'repoName',
      message: 'GitHub repo name to create:',
      default: `SecureAgentBase-${crypto.randomBytes(3).toString('hex')}`,
    },
  ])).repoName;

  const repoFull = `${userInfo.login}/${repoName}`;
  info(`Ensuring repo: ${repoFull}`);
  await ensureRepo(pat, repoFull);
  config.githubRepo = repoFull;

  info('Setting up OIDC infrastructure...');
  const oidcData = await setupOidc(auth, config.gcpProjectId!, repoFull);
  config.oidc = oidcData;

  // Upload GitHub variables (best-effort — variables may already be set from prior run)
  const varConfigs: [string, string | undefined][] = [
    ['VITE_APP_NAME', 'SecureAgentBase'],
    ['GCP_WIF_PROVIDER', oidcData.wifPoolName],
    ['GCP_SA_STAGING', oidcData.saStagingEmail],
    ['GCP_SA_PRODUCTION', oidcData.saProductionEmail],
    ['GCP_CLIENT_ID_STAGING', ''],
    ['GCP_CLIENT_ID_PRODUCTION', ''],
    ['VITE_APP_MODE', 'true'],
  ];

  for (const [name, value] of varConfigs) {
    if (value) {
      await setGitHubVariable(pat, repoFull, name, value).catch(() => {
        warn(`Could not set GitHub variable ${name} (may already exist)`);
      });
    }
  }

  // Upload Firebase config variables
  const firebaseFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];

  for (const env of ['STAGING', 'PRODUCTION']) {
    const configData = env === 'STAGING' ? config.firebaseStaging : config.firebaseProduction;
    if (configData) {
      for (const field of firebaseFields) {
        const upperField = field.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
        if (configData[field]) {
          await setGitHubVariable(pat, repoFull, `FIREBASE_${upperField}_${env}`, configData[field]).catch(() => {});
        }
      }
      await setGitHubVariable(pat, repoFull, `FIREBASE_PROJECT_ID_${env}`, configData.projectId).catch(() => {});
    }
  }

  saveConfig(config);
  success(`GitHub repo ready: ${repoFull}`);
}

// Per-secret accessors for the 2 SM secrets (map #36): the operator (ADC
// identity, user or service account) and the identity-only agent SA. The agent
// SA is what the VM boots with; the operator is for re-run fetches.
async function buildSmMembers(auth: AuthClient, config: any): Promise<string[]> {
  const members: string[] = [];
  if (config.saEmail) members.push(`serviceAccount:${config.saEmail}`);
  try {
    const email = await auth.getClientEmail();
    if (email) members.push(smMember(email));
  } catch {
    // ADC may not expose an email — agent SA membership is enough.
  }
  return members;
}

async function stepDiscord(auth: AuthClient, config: any, args: InitArgs): Promise<void> {
  heading('Step 6: Discord Bot');

  const projectId = config.gcpProjectId!;

  // Secret value used in-memory only (map #36 decision #7/#8).
  let token = args.discordToken || '';
  if (!token && config.smSecrets?.discordBotToken) {
    info('Reading Discord bot token from Secret Manager...');
    token = (await smFetchSecret(auth, projectId, 'discord-bot-token')) || '';
  }
  if (!token) {
    const { botToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'botToken',
        message: 'Discord Bot Token:',
        validate: (v: string) => v.length > 0 || 'Required',
      },
    ]);
    token = botToken;
  }

  // Write to the same SM store the web wizard uses; config keeps only the ref.
  await enableApi(auth, projectId, 'secretmanager.googleapis.com');
  const members = await buildSmMembers(auth, config);
  if (members.length === 0) {
    throw new CLIError('Cannot store Discord bot token: no service account or operator identity found.');
  }
  const secretRef = await smWriteSecret(auth, projectId, 'discord-bot-token', token, members, info);
  config.smSecrets = { ...(config.smSecrets || {}), discordBotToken: secretRef };

  if (args.discordGuild) {
    config.discordGuildId = args.discordGuild;
  }

  // Decode client ID from the in-memory token.
  const decoded = Buffer.from(token.split('.')[0], 'base64').toString();
  const clientIdMatch = decoded.match(/"(?:id|client_id)"\s*:\s*"(\d+)"/);
  if (clientIdMatch) {
    info(`Bot Client ID: ${clientIdMatch[1]}`);
  }

  if (!config.discordGuildId) {
    if (args.yes) {
      info('No guild ID provided, skipping guild prompt (-y mode)');
      config.discordGuildId = '';
    } else {
      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${decoded.match(/"(\d+)"/)?.[1] || 'UNKNOWN'}&permissions=8&integration_type=0&scope=bot%20applications.commands`;

      warn(`Invite your bot to a server: ${inviteUrl}`);

      const { guildId } = await inquirer.prompt([
        {
          type: 'input',
          name: 'guildId',
          message: 'Discord Guild (Server) ID after inviting the bot:',
        },
      ]);
      config.discordGuildId = guildId;
    }
  }

  saveConfig(config);
  success('Discord bot configured');
}

async function stepCreateVm(auth: AuthClient, config: any, args: InitArgs): Promise<void> {
  heading('Step 7: Create VM');

  const projectId = config.gcpProjectId!;

  // Enable required APIs
  info('Enabling Compute Engine API...');
  await enableApi(auth, projectId, 'compute.googleapis.com');

  info('Enabling IAM Credentials API...');
  await enableApi(auth, projectId, 'iamcredentials.googleapis.com');

  // Build metadata (same as the web wizard's buildVmMetadata). Secret VALUES
  // are NOT carried here (map #36 decision #9): the startup script fetches
  // github-pat + discord-bot-token from Secret Manager via the metadata-server
  // identity (the agent SA attached below).
  const metadata: Record<string, string> = {
    github_repo: config.githubRepo || '',
    discord_guild_id: config.discordGuildId || '',
    firebase_staging: config.firebaseStaging?.projectId || '',
    firebase_production: config.firebaseProduction?.projectId || '',
    gcp_wif_provider: config.oidc?.wifPoolName || '',
    gcp_sa_staging: config.oidc?.saStagingEmail || '',
    gcp_sa_production: config.oidc?.saProductionEmail || '',
    firebase_staging_config: JSON.stringify(config.firebaseStaging || {}),
    firebase_production_config: JSON.stringify(config.firebaseProduction || {}),
    vite_app_name: 'SecureAgentBase',
    'serial-port-enable': 'TRUE',
    'enable-oslogin': 'false',
  };

  // Use the real startup script (installs Node, gh, kimaki, clones repo, starts bot)
  // Key must be 'startup-script' (plain text) so GCP auto-executes it on boot
  metadata['startup-script'] = getStartupScript();

  // Clean up any existing VM with this name from prior runs
  info('Checking for existing VM...');
  const vmName = `secureagent-manager`;
  await cleanupVmByName(auth, projectId, vmName);

  const zones = args.vmZone ? [args.vmZone] : [
    'us-central1-a', 'us-central1-b', 'us-central1-c',
    'us-west1-a', 'us-west1-b',
    'us-east1-b', 'us-east1-c', 'us-east1-d',
    'europe-west1-b', 'europe-west1-c', 'europe-west1-d',
    'asia-east1-a',
  ];

  let vmResult = null;
  for (const zone of zones) {
    try {
      info(`Attempting VM creation in ${zone}...`);
      vmResult = await createVm(auth, projectId, zone, 'secureagent-manager', metadata, config.saEmail);
      config.vmIp = vmResult.ip;
      config.vmZone = vmResult.zone;
      break;
    } catch (e: any) {
      warn(`${zone}: ${e.message}`);
    }
  }

  if (!vmResult) {
    throw new CLIError('Failed to create VM in any zone');
  }

  config.vmIp = vmResult.ip;
  config.vmZone = vmResult.zone;
  saveConfig(config);
  success(`VM created at ${config.vmIp} in ${config.vmZone}`);

  // Poll for initialization (real startup script takes ~3-5 min)
  info('Polling VM initialization...');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    try {
      const logs = await fetchVmLogs(auth, projectId, config.vmZone, 'secureagent-manager');
      if (logs.includes('KIMAKI_BOT_ONLINE')) {
        info('Discord bot is online!');
        break;
      }
    } catch {
      // Logs not ready yet
    }
    if (i % 6 === 0) info('Waiting for VM initialization...');
  }

  success('VM initialized and bot online');
}
