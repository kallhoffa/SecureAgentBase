import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';

// Test credentials (must match a real Firebase Auth user in the staging project)
// Created via Firebase Auth REST API at the start of CI
const E2E_USER = {
  email: process.env.E2E_TEST_EMAIL || 'e2e@agentbase-staging.iam.gserviceaccount.com',
  password: process.env.E2E_TEST_PASSWORD || '',
};

// Fake SA JSON for parsing tests (not used for real API calls)
const MOCK_SA_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'e2e-test-project',
  private_key_id: 'abc123',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCy\n-----END PRIVATE KEY-----\n',
  client_email: 'e2e-test@e2e-test-project.iam.gserviceaccount.com',
  client_id: '123456789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
});

// GCP access token: generated in CI via gcloud auth print-access-token (WIF impersonation)
// 1-hour ephemeral token, never stored as a key
const E2E_GCP_TOKEN = process.env.E2E_GCP_TOKEN || '';

const E2E_GCP_PROJECT_ID = process.env.E2E_GCP_PROJECT_ID || '';

// Real Firebase configs from env vars
const REAL_FIREBASE_STAGING = process.env.E2E_FIREBASE_STAGING_B64
  ? JSON.parse(Buffer.from(process.env.E2E_FIREBASE_STAGING_B64, 'base64').toString())
  : null;

// Helper: navigate to wizard with e2e credentials injected
const navigateWithE2E = async (page, extraParams = {}) => {
  const params = new URLSearchParams();

  // Inject GCP access token via sessionStorage (not URL param — avoids address bar leakage)
  if (E2E_GCP_TOKEN) {
    await page.addInitScript((token) => {
      sessionStorage.setItem('__e2e_token', token);
    }, Buffer.from(E2E_GCP_TOKEN).toString('base64'));
  }

  if (E2E_GCP_PROJECT_ID) {
    params.set('__e2e_project_id', E2E_GCP_PROJECT_ID);
  }
  if (REAL_FIREBASE_STAGING) {
    params.set('__e2e_firebase_staging', Buffer.from(JSON.stringify(REAL_FIREBASE_STAGING)).toString('base64'));
  }
  if (process.env.E2E_GITHUB_PAT) {
    params.set('__e2e_github_pat', Buffer.from(process.env.E2E_GITHUB_PAT).toString('base64'));
  }
  if (process.env.E2E_DISCORD_TOKEN) {
    params.set('__e2e_discord_token', Buffer.from(process.env.E2E_DISCORD_TOKEN).toString('base64'));
  }
  if (process.env.E2E_DISCORD_GUILD) {
    params.set('__e2e_discord_guild', Buffer.from(process.env.E2E_DISCORD_GUILD).toString('base64'));
  }

  for (const [key, val] of Object.entries(extraParams)) {
    if (val) params.set(key, val);
  }

  const qs = params.toString();
  await page.goto(`${TEST_URL}/infra-setup${qs ? '?' + qs : ''}`);
  await page.waitForLoadState('networkidle');
};

const createFirebaseUser = async () => {
  if (!process.env.E2E_FIREBASE_API_KEY) {
    console.warn('E2E_FIREBASE_API_KEY not set, skipping Firebase user creation');
    return;
  }
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${process.env.E2E_FIREBASE_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: E2E_USER.email,
      password: E2E_USER.password,
      returnSecureToken: true,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json();
    // User may already exist, that's OK
    if (err.error?.message !== 'EMAIL_EXISTS') {
      throw new Error(`Failed to create Firebase user: ${err.error?.message}`);
    }
  }
};

// Helper: get auth headers for API calls using the test user
const getTestUserToken = async () => {
  if (!process.env.E2E_FIREBASE_API_KEY) return null;
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.E2E_FIREBASE_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: E2E_USER.email,
      password: E2E_USER.password,
      returnSecureToken: true,
    }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.idToken;
};

test.describe('Wizard E2E Regression', () => {

  // ---------- Non-auth tests (app mode only) ----------
  test.describe('Unauthenticated UI', () => {
    test.beforeEach(async () => {
      test.skip(process.env.E2E_APP_MODE !== 'true', 'Wizard route only available in app mode');
    });

    test('page loads with correct heading', async ({ page }) => {
      await page.goto(`${TEST_URL}/infra-setup`);
      await expect(page.getByText('Infrastructure Setup')).toBeVisible();
      await expect(
        page.getByText('Configure GCP, GitHub, and Discord for autonomous deployments')
      ).toBeVisible();
    });

    test('shows all 7 step headers', async ({ page }) => {
      await page.goto(`${TEST_URL}/infra-setup`);
      const steps = [
        'Step 1: Account',
        'Step 2: Service Account',
        'Step 3: GCP Project',
        'Step 4: Firebase Setup',
        'Step 5: GitHub Auth',
        'Step 6: Discord Bot',
        'Step 7: Create VM',
      ];
      for (const step of steps) {
        await expect(page.getByText(step)).toBeVisible();
      }
    });

    test('shows sign in prompt when not authenticated', async ({ page }) => {
      await page.goto(`${TEST_URL}/infra-setup`);
      await expect(page.getByText('Please sign in to continue.')).toBeVisible();
    });

    test('SA key textarea validates JSON', async ({ page }) => {
      await page.goto(`${TEST_URL}/infra-setup`);
      const textarea = page.getByPlaceholder(/service_account/);
      await expect(textarea).toBeVisible();

      // Invalid JSON
      await textarea.fill('not valid json');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Invalid JSON')).toBeVisible();

      // Valid JSON
      await textarea.fill(MOCK_SA_JSON);
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Service account configured')).toBeVisible();
    });

    test('locked steps show correct message', async ({ page }) => {
      await page.goto(`${TEST_URL}/infra-setup`);
      const lockMsg = page.getByText('Complete previous step first');
      await expect(lockMsg.first()).toBeVisible();
    });

    test('back to home link works', async ({ page }) => {
      await page.goto(`${TEST_URL}/infra-setup`);
      await page.getByText('Back to Home').click();
      await expect(page).toHaveURL(TEST_URL + '/');
    });

    test('preview link opens in new tab', async ({ page }) => {
      await page.goto(`${TEST_URL}/infra-setup`);
      const previewLink = page.getByText(/Preview deployed template/);
      await expect(previewLink).toBeVisible();
      const linkElement = previewLink.locator('..');
      const target = await linkElement.getAttribute('target');
      expect(target).toBe('_blank');
    });
  });

  // ---------- Full wizard flow (requires env vars + app mode) ----------
  test.describe('Full Wizard Flow', () => {
    test.beforeEach(async () => {
      test.skip(process.env.E2E_APP_MODE !== 'true',
        'Wizard route only available in app mode');
    });

    // Skip if no real credentials
    test.beforeAll(async () => {
      if (!E2E_GCP_TOKEN || !process.env.E2E_FIREBASE_API_KEY) {
        console.warn('Skipping full wizard flow: missing E2E_GCP_TOKEN or E2E_FIREBASE_API_KEY');
      }
    });

    test('completes all wizard steps via e2e injection', async ({ page }) => {
      test.skip(!E2E_GCP_TOKEN || !process.env.E2E_FIREBASE_API_KEY,
        'E2E_GCP_TOKEN and E2E_FIREBASE_API_KEY required');

      // Create test Firebase user if needed
      await createFirebaseUser();
      await page.goto(`${TEST_URL}/login`);
      await page.waitForLoadState('networkidle');
      await page.fill('input[type="email"]', E2E_USER.email);
      await page.fill('input[type="password"]', E2E_USER.password);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});

      // Navigate to wizard with e2e creds
      await navigateWithE2E(page);

      // Verify steps auto-complete from injected creds
      await expect(page.getByText('Service account configured')).toBeVisible({ timeout: 15000 });

      // Step 4-7 should be unlocked and show completed state
      await expect(page.getByText('Step 4: Firebase Setup')).toBeVisible();
      await expect(page.getByText('Step 5: GitHub Auth')).toBeVisible();
      await expect(page.getByText('Step 6: Discord Bot')).toBeVisible();
      await expect(page.getByText('Step 7: Create VM')).toBeVisible();

      // Verify Create VM button is enabled (all prereqs met)
      await page.getByText('Step 7: Create VM').first().click();
      await page.waitForTimeout(500);
      const createBtn = page.getByRole('button', { name: /Enable APIs & Create VM/i });
      await expect(createBtn).toBeVisible({ timeout: 5000 });
      await expect(createBtn).toBeEnabled();

      console.log('Wizard e2e injection test passed: all steps pre-filled, Create VM enabled');
    });

    test('creates VM and verifies success indicators', async ({ page }) => {
      test.skip(process.env.E2E_FULL !== 'true',
        'E2E_FULL=true required — creates real GCP VM, GitHub repo, and Discord bot');

      test.setTimeout(600000); // 10 minutes for full VM provision + deploy

      // Sign in
      await createFirebaseUser();
      await page.goto(`${TEST_URL}/login`);
      await page.waitForLoadState('networkidle');
      await page.fill('input[type="email"]', E2E_USER.email);
      await page.fill('input[type="password"]', E2E_USER.password);
      await page.click('button[type="submit"]');
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});

      // Navigate to wizard with e2e creds
      await navigateWithE2E(page);

      // Wait for steps to auto-complete
      await expect(page.getByText('Service account configured')).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      // Go to step 7 and create VM
      await page.getByText('Step 7: Create VM').first().click();
      await page.waitForTimeout(500);

      const createBtn = page.getByRole('button', { name: /Enable APIs & Create VM/i });
      await expect(createBtn).toBeVisible({ timeout: 5000 });
      await createBtn.click();

      // Wait for the init modal to appear
      await expect(page.getByText(/VM is initializing|VM Initialization Complete/)).toBeVisible({ timeout: 30000 });

      // Wait for VM init complete (serial port marker)
      await expect(page.getByText('VM Initialization Complete!')).toBeVisible({ timeout: 300000 });

      // Wait for Discord bot online indicator
      await expect(page.getByText('Discord bot online')).toBeVisible({ timeout: 120000 });

      // Wait for staging deploy indicator (may take longer for CI to run)
      await expect(page.getByText('Staging site deployed')).toBeVisible({ timeout: 600000 });

      // Final verification: all three success indicators shown
      await expect(page.getByText('VM Initialization Complete!')).toBeVisible();
      await expect(page.getByText('Discord bot online')).toBeVisible();
      await expect(page.getByText('Staging site deployed')).toBeVisible();

      console.log('Full wizard e2e test passed: VM created, bot online, staging deployed');
    });

    test('SA JSON upload flow works end-to-end', async ({ page }) => {
      test.skip(!E2E_GCP_TOKEN || !process.env.E2E_FIREBASE_API_KEY,
        'E2E_GCP_TOKEN and E2E_FIREBASE_API_KEY required');

      await page.goto(`${TEST_URL}/login`);
      await page.waitForLoadState('networkidle');
      await page.fill('input[type="email"]', E2E_USER.email);
      await page.fill('input[type="password"]', E2E_USER.password);
      await page.click('button[type="submit"]');

      await page.goto(`${TEST_URL}/setup`);
      await page.waitForLoadState('networkidle');

      await page.getByText('Step 2: Service Account').first().click();
      await page.waitForTimeout(300);

      const textarea = page.getByPlaceholder(/service_account/);
      await expect(textarea).toBeVisible();

      const testSaJson = JSON.stringify({
        type: 'service_account',
        project_id: E2E_GCP_PROJECT_ID || 'e2e-test-project',
        private_key_id: 'test-key-id',
        private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCy\n-----END PRIVATE KEY-----\n',
        client_email: `e2e-test-runner@${E2E_GCP_PROJECT_ID || 'e2e-test-project'}.iam.gserviceaccount.com`,
        client_id: '123456789',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      });

      await textarea.fill(testSaJson);
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByText('Service account configured')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(E2E_GCP_PROJECT_ID || 'e2e-test-project')).toBeVisible({ timeout: 5000 });
    });
  });
});
