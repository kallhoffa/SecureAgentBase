import { loadConfig, saveConfig, clearConfig } from '../utils/config.js';
import { heading, info, success, warn, kv } from '../utils/output.js';

export async function runStatus(): Promise<void> {
  heading('SecureAgentBase Status');

  const config = loadConfig();

  if (!config.gcpProjectId) {
    warn('No deployment found. Run `init` first.');
    return;
  }

  kv('GCP Project', config.gcpProjectId || '-');
  kv('Service Account', config.saEmail || config.saKeyPath || '-');
  kv('Staging Firebase', config.firebaseStaging?.projectId || '-');
  kv('Production Firebase', config.firebaseProduction?.projectId || '-');
  kv('GitHub Repo', config.githubRepo || '-');
  kv('VM IP', config.vmIp || '-');
  kv('VM Zone', config.vmZone || '-');
}
