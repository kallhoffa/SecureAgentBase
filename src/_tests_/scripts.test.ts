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

    it('falls back to kallhoffa/agentbase-<suffix> when no github_repo', () => {
      const script = getStartupScript(false);
      expect(script).toContain('REPO_OWNER="kallhoffa"');
      expect(script).toContain('SUFFIX=$(echo $RANDOM | md5sum | head -c 6)');
    });

    it('fetches all 8 metadata attributes', () => {
      const script = getStartupScript(false);
      const attributes = [
        'github_repo',
        'firebase_staging',
        'firebase_production',
        'discord_bot_token',
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

    it('sets ExecStart without "start" subcommand', () => {
      const script = getStartupScript(false);
      expect(script).toContain('ExecStart=/usr/bin/node $KIMAKI_PATH');
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
    it('logs in with GITHUB_PAT via gh auth', () => {
      const script = getStartupScript(false);
      expect(script).toContain('echo $GITHUB_PAT | gh auth login');
    });

    it('creates a public repo with gh repo create', () => {
      const script = getStartupScript(false);
      expect(script).toContain('gh repo create');
      expect(script).toContain('--public');
    });

    it('sets Firebase project ID secrets', () => {
      const script = getStartupScript(false);
      expect(script).toContain('gh secret set FIREBASE_STAGING_PROJECT_ID');
      expect(script).toContain('gh secret set FIREBASE_PRODUCTION_PROJECT_ID');
    });

    it('sets OIDC variables (GCP_WIF_PROVIDER, GCP_SA_*)', () => {
      const script = getStartupScript(false);
      expect(script).toContain('gh variable set GCP_WIF_PROVIDER');
      expect(script).toContain('gh variable set GCP_SA_STAGING');
      expect(script).toContain('gh variable set GCP_SA_PRODUCTION');
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
