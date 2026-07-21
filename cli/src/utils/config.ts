import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface Config {
  gcpProjectId?: string;
  saEmail?: string;
  saKeyPath?: string;
  firebaseStaging?: Record<string, string>;
  firebaseProduction?: Record<string, string>;
  githubPat?: string;
  githubRepo?: string;
  discordBotToken?: string;
  discordGuildId?: string;
  vmIp?: string;
  vmZone?: string;
  oidc?: {
    wifPoolName?: string;
    wifProviderName?: string;
    saStagingEmail?: string;
    saProductionEmail?: string;
  };
}

const CONFIG_DIR = path.join(os.homedir(), '.secureagentbase');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    // Corrupted config, start fresh
  }
  return {};
}

export function saveConfig(config: Config): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function clearConfig(): void {
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }
}
