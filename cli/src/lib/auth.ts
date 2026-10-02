import { spawnSync } from 'node:child_process';
import * as readline from 'node:readline';
import { GoogleAuth } from 'google-auth-library';

// Least-privilege scope policy — must stay in sync with the web wizard's SA
// impersonation scopes (src/infra-setup.tsx, src/framework/infra-setup/api.ts).
const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/compute',
  'https://www.googleapis.com/auth/devstorage.read_write',
  'https://www.googleapis.com/auth/cloud-billing.readonly',
];

const LOGIN_DOCS = 'https://cloud.google.com/docs/authentication/getting-started';

export interface AuthClient {
  getToken(): Promise<string>;
  getProjectId(): Promise<string | null>;
  getClientEmail(): Promise<string | null>;
}

class ADCAuthClient implements AuthClient {
  private auth: GoogleAuth;
  private projectId: string | null = null;
  private clientEmail: string | null = null;

  constructor() {
    this.auth = new GoogleAuth({ scopes: SCOPES });
  }

  async getToken(): Promise<string> {
    let client;
    try {
      client = await this.auth.getClient();
    } catch (error) {
      if (isMissingAdc(error)) {
        throw new MissingAdcError('No credential source is available.', undefined, { cause: error });
      }
      throw error;
    }
    let tokenResponse;
    try {
      tokenResponse = await client.getAccessToken();
    } catch (error) {
      if (isUnusableAdc(error) || isMissingScopes(error)) {
        throw new MissingAdcError('Stored credentials are expired or were revoked.', undefined, {
          cause: error,
        });
      }
      throw error;
    }
    if (!tokenResponse.token) throw new Error('Failed to get access token from ADC');
    return tokenResponse.token;
  }

  async getProjectId(): Promise<string | null> {
    if (this.projectId) return this.projectId;
    try {
      this.projectId = (await this.auth.getProjectId()) || null;
    } catch {
      this.projectId = null;
    }
    return this.projectId;
  }

  async getClientEmail(): Promise<string | null> {
    if (this.clientEmail) return this.clientEmail;
    try {
      const client = await this.auth.getClient();
      if ('email' in client && typeof client.email === 'string') {
        this.clientEmail = client.email;
      }
    } catch {
      this.clientEmail = null;
    }
    return this.clientEmail;
  }
}

// ADC-only (map #36 decision #6): service-account-key auth is gone. The CLI
// authenticates purely via Application Default Credentials (gcloud auth
// application-default login, Workload Identity Federation, or
// GOOGLE_APPLICATION_CREDENTIALS pointing at an ADC/authorized-user file).
export function createAuth(): AuthClient {
  return new ADCAuthClient();
}

/**
 * Raised when Google ADC is missing or unusable. Carries actionable remediation
 * so callers guide the user through login instead of surfacing the bare
 * google-auth-library "Could not load the default credentials" string.
 */
export class MissingAdcError extends Error {
  readonly isMissingAdc = true;

  constructor(readonly detail: string, fix?: string, options?: { cause?: unknown }) {
    super(notLoggedIn(detail, fix), options);
    this.name = 'MissingAdcError';
  }
}


function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

/** The deepest underlying error message, so classification survives wrapping. */
function rootMessage(error: unknown): string {
  if (error instanceof MissingAdcError && error.cause) return rootMessage(error.cause);
  return messageOf(error);
}

/** No credential source at all (no ADC file, no GCE metadata, no env var). */
function isMissingAdc(error: unknown): boolean {
  const message = rootMessage(error);
  return (
    message.includes('Could not load the default credentials') ||
    message.includes('NO_ADC_FOUND') ||
    message.includes('Your default credentials were not found') ||
    message.includes('Could not automatically determine credentials')
  );
}

/** The VM is up but its metadata identity has no OAuth scopes attached. */
function isMissingScopes(error: unknown): boolean {
  const message = rootMessage(error);
  return (
    message.includes('does not have any permission scopes') ||
    (message.includes('Compute Engine built-in service account') &&
      message.includes('Could not refresh access token'))
  );
}

/** A credential source exists but cannot mint a token (revoked/expired). */
function isUnusableAdc(error: unknown): boolean {
  const message = rootMessage(error);
  return (
    message.includes('invalid_grant') ||
    message.includes('invalid_rapt') ||
    message.includes('Could not refresh access token') ||
    message.includes('Reauthentication is needed') ||
    message.includes('invalid authentication credentials')
  );
}

/**
 * Multi-line, copy-pasteable "you are not signed in" guidance. The fix lines are
 * overridable because some cases (running on a VM) must not tell the user to
 * run the interactive login command.
 */
function notLoggedIn(detail: string, fix?: string): string {
  const lines = ['Not signed in to Google Cloud.', '', `  ${detail}`, ''];
  if (fix) {
    lines.push(`  ${fix}`);
  } else {
    lines.push('  Fix:  gcloud auth application-default login');
    lines.push('  Then: re-run this command');
  }
  lines.push(`  Docs: ${LOGIN_DOCS}`);
  return lines.join('\n');
}

export interface AdcOptions {
  /** Run the login without asking (used by `--yes` and non-TTY shells). */
  auto?: boolean;
}

type AdcProbe =
  | { ok: true; email: string | null }
  | { ok: false; detail: string; fix?: string };

/**
 * Validates ADC by actually minting a token — not merely by finding a
 * credential source, so stale or revoked credentials are caught up front.
 */
async function probeAdc(): Promise<AdcProbe> {
  const auth = new ADCAuthClient();
  try {
    await auth.getToken();
    return { ok: true, email: await auth.getClientEmail() };
  } catch (error) {
    const message = rootMessage(error);
    if (isMissingAdc(error) || message.includes('NO_ADC_FOUND')) {
      return { ok: false, detail: 'No credential source is available.' };
    }
    if (isMissingScopes(error)) {
      return {
        ok: false,
        detail: 'The VM is running but its service account has no OAuth scopes, so Google will not issue a token.',
        fix: 'Fix:  give the VM a service account with cloud-platform scope, or set GOOGLE_APPLICATION_CREDENTIALS',
      };
    }
    if (isUnusableAdc(error)) {
      return { ok: false, detail: 'Stored credentials are expired or were revoked.' };
    }
    return { ok: false, detail: message };
  }
}

/**
 * Ensures usable Google ADC exists, guiding the user through login when it does
 * not — the CLI equivalent of the wizard's "Connect Google Cloud Account" button.
 *
 * Remediation order:
 *   1. ADC works -> return the identity email (never prompt needlessly).
 *   2. `gcloud` installed -> run `gcloud auth application-default login`.
 *   3. `gcloud` missing -> print install instructions and stop.
 *
 * Returns the authenticated identity email when ADC exposes one (null for
 * identity-less ADC, e.g. a bare metadata server or authorized-user file).
 */
export async function ensureAdc(options: AdcOptions = {}): Promise<string | null> {
  const before = await probeAdc();
  if (before.ok) return before.email;

  // On a GCE VM, credentials come from the metadata server. Running
  // `gcloud auth application-default login` there is harmful (it would
  // overwrite the VM's ADC file and can expose a personal account to anyone
  // with VM access), so never spawn it — explain the real fix instead.
  if (before.fix) {
    // Probe already identified the precise problem (e.g. a scope-less VM).
    throw new MissingAdcError(before.detail, before.fix);
  }

  if (await isRunningOnGce()) {
    throw new MissingAdcError(
      'This looks like a Google Cloud VM, where credentials come from the metadata server. ' +
        'Check that the VM still has a service account attached and that the metadata server is reachable.',
      'Fix:  attach a service account to the VM (or set GOOGLE_APPLICATION_CREDENTIALS)'
    );
  }

  const gcloud = findGcloud();
  if (!gcloud) {
    throw new MissingAdcError(
      'The gcloud CLI was not found on PATH. Install the Google Cloud SDK first (https://cloud.google.com/sdk/docs/install).'
    );
  }

  if (!options.auto && !(await runLoginPrompt(before.detail))) {
    throw new MissingAdcError(`${before.detail} Login was skipped.`);
  }

  // `gcloud auth application-default login` is interactive (browser flow), so
  // hand it the real stdio and let the user complete it. `shell` must match
  // what findGcloud probed with, or Windows resolves gcloud in one call and not
  // the other (the probe passes, the login then dies with ENOENT).
  const result = spawnSync(gcloud, ['auth', 'application-default', 'login'], {
    stdio: 'inherit',
    shell: needsShell(),
  });
  if (result.error) {
    throw new MissingAdcError(
      `Could not run gcloud: ${messageOf(result.error)}`,
      `Install the Google Cloud SDK and make sure \`gcloud\` runs in this shell (https://cloud.google.com/sdk/docs/install).`
    );
  }
  if (result.status !== 0) {
    throw new MissingAdcError(
      '`gcloud auth application-default login` exited with a failure (it may have been cancelled).'
    );
  }

  const after = await probeAdc();
  if (!after.ok) {
    throw new MissingAdcError(`Login finished, but still unusable: ${after.detail}`, after.fix);
  }
  return after.email;
}

/**
 * Detects a GCE VM by probing the metadata server. Used only on the failure
 * path, so the short timeout costs nothing in the happy case.
 */
async function isRunningOnGce(): Promise<boolean> {
  const host = process.env.GCE_METADATA_HOST;
  if (host) {
    // An explicit host still has to answer; a stale override should not be
    // mistaken for a VM (and google-auth-library honours the same variable).
    return metadataServerAnswers(host);
  }
  return metadataServerAnswers('169.254.169.254');
}

async function metadataServerAnswers(host: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const res = await fetch(`http://${host}/computeMetadata/v1/instance/id`, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * On Windows, `gcloud` is installed as a batch wrapper (`gcloud.cmd`), which
 * spawnSync cannot execute directly — it only resolves real executables. Node
 * resolves the wrapper only when `shell: true`. `git` and `npm` have the same
 * shape on Windows. Everywhere we invoke a CLI, pass this flag.
 */
function needsShell(): boolean {
  return process.platform === 'win32';
}

function findGcloud(): string | null {
  const probe = spawnSync('gcloud', ['version', '--format=json'], {
    stdio: 'ignore',
    shell: needsShell(),
  });
  return probe.error || probe.status !== 0 ? null : 'gcloud';
}

function runLoginPrompt(detail: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    // Non-interactive shell (CI, pipes): never block on a prompt nobody can see.
    return Promise.resolve(true);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<boolean>((resolve) => {
    rl.question(
      `Not signed in to Google Cloud (${detail})\n` +
        '  Sign in now with `gcloud auth application-default login`? [Y/n] ',
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() !== 'n');
      }
    );
  });
}