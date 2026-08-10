import { describe, it, expect } from 'vitest';
import {
  CloudShellScript,
  getStartupScript,
  GCS_BUNDLE_URL,
  GCS_SIGNATURE_URL,
} from '../framework/infra-setup/scripts';

describe('CloudShellScript', () => {
  it('injects the given projectId', () => {
    const script = CloudShellScript({ projectId: 'my-project-123' });
    expect(script).toContain('my-project-123');
  });

  it('uses PROJECT_ID as fallback placeholder when projectId is empty', () => {
    const script = CloudShellScript({ projectId: '' });
    expect(script).toContain('YOUR_PROJECT_ID');
  });

  it('includes all 6 required IAM roles (least privilege)', () => {
    const script = CloudShellScript({ projectId: 'p' });
    expect(script).toContain('roles/compute.instanceAdmin.v1');
    expect(script).toContain('roles/iam.serviceAccountUser');
    expect(script).toContain('roles/billing.user');
    expect(script).toContain('roles/serviceusage.serviceUsageAdmin');
    expect(script).toContain('roles/secretmanager.secretAccessor');
    expect(script).toContain('roles/iam.serviceAccountTokenCreator');
  });

  it('creates the secureagent-manager service account', () => {
    const script = CloudShellScript({ projectId: 'p' });
    expect(script).toContain('secureagent-manager');
  });

  it('generates and downloads a JSON key', () => {
    const script = CloudShellScript({ projectId: 'p' });
    expect(script).toContain('gcloud iam service-accounts keys create');
    expect(script).toContain('secureagent-manager-key.json');
  });
});

describe('getStartupScript', () => {
  describe('without bundle (default)', () => {
    it('returns a non-empty string', () => {
      const script = getStartupScript(false);
      expect(script).toBeTruthy();
      expect(script.length).toBeGreaterThan(1000);
    });

    it('starts with bash shebang', () => {
      const script = getStartupScript(false);
      expect(script.startsWith('#!/bin/bash')).toBe(true);
    });

    it('includes set +e (allow errors)', () => {
      const script = getStartupScript(false);
      expect(script).toContain('set +e');
    });

    it('does not contain the GCS bundle section', () => {
      const script = getStartupScript(false);
      expect(script).not.toContain('Downloading pre-bundled packages');
    });
  });

  describe('with bundle enabled', () => {
    it('contains the GCS bundle download section', () => {
      const script = getStartupScript(true);
      expect(script).toContain('Downloading pre-bundled packages');
    });

    it('includes the GCS bundle URL', () => {
      const script = getStartupScript(true);
      expect(script).toContain(GCS_BUNDLE_URL);
    });

    it('includes the GCS signature URL', () => {
      const script = getStartupScript(true);
      expect(script).toContain(GCS_SIGNATURE_URL);
    });

    it('imports the trusted GPG key', () => {
      const script = getStartupScript(true);
      expect(script).toContain('gpg --import');
    });

    it('verifies the bundle signature', () => {
      const script = getStartupScript(true);
      expect(script).toContain('gpg --batch --verify');
    });

    it('falls back to standard installation on verification failure', () => {
      const script = getStartupScript(true);
      expect(script).toContain('Bundle signature verification failed');
    });
  });

  describe('metadata fetching', () => {
    it('fetches github_repo from metadata', () => {
      const script = getStartupScript(false);
      expect(script).toContain('github_repo');
      expect(script).toContain('Metadata-Flavor: Google');
    });

    it('parses REPO_OWNER and REPO_NAME from github_repo', () => {
      const script = getStartupScript(false);
      expect(script).toContain('REPO_OWNER=$(echo "$GITHUB_REPO" | cut');
      expect(script).toContain('REPO_NAME=$(echo "$GITHUB_REPO" | cut');
    });

    it('falls back to kallhoffa/SecureAgentBase when no github_repo', () => {
      const script = getStartupScript(false);
      expect(script).toContain('REPO_OWNER="kallhoffa"');
      expect(script).toContain('REPO_NAME="SecureAgentBase"');
      expect(script).not.toContain('SUFFIX=$(echo $RANDOM');
    });

    it('fetches all non-secret metadata attributes', () => {
      const script = getStartupScript(false);
      const attributes = [
        'github_repo',
        'firebase_staging',
        'firebase_production',
        'discord_guild_id',
        'gcp_wif_provider',
        'gcp_sa_staging',
        'gcp_sa_production',
        'firebase_staging_config',
        'firebase_production_config',
        'vite_app_name',
      ];
      for (const attr of attributes) {
        expect(script).toContain(attr);
      }
    });

    it('does not fetch github_pat or discord_bot_token from metadata', () => {
      const script = getStartupScript(false);
      expect(script).not.toContain('instance/attributes/github_pat');
      expect(script).not.toContain('instance/attributes/discord_bot_token');
    });

    it('does not carry or write the GCP service account key (identity-only SA)', () => {
      const script = getStartupScript(false);
      // No gcp_sa_key metadata carrier, no gcp-sa-key.json materialization.
      expect(script).not.toContain('instance/attributes/gcp_sa_key');
      expect(script).not.toContain('gcp-sa-key.json');
    });

    it('fetches secrets from Secret Manager via the metadata-server identity', () => {
      const script = getStartupScript(false);
      expect(script).toContain('fetch_sm_secret');
      expect(script).toContain('project/project-id');
      expect(script).toContain('instance/service-accounts/default/token');
      expect(script).toContain('secretmanager.googleapis.com/v1/projects/${GCP_PROJECT_ID}/secrets/${secret_id}/versions/latest:access');
      expect(script).toContain('fetch_sm_secret "github-pat"');
      expect(script).toContain('fetch_sm_secret "discord-bot-token"');
    });

    it('retries with backoff but fails fast on 404 (secret not configured)', () => {
      const script = getStartupScript(false);
      expect(script).toContain('for i in $(seq 1 14)');
      expect(script).toContain('sleep $((i * 3))');
      expect(script).toContain('if [ "$code" = "404" ]; then');
    });

    it('bounds SM/metadata curls with --max-time so a stalled API cannot hang boot', () => {
      const script = getStartupScript(false);
      expect(script).toContain('curl -sf --max-time 15');
      expect(script).toContain("curl -s --max-time 15 -w '\\n%{http_code}'");
    });
  });

  describe('HTML sanitization', () => {
    it('includes the for loop that cleans HTML responses', () => {
      const script = getStartupScript(false);
      expect(script).toContain('=~ "<html"');
      expect(script).toContain('eval');
    });

    it('checks for both "<html" and "<!" patterns', () => {
      const script = getStartupScript(false);
      expect(script).toContain('"<html"');
      expect(script).toContain('"<!"');
    });
  });

  describe('systemd service generation', () => {
    it('creates the kimaki.service unit file', () => {
      const script = getStartupScript(false);
      expect(script).toContain('/etc/systemd/system/kimaki.service');
    });

    it('sets ExecStart without "start" subcommand and resolves the node binary', () => {
      const script = getStartupScript(false);
      expect(script).toContain('ExecStart=$NODE_PATH $KIMAKI_PATH');
      expect(script).toContain('NODE_PATH=$(command -v node || true)');
      expect(script).not.toContain('ExecStart=/usr/bin/node $KIMAKI_PATH');
    });

    it('sets KIMAKI_BOT_TOKEN environment variable', () => {
      const script = getStartupScript(false);
      expect(script).toContain('KIMAKI_BOT_TOKEN=$DISCORD_BOT_TOKEN');
    });

    it('sets Restart=on-failure with 10s RestartSec', () => {
      const script = getStartupScript(false);
      expect(script).toContain('Restart=on-failure');
      expect(script).toContain('RestartSec=10');
    });
  });

  describe('GitHub integration', () => {
    it('logs in with GITHUB_PAT via gh auth and sets up git credential helper', () => {
      const script = getStartupScript(false);
      expect(script).toContain('gh auth login --with-token');
      expect(script).toContain('gh auth setup-git');
    });

    it('creates a public repo with gh repo create', () => {
      const script = getStartupScript(false);
      expect(script).toContain('gh repo create');
      expect(script).toContain('--public');
    });

    it('sets Firebase project ID variables', () => {
      const script = getStartupScript(false);
      expect(script).toContain('gh variable set FIREBASE_PROJECT_ID_STAGING');
      expect(script).toContain('gh variable set FIREBASE_PROJECT_ID_PRODUCTION');
    });

    it('sets OIDC variables (GCP_WIF_PROVIDER, GCP_SA_*)', () => {
      const script = getStartupScript(false);
      expect(script).toContain('gh variable set GCP_WIF_PROVIDER');
      expect(script).toContain('gh variable set GCP_SA_STAGING');
      expect(script).toContain('gh variable set GCP_SA_PRODUCTION');
    });
  });

  describe('agent skills installation', () => {
    it('installs skills to the global opencode skills dir', () => {
      const script = getStartupScript(false);
      expect(script).toContain('SKILLS_DIR=/root/.config/opencode/skills');
    });

    it('vendors Matt Pocock engineering skills from GitHub', () => {
      const script = getStartupScript(false);
      expect(script).toContain('github.com/mattpocock/skills.git');
      expect(script).toContain('skills/engineering');
    });

    it('reuses the local project skills copy when present', () => {
      const script = getStartupScript(false);
      expect(script).toContain('$REPO_NAME/.opencode/skills');
    });

    it('mirrors skills to the Claude Code skills dir', () => {
      const script = getStartupScript(false);
      expect(script).toContain('/root/.claude/skills');
    });

    it('writes a CONTEXT.md scaffold for fresh projects', () => {
      const script = getStartupScript(false);
      expect(script).toContain('# Context');
      expect(script).toContain('/setup-project');
    });
  });

  describe('disk space guard', () => {
    it('defines a check_disk function', () => {
      const script = getStartupScript(false);
      expect(script).toContain('check_disk()');
    });

    it('runs the guard before installs and before the git push', () => {
      const script = getStartupScript(false);
      const firstCall = script.indexOf('check_disk');
      const aptIndex = script.indexOf('sudo apt-get update');
      const pushIndex = script.indexOf('Create GitHub repo and push');
      expect(firstCall).toBeGreaterThan(-1);
      expect(firstCall).toBeLessThan(aptIndex);
      expect(script.indexOf('check_disk', aptIndex)).toBeGreaterThan(pushIndex);
    });

    it('emits a serial console marker at >=85% usage', () => {
      const script = getStartupScript(false);
      expect(script).toContain('KIMAKI_DISK_ALERT');
      expect(script).toContain('/dev/ttyS0');
      expect(script).toContain('-ge 85');
    });

    it('never leaks secrets or project identifiers to the serial console', () => {
      const script = getStartupScript(false);
      // Find only the disk-alert echo line and assert it is free of secret/project patterns
      const alertLines = script
        .split('\n')
        .filter((line) => line.includes('KIMAKI_DISK_ALERT') && line.includes('ttyS0'));
      for (const line of alertLines) {
        expect(line).not.toMatch(/PAT|TOKEN|SECRET|KEY|PROJECT|REPO_NAME|ZONE/);
      }
    });
  });

  describe('idempotency (reboot-safe provisioning)', () => {
    it('guards the script with a first-boot .provisioned marker', () => {
      const script = getStartupScript(false);
      expect(script).toContain('.provisioned');
      expect(script).toContain('Already provisioned, skipping startup script');
      expect(script).toContain('touch /root/.kimaki/.provisioned');
    });

    it('skips kimaki global install when already installed (ENOTEMPTY guard)', () => {
      const script = getStartupScript(false);
      expect(script).toContain('command -v kimaki >/dev/null 2>&1');
      expect(script).toContain('already installed, skipping global install');
    });

    it('falls back when KIMAKI_PATH is empty and verifies ExecStart', () => {
      const script = getStartupScript(false);
      expect(script).toContain('KIMAKI_PATH=$(command -v kimaki || true)');
      expect(script).toContain('NODE_PATH=$(command -v node || true)');
      expect(script).toContain('KIMAKI_MISSING');
      expect(script).toContain('defaulting to /usr/bin/kimaki');
      expect(script).toContain('defaulting to /usr/bin/node');
      expect(script).toContain('ExecStart may be broken');
    });

    it('reuses an existing clone instead of failing on destination exists', () => {
      const script = getStartupScript(false);
      expect(script).toContain('REPO_NAME/.git');
      expect(script).toContain('reusing existing checkout');
    });

    it('clears stale gh credentials before re-login', () => {
      const script = getStartupScript(false);
      expect(script).toContain('gh auth logout --hostname github.com');
    });

    it('skips project registration when already registered', () => {
      const script = getStartupScript(false);
      expect(script).toContain('project list --json');
      expect(script).toContain('Project already registered, skipping');
    });

    it('does not overwrite an existing kimaki.service unit', () => {
      const script = getStartupScript(false);
      expect(script).toContain('if [ ! -f /etc/systemd/system/kimaki.service ]; then');
      expect(script).toContain('skipping re-write');
    });
  });

  describe('project registration', () => {
    it('creates the kimaki-register.sh script', () => {
      const script = getStartupScript(false);
      expect(script).toContain('/usr/local/bin/kimaki-register.sh');
    });

    it('creates the kimaki-register.service systemd unit', () => {
      const script = getStartupScript(false);
      expect(script).toContain('/etc/systemd/system/kimaki-register.service');
    });

    it('makes the register service run after kimaki.service', () => {
      const script = getStartupScript(false);
      expect(script).toContain('After=kimaki.service');
    });

    it('outputs KIMAKI_BOT_ONLINE marker on successful registration', () => {
      const script = getStartupScript(false);
      expect(script).toContain('KIMAKI_BOT_ONLINE');
      expect(script).toContain('/dev/ttyS0');
    });
  });
});
