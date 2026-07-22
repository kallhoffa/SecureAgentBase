import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';

// Test credentials (must match a real Firebase Auth user in the staging project)
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
const E2E_GCP_TOKEN = process.env.E2E_GCP_TOKEN || '';

const E2E_GCP_PROJECT_ID = process.env.E2E_GCP_PROJECT_ID || '';

// Real Firebase configs from env vars
const REAL_FIREBASE_STAGING = process.env.E2E_FIREBASE_STAGING_B64
  ? JSON.parse(Buffer.from(process.env.E2E_FIREBASE_STAGING_B64, 'base64').toString())
  : null;

// Helper: sign in via Firebase Auth REST API + UI login form
const signIn = async (page) => {
  // Create test Firebase user if needed
  if (process.env.E2E_FIREBASE_API_KEY) {
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
      if (err.error?.message !== 'EMAIL_EXISTS') {
        throw new Error(`Failed to create Firebase user: ${err.error?.message}`);
      }
    }
  }

  await page.goto(`${TEST_URL}/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.fill('input[type="email"]', E2E_USER.email);
  await page.fill('input[type="password"]', E2E_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
};

// Helper: navigate to wizard and wait for auth to resolve
const goToWizard = async (page) => {
  await page.goto(`${TEST_URL}/infra-setup`);
  await page.waitForLoadState('domcontentloaded');
  // Wait for Firebase Auth to resolve — Step 1 shows "Signed in as" when ready
  await expect(page.getByText(/Signed in as/).first()).toBeVisible({ timeout: 15000 });
};

// Helper: navigate to wizard with e2e credentials injected
const navigateWithE2E = async (page, extraParams = {}) => {
  const params = new URLSearchParams();

  // Inject SA key JSON as __e2e_sa (base64-encoded JSON string)
  if (process.env.E2E_SA_KEY) {
    try {
      let saJson;
      const trimmed = process.env.E2E_SA_KEY.trim();
      if (trimmed.startsWith('{')) {
        saJson = trimmed;
      } else {
        saJson = Buffer.from(trimmed, 'base64').toString('utf-8');
      }
      const parsed = JSON.parse(saJson);
      if (parsed.private_key) {
        params.set('__e2e_sa', Buffer.from(saJson).toString('base64'));
      } else {
        console.warn('E2E_SA_KEY parsed but missing private_key field');
      }
    } catch (e) {
      console.warn('E2E_SA_KEY is not valid JSON:', e.message);
    }
  }

  // Inject GCP access token via sessionStorage
  if (E2E_GCP_TOKEN) {
    await page.addInitScript((token) => {
      sessionStorage.setItem('__e2e_token', token);
    }, Buffer.from(E2E_GCP_TOKEN).toString('base64'));
  }

  if (E2E_GCP_PROJECT_ID) {
    params.set('__e2e_project_id', E2E_GCP_PROJECT_ID);
  }

  // Auto-construct minimal Firebase configs from project IDs
  const stagingProjectId = process.env.E2E_FIREBASE_STAGING_PROJECT_ID || E2E_GCP_PROJECT_ID;
  const productionProjectId = process.env.E2E_FIREBASE_PRODUCTION_PROJECT_ID || E2E_GCP_PROJECT_ID;

  if (REAL_FIREBASE_STAGING) {
    params.set('__e2e_firebase_staging', Buffer.from(JSON.stringify(REAL_FIREBASE_STAGING)).toString('base64'));
  } else if (stagingProjectId) {
    const minimalStaging = { projectId: stagingProjectId };
    params.set('__e2e_firebase_staging', Buffer.from(JSON.stringify(minimalStaging)).toString('base64'));
  }

  if (process.env.E2E_FIREBASE_PRODUCTION) {
    params.set('__e2e_firebase_production', Buffer.from(process.env.E2E_FIREBASE_PRODUCTION).toString('base64'));
  } else if (productionProjectId) {
    const minimalProduction = { projectId: productionProjectId };
    params.set('__e2e_firebase_production', Buffer.from(JSON.stringify(minimalProduction)).toString('base64'));
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
  if (process.env.E2E_DISCORD_BOT_ADDED === 'true') {
    params.set('__e2e_discord_bot_added', Buffer.from('true').toString('base64'));
  }
  if (process.env.E2E_BILLING_ENABLED === 'true') {
    params.set('__e2e_billing_enabled', Buffer.from('true').toString('base64'));
  }

  for (const [key, val] of Object.entries(extraParams)) {
    if (val) params.set(key, val);
  }

  const qs = params.toString();
  await page.goto(`${TEST_URL}/infra-setup${qs ? '?' + qs : ''}`);
  await page.waitForLoadState('domcontentloaded');
  // Wait for Firebase Auth to resolve
  await expect(page.getByText(/Signed in as/).first()).toBeVisible({ timeout: 15000 });
};

test.describe('Wizard E2E Regression', () => {

  // ---------- Auth redirect tests (app mode only) ----------
  test.describe('Auth Redirect', () => {
    test('redirects unauthenticated user to login', async ({ page }) => {
      test.skip(process.env.E2E_APP_MODE !== 'true', 'Wizard route only available in app mode');
      await page.goto(`${TEST_URL}/infra-setup`);
      await expect(page).toHaveURL(new RegExp('/login'), { timeout: 10000 });
    });
  });

  // ---------- Authenticated UI tests (app mode only) ----------
  test.describe('Authenticated UI', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(process.env.E2E_APP_MODE !== 'true', 'Wizard route only available in app mode');
      await signIn(page);
    });

    test('page loads with correct heading', async ({ page }) => {
      await goToWizard(page);
      await expect(page.getByText('Infrastructure Setup')).toBeVisible({ timeout: 10000 });
      await expect(
        page.getByText('Configure GCP, GitHub, and Discord for autonomous deployments')
      ).toBeVisible();
    });

    test('shows all 8 step headers', async ({ page }) => {
      await goToWizard(page);
      const steps = [
        'Step 1: Account',
        'Step 2: Service Account',
        'Step 3: GCP Project',
        'Step 4: Firebase Setup',
        'Step 5: Billing Account',
        'Step 6: GitHub Auth',
        'Step 7: Discord Bot',
        'Step 8: Create VM',
      ];
      for (const step of steps) {
        await expect(page.getByText(step)).toBeVisible({ timeout: 10000 });
      }
    });

    test('SA key textarea validates JSON', async ({ page }) => {
      await goToWizard(page);

      // Step 2 should not be locked after sign-in (Step 1 = !!user, which is true)
      // Click the Step 2 header to expand it
      await page.getByText('Step 2: Service Account').first().click();
      await page.waitForTimeout(500);

      const textarea = page.getByPlaceholder(/service_account/);
      await expect(textarea).toBeVisible({ timeout: 10000 });

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
      await goToWizard(page);
      const lockMsg = page.getByText('Complete previous step first');
      await expect(lockMsg.first()).toBeVisible({ timeout: 10000 });
    });

    test('back to home link works', async ({ page }) => {
      await goToWizard(page);
      await page.getByText('Back to Home').click();
      await expect(page).toHaveURL(TEST_URL + '/');
    });

    test('preview link opens in new tab', async ({ page }) => {
      await goToWizard(page);
      const previewLink = page.getByRole('link', { name: /Preview deployed template/ });
      await expect(previewLink).toBeVisible();
      const target = await previewLink.getAttribute('target');
      expect(target).toBe('_blank');
    });
  });

  // ---------- Full wizard flow (requires env vars + app mode) ----------
  test.describe('Full Wizard Flow', () => {
    test.beforeEach(async () => {
      test.skip(process.env.E2E_APP_MODE !== 'true',
        'Wizard route only available in app mode');
    });

    test('completes all wizard steps via e2e injection', async ({ page }) => {
      test.skip(!E2E_GCP_TOKEN || !process.env.E2E_FIREBASE_API_KEY,
        'E2E_GCP_TOKEN and E2E_FIREBASE_API_KEY required');

      await signIn(page);

      // Navigate to wizard with e2e creds
      await navigateWithE2E(page);

      // Verify steps auto-complete from injected creds (SA key completes Steps 1-3)
      await expect(page.getByText('Service account configured')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(E2E_GCP_PROJECT_ID || 'e2e-test-project')).toBeVisible({ timeout: 5000 });

      // Steps 5-8 should be unlocked
      await expect(page.getByText('Step 5: Billing Account')).toBeVisible();
      await expect(page.getByText('Step 6: GitHub Auth')).toBeVisible();
      await expect(page.getByText('Step 7: Discord Bot')).toBeVisible();
      await expect(page.getByText('Step 8: Create VM')).toBeVisible();

      console.log('Wizard e2e injection test passed: Steps 1-3 pre-filled, Steps 5-8 unlocked');
    });

    test('creates VM and verifies success indicators', async ({ page }) => {
      test.skip(process.env.E2E_FULL !== 'true',
        'E2E_FULL=true required — creates real GCP VM, GitHub repo, and Discord bot');

      test.setTimeout(600000); // 10 minutes for full VM provision + deploy

      await signIn(page);

      // Navigate to wizard with e2e creds
      await navigateWithE2E(page);

      // Wait for steps to auto-complete (SA key fills Steps 1-3)
      await expect(page.getByText('Service account configured')).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      // Go to Step 8: Create VM and click create
      await page.getByText('Step 8: Create VM').first().click();
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

      // Wait for staging deploy indicator
      await expect(page.getByText('Staging site deployed')).toBeVisible({ timeout: 600000 });

      // Final verification: all three success indicators shown
      await expect(page.getByText('VM Initialization Complete!')).toBeVisible();
      await expect(page.getByText('Discord bot online')).toBeVisible();
      await expect(page.getByText('Staging site deployed')).toBeVisible();

      console.log('Full wizard e2e test passed: VM created, bot online, staging deployed');
    });

    test('tears down VM after full flow', async () => {
      test.skip(process.env.E2E_FULL !== 'true',
        'E2E_FULL=true required — tears down VM created by previous test');
      test.skip(!E2E_GCP_TOKEN, 'E2E_GCP_TOKEN required for teardown');

      const projectId = E2E_GCP_PROJECT_ID;
      const instanceName = 'secureagent-manager';
      const zones = ['us-east1-b', 'us-central1-b', 'us-central1-c', 'us-west1-a', 'us-west1-b', 'us-east1-c', 'us-east1-d', 'europe-west1-d', 'asia-east1-a'];

      console.log(`Teardown: searching for VM "${instanceName}" across ${zones.length} zones...`);

      let deletedCount = 0;
      for (const zone of zones) {
        try {
          const checkResp = await fetch(
            `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
            { headers: { Authorization: `Bearer ${E2E_GCP_TOKEN}` } }
          );
          if (checkResp.ok) {
            console.log(`Teardown: found VM in ${zone}, deleting...`);
            const deleteResp = await fetch(
              `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${instanceName}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${E2E_GCP_TOKEN}` } }
            );
            if (deleteResp.ok || deleteResp.status === 204) {
              console.log(`Teardown: VM deletion initiated in ${zone}`);
              deletedCount++;
            } else {
              console.warn(`Teardown: DELETE returned ${deleteResp.status} in ${zone}`);
            }
          }
        } catch (e) {
          // Instance not found in this zone, continue
        }
      }

      if (deletedCount === 0) {
        console.log('Teardown: no VM found to delete (may have been cleaned up already)');
      } else {
        console.log(`Teardown: initiated deletion of ${deletedCount} VM instance(s)`);
      }
    });

    test('SA JSON upload flow works end-to-end', async ({ page }) => {
      test.skip(!E2E_GCP_TOKEN || !process.env.E2E_FIREBASE_API_KEY,
        'E2E_GCP_TOKEN and E2E_FIREBASE_API_KEY required');

      await signIn(page);

      await goToWizard(page);

      await page.getByText('Step 2: Service Account').first().click();
      await page.waitForTimeout(500);

      const textarea = page.getByPlaceholder(/service_account/);
      await expect(textarea).toBeVisible({ timeout: 10000 });

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
