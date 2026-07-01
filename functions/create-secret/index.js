import { httpFn } from '@google-cloud/functions-framework';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();

export const createSecret = httpFn(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { projectId, secretName, secretValue, serviceAccountKey } = req.body;

  if (!projectId || !secretName || !secretValue) {
    res.status(400).json({ error: 'Missing required fields: projectId, secretName, secretValue' });
    return;
  }

  try {
    let accessToken;

    if (serviceAccountKey) {
      const { google } = require('googleapis');
      const auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      const authClient = await auth.getClient();
      const tokenResponse = await authClient.getAccessToken();
      accessToken = tokenResponse.token;
    } else {
      const { google } = require('googleapis');
      const auth = google.auth.getApplicationDefault();
      const authClient = await auth.getClient();
      const { token } = await authClient.getAccessToken();
      accessToken = token;
    }

    if (!accessToken) {
      res.status(401).json({ error: 'No valid credentials available' });
      return;
    }

    const parent = `projects/${projectId}`;
    const secretId = `secureagent-${secretName.replace(/[^a-z0-9-_]/g, '-').toLowerCase()}`;

    try {
      await client.getSecret({ name: `${parent}/secrets/${secretId}` });
    } catch {
      await client.createSecret({
        parent,
        secret: {
          name: secretId,
          replication: {
            automatic: {},
          },
        },
      });
    }

    const [version] = await client.addSecretVersion({
      parent: `${parent}/secrets/${secretId}`,
      payload: {
        data: Buffer.from(secretValue).toString('base64'),
      },
    });

    res.json({
      success: true,
      secretName: secretId,
      version: version.name,
    });
  } catch (error) {
    console.error('Error creating secret:', error);
    res.status(500).json({ error: error.message });
  }
});
