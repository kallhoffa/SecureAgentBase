import * as fs from 'node:fs';
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
} from '../lib/gcp.js';
import { setupFirebaseProject } from '../lib/firebase.js';
import { ensureRepo, setGitHubVariable, setupOidc, validatePat } from '../lib/github.js';
import { fetchBillingAccounts, linkBillingAccount, isBillingEnabled } from '../lib/billing.js';
import { loadConfig, saveConfig, clearConfig } from '../utils/config.js';
import { heading, info, success, warn, error, kv } from '../utils/output.js';
import { CLIError } from '../utils/errors.js';

export async function runInit(args: { saKey?: string }): Promise<void> {
  heading('SecureAgentBase Init');

  // Auth
  const auth = await createAuth(args.saKey);
  const saEmail = await auth.getClientEmail();
  info(`Authenticated as ${saEmail || 'unknown (ADC)'}`);

  const config = loadConfig();

  // Step 1: Select or create GCP project
  await stepProject(auth, config);

  // Step 2: Create/configure service account
  await stepServiceAccount(auth, config);

  // Step 3: Set up Firebase projects
  await stepFirebase(auth, config);

  // Step 4: Link billing
  await stepBilling(auth, config);

  // Step 5: GitHub + OIDC
  await stepGitHub(auth, config);

  // Step 6: Discord bot
  await stepDiscord(config);

  // Step 7: Create VM
  await stepCreateVm(auth, config);

  saveConfig(config);
  success('SecureAgentBase deployment complete!');
  kv('VM IP', config.vmIp || 'unknown');
  kv('GitHub Repo', config.githubRepo || 'unknown');
}

async function stepProject(auth: AuthClient, config: any): Promise<void> {
  heading('Step 1: GCP Project');

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
    // Wait for propagation
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

async function stepServiceAccount(auth: AuthClient, config: any): Promise<void> {
  heading('Step 2: Service Account');

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'Service account setup:',
      choices: [
        { name: 'Create service account programmatically', value: 'auto' },
        { name: 'Use existing service account key file', value: 'manual' },
      ],
    },
  ]);

  if (choice === 'manual') {
    const { keyPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'keyPath',
        message: 'Path to service account JSON key:',
        validate: (v: string) => fs.existsSync(v) || 'File not found',
      },
    ]);
    config.saKeyPath = keyPath;
  } else {
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
    ];

    for (const role of roles) {
      await grantRole(auth, `projects/${projectId}`, `serviceAccount:${email}`, role);
      info(`  Granted ${role}`);
    }
  }

  saveConfig(config);
  success('Service account configured');
}

async function stepFirebase(auth: AuthClient, config: any): Promise<void> {
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

async function stepBilling(auth: AuthClient, config: any): Promise<void> {
  heading('Step 4: Billing Account');

  const projectId = config.gcpProjectId!;

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

async function stepGitHub(auth: AuthClient, config: any): Promise<void> {
  heading('Step 5: GitHub + OIDC Setup');

  if (!config.githubPat) {
    const { pat } = await inquirer.prompt([
      {
        type: 'password',
        name: 'pat',
        message: 'GitHub Personal Access Token (repo, workflow, read:org):',
        validate: (v: string) => v.length > 0 || 'Required',
      },
    ]);
    config.githubPat = pat;
  }

  const userInfo = await validatePat(config.githubPat);
  info(`GitHub user: ${userInfo.login}`);

  const { repoName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'repoName',
      message: 'GitHub repo name to create:',
      default: `SecureAgentBase-${crypto.randomBytes(3).toString('hex')}`,
    },
  ]);

  const repoFull = `${userInfo.login}/${repoName}`;
  info(`Ensuring repo: ${repoFull}`);
  await ensureRepo(config.githubPat, repoFull);
  config.githubRepo = repoFull;

  info('Setting up OIDC infrastructure...');
  const oidcData = await setupOidc(auth, config.gcpProjectId!, repoFull);
  config.oidc = oidcData;

  // Upload GitHub variables
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
      await setGitHubVariable(config.githubPat, repoFull, name, value);
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
          await setGitHubVariable(config.githubPat, repoFull, `FIREBASE_${upperField}_${env}`, configData[field]);
        }
      }
      await setGitHubVariable(config.githubPat, repoFull, `FIREBASE_PROJECT_ID_${env}`, configData.projectId);
    }
  }

  saveConfig(config);
  success(`GitHub repo ready: ${repoFull}`);
}

async function stepDiscord(config: any): Promise<void> {
  heading('Step 6: Discord Bot');

  if (!config.discordBotToken) {
    const { botToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'botToken',
        message: 'Discord Bot Token:',
        validate: (v: string) => v.length > 0 || 'Required',
      },
    ]);
    config.discordBotToken = botToken;
  }

  // Decode client ID from token
  const decoded = Buffer.from(config.discordBotToken.split('.')[0], 'base64').toString();
  const clientIdMatch = decoded.match(/"(?:id|client_id)"\s*:\s*"(\d+)"/);
  if (clientIdMatch) {
    info(`Bot Client ID: ${clientIdMatch[1]}`);
  }

  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${Buffer.from(config.discordBotToken.split('.')[0], 'base64').toString().match(/"(\d+)"/)?.[1] || 'UNKNOWN'}&permissions=8&integration_type=0&scope=bot%20applications.commands`;

  warn(`Invite your bot to a server: ${inviteUrl}`);

  const { guildId } = await inquirer.prompt([
    {
      type: 'input',
      name: 'guildId',
      message: 'Discord Guild (Server) ID after inviting the bot:',
    },
  ]);
  config.discordGuildId = guildId;

  saveConfig(config);
  success('Discord bot configured');
}

async function stepCreateVm(auth: AuthClient, config: any): Promise<void> {
  heading('Step 7: Create VM');

  const projectId = config.gcpProjectId!;

  // Enable required APIs
  info('Enabling Compute Engine API...');
  await enableApi(auth, projectId, 'compute.googleapis.com');

  info('Enabling IAM Credentials API...');
  await enableApi(auth, projectId, 'iamcredentials.googleapis.com');

  // Build metadata (same as web wizard's buildVmMetadata)
  const metadata: Record<string, string> = {
    startup_script_bin: '',
    github_pat: config.githubPat || '',
    github_repo: config.githubRepo || '',
    discord_bot_token: config.discordBotToken || '',
    discord_guild_id: config.discordGuildId || '',
    firebase_staging: config.firebaseStaging?.projectId || '',
    firebase_production: config.firebaseProduction?.projectId || '',
    gcp_wif_provider: config.oidc?.wifPoolName || '',
    gcp_sa_staging: config.oidc?.saStagingEmail || '',
    gcp_sa_production: config.oidc?.saProductionEmail || '',
    firebase_staging_config: JSON.stringify(config.firebaseStaging || {}),
    firebase_production_config: JSON.stringify(config.firebaseProduction || {}),
    vite_app_name: 'SecureAgentBase',
  };

  // Add startup script (embedded as base64 in the script itself for simplicity)
  metadata.startup_script_bin = Buffer.from('#!/bin/bash\nset +e\nexport HOME=/root\necho "SecureAgentBase VM initialized"', 'utf-8').toString('base64');

  const zones = [
    'us-central1-a', 'us-central1-b', 'us-central1-c',
    'us-east1-b', 'us-east1-c',
    'europe-west1-b', 'europe-west1-c',
  ];

  let vmResult = null;
  for (const zone of zones) {
    try {
      info(`Attempting VM creation in ${zone}...`);
      vmResult = await createVm(auth, projectId, zone, 'secureagent-manager', metadata);
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

  // Poll for initialization
  info('Polling VM initialization...');
  for (let i = 0; i < 120; i++) {
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
