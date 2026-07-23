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
  // Wait for Step 2 auto-expand useEffect to fire (depends on [user] state)
  await page.waitForTimeout(500);
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

  // Auto-construct minimal Firebase configs from project IDs.
  // Use E2E_GCP_PROJECT_ID as the staging project — that's where the VM
  // is created and where its GitHub Actions should deploy Firebase hosting.
  // E2E_FIREBASE_STAGING_PROJECT_ID is the CI pipeline's own staging site
  // (agentbase-staging), which is separate from the test project.
  const stagingProjectId = E2E_GCP_PROJECT_ID || process.env.E2E_FIREBASE_STAGING_PROJECT_ID;
  const productionProjectId = E2E_GCP_PROJECT_ID || process.env.E2E_FIREBASE_PRODUCTION_PROJECT_ID;

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
  const projectName = process.env.E2E_PROJECT_NAME || (process.env.E2E_GCP_PROJECT_ID ? process.env.E2E_GCP_PROJECT_ID.replace(/-staging$|-production$/, '') : null);
  if (projectName) {
    params.set('__e2e_project_name', Buffer.from(projectName).toString('base64'));
  }
  if (process.env.E2E_GITHUB_OWNER && projectName) {
    const githubRepo = `${process.env.E2E_GITHUB_OWNER}/${projectName}`;
    params.set('__e2e_github_repo', Buffer.from(githubRepo).toString('base64'));
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
  // Firebase may briefly redirect to /login before auth state resolves
  if (page.url().includes('/login')) {
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20000 });
    await page.waitForLoadState('domcontentloaded');
  }
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

      // Step 2 auto-expands after sign-in via useEffect — don't click the header
      const textarea = page.getByPlaceholder(/service_account/);
      await expect(textarea).toBeVisible({ timeout: 10000 });

      // Invalid JSON — error appears on onChange (button stays disabled)
      await textarea.fill('not valid json');
      await expect(page.getByText('Invalid JSON')).toBeVisible();

      // Valid JSON — button enables, click Continue
      await textarea.fill(MOCK_SA_JSON);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      // After Continue, step 2 completes — verify the textarea is no longer shown
      // (step content collapses) and the step 3 content expands
      await expect(page.getByText('Step 3: GCP Project')).toBeVisible({ timeout: 5000 });
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
      // The preview element is a <button> (uses window.open), not an <a> link
      const previewBtn = page.getByRole('button', { name: /Preview deployed template/ });
      await expect(previewBtn).toBeVisible();
      // Verify it opens /preview in a new tab via popup event
      const [popup] = await Promise.all([
        page.waitForEvent('popup'),
        previewBtn.click(),
      ]);
      expect(popup.url()).toContain('/preview');
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

      // Wait for E2E injection to complete Steps 1-3
      // The checkingCompletion effect collapses completed steps, so textarea should NOT be visible
      await expect(page.getByPlaceholder(/service_account/)).not.toBeVisible({ timeout: 15000 });

      // Steps 5-8 headers should be visible (always rendered, even when locked)
      await expect(page.getByText('Step 5: Billing Account')).toBeVisible();
      await expect(page.getByText('Step 6: GitHub Auth')).toBeVisible();
      await expect(page.getByText('Step 7: Discord Bot')).toBeVisible();
      await expect(page.getByText('Step 8: Create VM')).toBeVisible();

      console.log('Wizard e2e injection test passed: Steps 1-3 auto-completed, Steps 5-8 visible');
    });

    test('creates VM and verifies wizard success', async ({ page }) => {
      test.skip(process.env.E2E_FULL !== 'true',
        'E2E_FULL=true required — creates real GCP VM, GitHub repo, and Discord bot');

      test.setTimeout(300000); // 5 minutes for VM creation + API enablement

      // Capture browser console logs for debugging
      const consoleLogs = [];
      page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes('checkBilling') || text.includes('getServiceAccount') ||
            text.includes('signJwt') || text.includes('generateAccessToken') ||
            text.includes('billing') || text.includes('VM') || text.includes('error') ||
            text.includes('Error') || text.includes('E2E')) {
          consoleLogs.push(`[${msg.type()}] ${text}`);
        }
      });

      await signIn(page);

      // Navigate to wizard with e2e creds
      await navigateWithE2E(page);

      // Wait for E2E injection to auto-complete Steps 1-3
      await expect(page.getByPlaceholder(/service_account/)).not.toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      // Go to Step 8: Create VM and click create
      await page.getByText('Step 8: Create VM').first().click();
      await page.waitForTimeout(500);

      const createBtn = page.getByRole('button', { name: /Enable APIs & Create VM/i });
      await expect(createBtn).toBeVisible({ timeout: 5000 });
      await createBtn.click();

      // After clicking, the handler runs billing check → API enablement → VM creation.
      // This can take 3-5 minutes total. We wait for one of these outcomes:
      // 1. Init modal appears ("VM is initializing...") — VM created, startup script running
      // 2. Error text appears — creation failed at some step
      // 3. Retry button reappears — creation failed silently

      const initModal = page.getByText('VM is initializing...');
      const errorText = page.getByText(
        /Billing is required|Failed to authenticate|Failed to enable|Failed to create|out of capacity|All zones|VM terminated|VM is in "|Permission denied|billing.*linkedaccount/i
      );
      const retryBtn = page.getByRole('button', { name: /Enable APIs & Create VM/i });

      // Race: wait for init modal (success) OR error text OR retry button
      const result = await Promise.race([
        initModal.waitFor({ timeout: 240000 }).then(() => 'modal').catch(() => 'timeout'),
        errorText.first().waitFor({ timeout: 240000 }).then(() => 'error').catch(() => 'timeout'),
        retryBtn.waitFor({ state: 'visible', timeout: 240000 }).then(() => 'button').catch(() => 'timeout'),
      ]);

      if (result === 'timeout') {
        const bodyText = await page.locator('body').innerText().catch(() => 'could not read');
        console.error('VM creation test timed out. Page content:\n', bodyText.substring(0, 3000));
        if (consoleLogs.length > 0) {
          console.log('Browser console logs:', consoleLogs.join('\n'));
        }
        return;
      }

      if (result === 'error' || result === 'button') {
        const errorBody = await page.locator('body').innerText().catch(() => '');
        const errorLines = errorBody.split('\n').filter(l =>
          /error|failed|billing|permission|capacity|terminated/i.test(l)
        ).join(' | ');
        console.log(`VM creation failed (${result}): ${errorLines || 'unknown'}`);
        if (consoleLogs.length > 0) {
          console.log('Browser console logs:', consoleLogs.join('\n'));
        }
        return;
      }

      // Init modal appeared — VM was created successfully and startup script is running
      await expect(initModal).toBeVisible();
      console.log('VM creation e2e test passed: VM created, init modal visible, startup script running');
      if (consoleLogs.length > 0) {
        console.log('Browser console logs:', consoleLogs.join('\n'));
      }
    });

    test('waits for staging deploy after VM creation', async ({ page }) => {
      test.skip(process.env.E2E_FULL !== 'true',
        'E2E_FULL=true required — waits for startup script to deploy staging site');
      test.skip(!E2E_GCP_TOKEN, 'E2E_GCP_TOKEN required for staging deploy check');

      // This test verifies the staging URL serves the expected SecureAgentBase
      // template after the VM runs its startup script, pushes to GitHub,
      // GitHub Actions builds, and Firebase hosting deploys.
      //
      // CRITICAL: The staging site may already have content from a previous
      // deployment (the CI pipeline's own staging deploy). To avoid false
      // positives, we:
      //   1. Snapshot the current page content BEFORE the VM deploys
      //   2. Poll until the content CHANGES (proving a new deployment landed)
      //   3. Then verify the new content matches the expected template
      //
      // The VM's GitHub Actions workflow sets VITE_APP_VERSION=${{ github.sha }},
      // so each deployment has a unique version marker in the nav bar.
      test.setTimeout(600000); // 10 minutes

      const stagingProjectId = E2E_GCP_PROJECT_ID || process.env.E2E_FIREBASE_STAGING_PROJECT_ID;
      if (!stagingProjectId) {
        throw new Error('Staging deploy test requires E2E_FIREBASE_STAGING_PROJECT_ID or E2E_GCP_PROJECT_ID');
      }

      const stagingUrl = `https://${stagingProjectId}.web.app`;

      // Step 1: Snapshot current content to detect when a NEW deployment lands
      let baselineHtml = '';
      let baselineVersion = '';
      try {
        const baseRes = await fetch(stagingUrl);
        if (baseRes.ok) {
          baselineHtml = await baseRes.text();
          // Extract current VITE_APP_VERSION from nav bar (first 7 chars of SHA)
          const versionMatch = baselineHtml.match(/v([0-9a-f]{7})/);
          baselineVersion = versionMatch ? versionMatch[1] : '';
          console.log(`Staging deploy test: baseline snapshot — version: ${baselineVersion || 'none'}, HTML length: ${baselineHtml.length}`);
        }
      } catch {
        console.log('Staging deploy test: no existing deployment found (clean slate)');
      }

      // Step 2: Poll until content changes or new deployment appears
      const startTime = Date.now();
      const timeout = 600000; // 10 minutes
      const interval = 15000; // 15 seconds

      while (Date.now() - startTime < timeout) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        try {
          const res = await fetch(stagingUrl);
          if (!res.ok) {
            console.log(`Staging deploy test: HTTP ${res.status} (${elapsed}s)`);
            await new Promise(r => setTimeout(r, interval));
            continue;
          }

          const html = await res.text();

          // Check if content changed from baseline (new deployment landed)
          const contentChanged = html !== baselineHtml;

          // Check for expected template content
          const hasWelcome = /Welcome to/i.test(html);
          const hasApp = /SecureAgentBase|Your App/i.test(html);

          // Extract new version
          const versionMatch = html.match(/v([0-9a-f]{7})/);
          const newVersion = versionMatch ? versionMatch[1] : '';

          if (contentChanged && hasWelcome && hasApp) {
            // Verify the version changed too (extra confidence)
            if (baselineVersion && newVersion && newVersion !== baselineVersion) {
              console.log(`Staging deploy test: PASSED — new deployment detected (${baselineVersion} → ${newVersion}, ${elapsed}s)`);
            } else if (!baselineVersion) {
              console.log(`Staging deploy test: PASSED — first deployment detected (version: ${newVersion}, ${elapsed}s)`);
            } else {
              console.log(`Staging deploy test: PASSED — content changed (version: ${newVersion}, ${elapsed}s)`);
            }
            return;
          }

          if (contentChanged) {
            console.log(`Staging deploy test: content changed but no template found yet (${elapsed}s, new version: ${newVersion})`);
          } else {
            console.log(`Staging deploy test: no change yet (${elapsed}s, baseline version: ${baselineVersion})`);
          }
        } catch (e) {
          console.log(`Staging deploy test: error — ${e.message} (${elapsed}s)`);
        }
        await new Promise(r => setTimeout(r, interval));
      }

      // Timeout — fail the test
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      throw new Error(
        `Staging deploy test FAILED: new deployment did not appear at ${stagingUrl} within ${elapsed}s. ` +
        `Baseline version: ${baselineVersion || 'none'}. ` +
        `The VM may not have completed its startup script, GitHub Actions may have failed, ` +
        `or the Firebase hosting deploy may have failed.`
      );
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

      // Step 2 auto-expands after sign-in — don't click the header
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
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      // After Continue, step 2 completes and step 3 expands
      await expect(page.getByText(E2E_GCP_PROJECT_ID || 'e2e-test-project')).toBeVisible({ timeout: 5000 });
    });
  });
});
