#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function success(...args) {
  log(colors.green, '✓', ...args);
}

function warn(...args) {
  log(colors.yellow, '⚠', ...args);
}

function error(...args) {
  log(colors.red, '✗', ...args);
}

function info(...args) {
  log(colors.cyan, '→', ...args);
}

const platform = process.platform;
let osName = 'unknown';

if (platform === 'win32') {
  osName = 'windows';
} else if (platform === 'darwin') {
  osName = 'macos';
} else if (platform === 'linux') {
  osName = 'linux';
}

info(`Detected OS: ${osName} (${platform})`);

function commandExists(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runCommand(cmd, options = {}) {
  try {
    return execSync(cmd, { 
      stdio: 'inherit',
      ...options 
    });
  } catch (err) {
    return null;
  }
}

function runCommandOutput(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

import readline from 'readline';

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function checkAndInstallGH() {
  info('Checking GitHub CLI...');
  
  if (commandExists('gh')) {
    const status = runCommandOutput('gh auth status');
    
    if (status && status.includes('Logged in to github.com as')) {
      success('GH CLI is installed and authenticated');
      return true;
    } else {
      warn('GH CLI is installed but not authenticated');
      
      const answer = await prompt('Run "gh auth login"? (y/n): ');
      if (answer.toLowerCase() === 'y') {
        runCommand('gh auth login', { stdio: 'inherit' });
        return true;
      } else {
        warn('Skipping GH CLI auth - agent may not be able to deploy');
        return false;
      }
    }
  }
  
  warn('GH CLI not found');
  
  const answer = await prompt('Install GH CLI now? (y/n): ');
  if (answer.toLowerCase() !== 'y') {
    warn('Skipping GH CLI installation');
    return false;
  }
  
  if (osName === 'windows') {
    info('Installing GH CLI on Windows...');
    info('Run: winget install GitHub.cli');
    info('Or download from: https://github.com/cli/cli/releases');
    warn('Please install GH CLI manually, then run this setup again');
    return false;
  } else if (osName === 'macos') {
    info('Installing GH CLI via Homebrew...');
    runCommand('brew install gh');
  } else {
    info('Installing GH CLI...');
    runCommand('sudo apt install gh', { stdio: 'inherit' }) || 
    runCommand('sudo dnf install gh', { stdio: 'inherit' });
  }
  
  if (commandExists('gh')) {
    success('GH CLI installed');
    info('Please run "gh auth login" to authenticate');
    return false;
  }
  
  error('Failed to install GH CLI');
  return false;
}

async function checkAndInstallFirebase() {
  info('Checking Firebase CLI...');
  
  if (commandExists('firebase')) {
    success('Firebase CLI is installed');
    
    const login = runCommandOutput('firebase login:list');
    if (!login || login.includes('Not logged in')) {
      warn('Firebase CLI not logged in');
      const answer = await prompt('Run "firebase login"? (y/n): ');
      if (answer.toLowerCase() === 'y') {
        runCommand('firebase login', { stdio: 'inherit' });
      }
    }
    return true;
  }
  
  warn('Firebase CLI not found');
  
  const answer = await prompt('Install Firebase CLI now? (y/n): ');
  if (answer.toLowerCase() !== 'y') {
    warn('Skipping Firebase CLI installation');
    return false;
  }
  
  info('Installing Firebase CLI...');
  runCommand('npm install -g firebase-tools');
  
  if (commandExists('firebase')) {
    success('Firebase CLI installed');
    info('Please run "firebase login" to authenticate');
    return false;
  }
  
  error('Failed to install Firebase CLI');
  return false;
}

async function createFirebaseProjects(projectName) {
  info('Creating Firebase projects...');
  
  const stagingName = `${projectName}-staging`;
  
  info(`Production: ${projectName}`);
  info(`Staging: ${stagingName}`);
  
  const answer = await prompt(`Create projects "${projectName}" and "${stagingName}"? (y/n): `);
  if (answer.toLowerCase() !== 'y') {
    warn('Skipping project creation');
    return null;
  }
  
  try {
    info('Creating production project...');
    runCommand(`firebase projects:create ${projectName}`, { stdio: 'inherit' });
    success(`Created project: ${projectName}`);
  } catch (err) {
    warn(`Could not create ${projectName} - may already exist or need manual creation`);
  }
  
  try {
    info('Creating staging project...');
    runCommand(`firebase projects:create ${stagingName}`, { stdio: 'inherit' });
    success(`Created project: ${stagingName}`);
  } catch (err) {
    warn(`Could not create ${stagingName} - may already exist or need manual creation`);
  }
  
  return { projectName, stagingName };
}

async function getFirebaseConfig(projectName) {
  info(`Getting Firebase config for ${projectName}...`);
  
  try {
    runCommand(`firebase use ${projectName}`);
    
    const apps = runCommandOutput(`firebase apps:list --project ${projectName}`);
    
    let webAppId = null;
    
    if (apps) {
      const lines = apps.split('\n');
      for (const line of lines) {
        if (line.includes('WEB')) {
          const parts = line.trim().split(/\s+/);
          webAppId = parts[0];
          break;
        }
      }
    }
    
    if (!webAppId) {
      info('Creating web app...');
      const output = runCommandOutput(`firebase apps:create web ${projectName}-web --project ${projectName}`);
      
      if (output) {
        const match = output.match(/web:\s*(\S+)/);
        if (match) {
          webAppId = match[1];
        }
      }
    }
    
    if (!webAppId) {
      error('Could not find or create web app');
      return null;
    }
    
    info('Getting SDK config...');
    const configOutput = runCommandOutput(`firebase apps:sdkconfig web ${webAppId} --project ${projectName}`);
    
    if (!configOutput) {
      error('Could not get SDK config');
      return null;
    }
    
    const config = {};
    
    const apiKeyMatch = configOutput.match(/apiKey:\s*(\S+)/);
    const authDomainMatch = configOutput.match(/authDomain:\s*(\S+)/);
    const projectIdMatch = configOutput.match(/projectId:\s*(\S+)/);
    const storageBucketMatch = configOutput.match(/storageBucket:\s*(\S+)/);
    const messagingSenderIdMatch = configOutput.match(/messagingSenderId:\s*(\S+)/);
    const appIdMatch = configOutput.match(/appId:\s*(\S+)/);
    const measurementIdMatch = configOutput.match(/measurementId:\s*(\S+)/);
    
    if (apiKeyMatch) config.apiKey = apiKeyMatch[1];
    if (authDomainMatch) config.authDomain = authDomainMatch[1];
    if (projectIdMatch) config.projectId = projectIdMatch[1];
    if (storageBucketMatch) config.storageBucket = storageBucketMatch[1];
    if (messagingSenderIdMatch) config.messagingSenderId = messagingSenderIdMatch[1];
    if (appIdMatch) config.appId = appIdMatch[1];
    if (measurementIdMatch) config.measurementId = measurementIdMatch[1];
    
    return config;
  } catch (err) {
    error(`Failed to get config: ${err.message}`);
    return null;
  }
}

async function uploadSecretsToGH(config, stagingConfig, projectName, stagingName) {
  info('Uploading secrets to GitHub...');
  
  const secrets = [
    { name: 'FIREBASE_API_KEY', value: config.apiKey },
    { name: 'FIREBASE_AUTH_DOMAIN', value: config.authDomain },
    { name: 'FIREBASE_PROJECT_ID', value: projectName },
    { name: 'FIREBASE_STORAGE_BUCKET', value: config.storageBucket },
    { name: 'FIREBASE_MESSAGING_SENDER_ID', value: config.messagingSenderId },
    { name: 'FIREBASE_APP_ID', value: config.appId },
    { name: 'FIREBASE_MEASUREMENT_ID', value: config.measurementId },
  ];
  
  for (const secret of secrets) {
    if (secret.value) {
      try {
        runCommand(`gh secret set ${secret.name} --body "${secret.value}"`);
        success(`Set secret: ${secret.name}`);
      } catch (err) {
        warn(`Could not set secret ${secret.name}: ${err.message}`);
      }
    }
  }
  
  if (stagingConfig) {
    const stagingVars = [
      { name: 'VITE_FIREBASE_PROJECT_ID_STAGING', value: stagingName },
    ];
    
    for (const v of stagingVars) {
      try {
        runCommand(`gh variable set ${v.name} --body "${v.value}"`);
        success(`Set variable: ${v.name}`);
      } catch (err) {
        warn(`Could not set variable ${v.name}: ${err.message}`);
      }
    }
  }
  
  success('Secrets uploaded to GitHub');
}

function writeConfigFiles(projectName, stagingName, config, stagingConfig) {
  info('Writing configuration files...');
  
  const firebaserc = {
    projects: {
      default: projectName,
      staging: stagingName,
    }
  };
  
  writeFileSync(
    join(__dirname, '.firebaserc'), 
    JSON.stringify(firebaserc, null, 2)
  );
  success('Written .firebaserc');
  
  const envLocal = `VITE_FIREBASE_API_KEY=${config.apiKey}
VITE_FIREBASE_AUTH_DOMAIN=${config.authDomain}
VITE_FIREBASE_PROJECT_ID=${config.projectId}
VITE_FIREBASE_STORAGE_BUCKET=${config.storageBucket}
VITE_FIREBASE_MESSAGING_SENDER_ID=${config.messagingSenderId}
VITE_FIREBASE_APP_ID=${config.appId}
VITE_FIREBASE_MEASUREMENT_ID=${config.measurementId}

VITE_APP_ENV=development
VITE_USE_FIREBASE_EMULATOR=true
`;
  
  writeFileSync(join(__dirname, '.env.local'), envLocal);
  success('Written .env.local');
  
  if (stagingConfig) {
    const envStaging = `VITE_FIREBASE_API_KEY=${stagingConfig.apiKey}
VITE_FIREBASE_AUTH_DOMAIN=${stagingConfig.authDomain}
VITE_FIREBASE_PROJECT_ID=${stagingConfig.projectId}
VITE_FIREBASE_STORAGE_BUCKET=${stagingConfig.storageBucket}
VITE_FIREBASE_MESSAGING_SENDER_ID=${stagingConfig.messagingSenderId}
VITE_FIREBASE_APP_ID=${stagingConfig.appId}
VITE_FIREBASE_MEASUREMENT_ID=${stagingConfig.measurementId}

VITE_APP_ENV=staging
VITE_USE_FIREBASE_EMULATOR=false
`;
    
    writeFileSync(join(__dirname, '.env.staging'), envStaging);
    success('Written .env.staging');
  }
  
  const envExample = `VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

VITE_APP_ENV=development
VITE_STAGING_URL=https://your-staging.web.app
VITE_PRODUCTION_URL=https://your-production.com
VITE_FIREBASE_PROJECT_ID_STAGING=your_staging_project_id

VITE_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
`;
  
  writeFileSync(join(__dirname, '.env.example'), envExample);
  success('Written .env.example');
}

async function main() {
  console.log('');
  log(colors.bright, '🚀 SecureAgentBase Setup');
  console.log('==========================\n');
  
  const ghReady = await checkAndInstallGH();
  console.log('');
  
  const firebaseReady = await checkAndInstallFirebase();
  console.log('');
  
  if (!ghReady || !firebaseReady) {
    warn('Setup incomplete - please install required CLIs and run setup again');
    return;
  }
  
  let projectName = await prompt('Enter your production project name (e.g., myapp): ');
  projectName = projectName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  
  if (!projectName) {
    error('Project name is required');
    return;
  }
  
  const projects = await createFirebaseProjects(projectName);
  
  if (!projects) {
    warn('Skipping Firebase setup - you can configure manually');
  } else {
    const { projectName: prodName, stagingName } = projects;
    
    console.log('');
    info('Getting Firebase configurations...');
    
    const prodConfig = await getFirebaseConfig(prodName);
    const stagingConfig = await getFirebaseConfig(stagingName);
    
    if (prodConfig) {
      await uploadSecretsToGH(prodConfig, stagingConfig, prodName, stagingName);
      writeConfigFiles(prodName, stagingName, prodConfig, stagingConfig);
    } else {
      warn('Could not get Firebase config - please configure manually');
    }
  }
  
  console.log('');
  console.log('');
  log(colors.bright, '🎉 Setup Complete!');
  console.log('====================');
  console.log('');
  
  log(colors.green, 'What was created:');
  console.log(`  • Firebase projects: ${projectName} (prod), ${projectName}-staging (staging)`);
  console.log(`  • GitHub secrets: Firebase API keys and config`);
  console.log(`  • Config files: .firebaserc, .env.local, .env.staging`);
  console.log('');
  
  log(colors.green, 'Next steps:');
  console.log(`  1. Open your project in opencode (or your favorite agentic coding tool)`);
  console.log(`  2. Tell the agent: "Deploy my app to staging"`);
  console.log(`  3. The agent will run tests and deploy to:`);
  console.log(`     • Staging: https://${projectName}-staging.web.app`);
  console.log(`     • Production: https://${projectName}.web.app (on release)`);
  console.log('');
  
  info('To start local development:');
  console.log('  npm run dev');
  console.log('');
  
  info('To use Firebase emulators:');
  console.log('  firebase emulators:start');
  console.log('');
}

main().catch(console.error);
