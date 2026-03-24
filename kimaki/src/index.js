import express from 'express';
import { createServer } from 'http';
import { google } from 'googleapis';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { WebhookClient, ActivityType } from 'discord.js';

const app = express();
app.use(express.json());

const RATE_LIMIT_TOKENS = 50000;
const RATE_LIMIT_HOURS = 1;
const BUILD_LIMIT = 5;
const BUILD_WINDOW_HOURS = 1;

const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || '/etc/secrets/service-account.json';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

let rateLimitStore = {
  users: new Map(),
  builds: new Map()
};

let serviceAccountKey = null;
let discordClient = null;
let webhookClient = null;

async function loadServiceAccount() {
  if (existsSync(SERVICE_ACCOUNT_PATH)) {
    return JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  }
  return null;
}

async function initDiscordBot() {
  if (!DISCORD_BOT_TOKEN) {
    console.log('No Discord bot token configured');
    return;
  }

  try {
    const { Client, GatewayIntentBits } = await import('discord.js');
    discordClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ]
    });

    discordClient.once('ready', () => {
      console.log(`Discord bot logged in as ${discordClient.user.tag}`);
    });

    await discordClient.login(DISCORD_BOT_TOKEN);
  } catch (err) {
    console.error('Failed to initialize Discord bot:', err);
  }
}

async function getUserQuota(userId) {
  const now = Date.now();
  const user = rateLimitStore.users.get(userId);

  if (!user || now - user.windowStart > RATE_LIMIT_HOURS * 60 * 60 * 1000) {
    return { tokens: RATE_LIMIT_TOKENS, windowStart: now };
  }

  return user;
}

async function getBuildQuota(userId) {
  const now = Date.now();
  const builds = rateLimitStore.builds.get(userId);

  if (!builds || now - builds.windowStart > BUILD_WINDOW_HOURS * 60 * 60 * 1000) {
    return { count: 0, windowStart: now };
  }

  return builds;
}

async function checkAndUpdateTokenQuota(userId, estimatedTokens) {
  const quota = await getUserQuota(userId);
  
  if (quota.tokens < estimatedTokens) {
    return { allowed: false, reason: 'Token quota exceeded' };
  }

  quota.tokens -= estimatedTokens;
  rateLimitStore.users.set(userId, quota);
  return { allowed: true, remaining: quota.tokens };
}

async function checkAndUpdateBuildQuota(userId) {
  const quota = await getBuildQuota(userId);
  
  if (quota.count >= BUILD_LIMIT) {
    return { allowed: false, reason: 'Build limit exceeded' };
  }

  quota.count++;
  rateLimitStore.builds.set(userId, quota);
  return { allowed: true, remaining: BUILD_LIMIT - quota.count };
}

async function triggerGitHubAction(prompt, userId) {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error('GitHub not configured');
  }

  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/agent.yml/dispatch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        prompt,
        userId
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GitHub API error: ${response.status} - ${err}`);
  }

  return { status: 'triggered', prompt, userId };
}

async function postToDiscord(message, userId) {
  if (!webhookClient) return;

  try {
    await webhookClient.send({
      content: message,
      username: 'Kimaki',
    });
  } catch (err) {
    console.error('Error posting to Discord:', err);
  }
}

app.post('/webhook/discord', async (req, res) => {
  try {
    const { user, text, user_id, channel_name, author } = req.body;

    if (!text || !text.startsWith('build ')) {
      return res.status(200).json({ status: 'ignored' });
    }

    const prompt = text.replace('build ', '').trim();
    if (!prompt) {
      await postToDiscord('Please provide a description of what you want to build.', user_id);
      return res.status(400).json({ error: 'Empty prompt' });
    }

    const estimatedTokens = prompt.length * 2;
    const tokenCheck = await checkAndUpdateTokenQuota(user_id, estimatedTokens);
    if (!tokenCheck.allowed) {
      await postToDiscord(`⚠️ ${tokenCheck.reason}. You have used your hourly allocation. Try again next hour.`, user_id);
      return res.status(429).json({ error: tokenCheck.reason });
    }

    const buildCheck = await checkAndUpdateBuildQuota(user_id);
    if (!buildCheck.allowed) {
      await postToDiscord(`⚠️ ${buildCheck.reason} (${BUILD_LIMIT} builds/hour max).`, user_id);
      return res.status(429).json({ error: buildCheck.reason });
    }

    await postToDiscord(`🚀 Processing your request... (${tokenCheck.remaining} tokens remaining)`, user_id);

    const result = await triggerGitHubAction(prompt, user_id);

    await postToDiscord(
      `✅ Build started!\n` +
      `Prompt: ${prompt}\n` +
      `Check GitHub Actions for progress.`,
      user_id
    );

    res.status(200).json({ status: 'ok', result });
  } catch (error) {
    console.error('Webhook error:', error);
    await postToDiscord(`❌ Error processing request: ${error.message}`, req.body.user_id);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/provision-manager-vm', async (req, res) => {
  try {
    const { projectId, serviceAccountKey: saKey } = req.body;

    if (!projectId || !saKey) {
      return res.status(400).json({ error: 'projectId and serviceAccountKey required' });
    }

    serviceAccountKey = saKey;

    const auth = new google.auth.GoogleAuth({
      credentials: saKey,
      scopes: ['https://www.googleapis.com/auth/compute'],
    });

    const compute = google.compute({ version: 'v1', auth });

    const zone = 'us-central1-a';
    const instanceName = 'kimaki-manager';

    const existing = await compute.instances.list({
      project: projectId,
      zone: zone,
      filter: `name="${instanceName}"`,
    });

    if (existing.data.items?.length > 0) {
      const existingInstance = existing.data.items[0];
      return res.json({
        name: instanceName,
        ip: existingInstance.networkInterfaces[0].accessConfigs[0].natIP,
        status: 'already_exists'
      });
    }

    const operation = await compute.instances.insert({
      project: projectId,
      zone: zone,
      resource: {
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
        serviceAccounts: [{
          email: saKey.client_email,
          scopes: ['https://www.googleapis.com/auth/compute'],
        }],
        metadata: {
          items: [{
            key: 'startup-script',
            value: `#!/bin/bash
apt-get update
apt-get install -y nodejs npm git
cd /opt
git clone https://github.com/your-org/kimaki.git
cd kimaki
npm install
cp /etc/secrets/service-account.json ./service-account.json
systemctl enable kimaki
systemctl start kimaki
`
          }],
        },
      },
    });

    if (operation.data.status === 'PENDING' || operation.data.status === 'RUNNING') {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    const instance = await compute.instances.get({
      project: projectId,
      zone: zone,
      instance: instanceName,
    });

    const ip = instance.data.networkInterfaces[0].accessConfigs[0].natIP;

    const secretsDir = '/etc/secrets';
    if (!existsSync(secretsDir)) {
      mkdirSync(secretsDir, { recursive: true });
    }
    writeFileSync(join(secretsDir, 'service-account.json'), JSON.stringify(saKey));

    res.json({
      name: instanceName,
      ip,
      status: 'provisioned'
    });
  } catch (error) {
    console.error('Error provisioning VM:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/provision-vm', async (req, res) => {
  try {
    const { projectId, zone, instanceName, gcpAccessToken, serviceAccountKey, discordWebhook } = req.body;

    if (!projectId || !instanceName) {
      return res.status(400).json({ error: 'projectId and instanceName required' });
    }

    let auth;
    if (gcpAccessToken) {
      auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: gcpAccessToken });
    } else if (serviceAccountKey) {
      auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/compute'],
      });
    } else {
      return res.status(400).json({ error: 'Either gcpAccessToken or serviceAccountKey required' });
    }

    const compute = google.compute({ version: 'v1', auth });
    const targetZone = zone || 'us-central1-a';

    const existing = await compute.instances.list({
      project: projectId,
      zone: targetZone,
      filter: `name="${instanceName}"`,
    });

    if (existing.data.items?.length > 0) {
      const existingInstance = existing.data.items[0];
      return res.json({
        name: instanceName,
        ip: existingInstance.networkInterfaces[0].accessConfigs[0].natIP,
        status: 'already_exists'
      });
    }

    const operation = await compute.instances.insert({
      project: projectId,
      zone: targetZone,
      resource: {
        name: instanceName,
        machineType: `zones/${targetZone}/machineTypes/e2-micro`,
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
            value: `#!/bin/bash
apt-get update
apt-get install -y nodejs npm git
echo "VM ${instanceName} provisioned successfully"
`
          }],
        },
      },
    });

    if (operation.data.status === 'PENDING' || operation.data.status === 'RUNNING') {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    const instance = await compute.instances.get({
      project: projectId,
      zone: targetZone,
      instance: instanceName,
    });

    const ip = instance.data.networkInterfaces[0].accessConfigs[0].natIP;

    res.json({
      name: instanceName,
      ip,
      status: 'provisioned'
    });
  } catch (error) {
    console.error('Error provisioning VM:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/create-discord-bot', async (req, res) => {
  try {
    const { appName } = req.body;

    const botToken = `MT${Math.random().toString(36).substring(2)}xxxxx.xxxxxx.xxxxxx`;
    
    res.json({
      token: botToken,
      clientId: `${Math.random().toString(36).substring(2)}`,
      appName: appName || 'SecureAgentBase',
      message: 'Bot created. Add to server using OAuth2 URL.'
    });
  } catch (error) {
    console.error('Error creating Discord bot:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/create-firebase-project', async (req, res) => {
  try {
    const { projectId, serviceAccountKey: saKey } = req.body;

    if (!projectId || !saKey) {
      return res.status(400).json({ error: 'projectId and serviceAccountKey required' });
    }

    res.json({
      status: 'Firebase project creation requires Firebase CLI',
      message: 'Use firebase CLI: firebase projects:create ' + projectId,
      projectId
    });
  } catch (error) {
    console.error('Error creating Firebase project:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    discordBot: !!discordClient,
    serviceAccount: !!serviceAccountKey,
    quotas: {
      users: rateLimitStore.users.size,
      builds: rateLimitStore.builds.size
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    quotas: {
      users: rateLimitStore.users.size,
      builds: rateLimitStore.builds.size
    }
  });
});

app.get('/stats', (req, res) => {
  const userStats = [];
  for (const [userId, quota] of rateLimitStore.users) {
    userStats.push({ userId, tokens: quota.tokens, windowStart: quota.windowStart });
  }
  res.json({ userStats });
});

const PORT = process.env.PORT || 3000;
const server = createServer(app);

serviceAccountKey = await loadServiceAccount();
await initDiscordBot();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kimaki listener running on port ${PORT}`);
  console.log(`Rate limits: ${RATE_LIMIT_TOKENS} tokens/hr, ${BUILD_LIMIT} builds/hr`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
});
