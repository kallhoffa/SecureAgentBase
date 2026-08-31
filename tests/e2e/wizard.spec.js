import { test, expect } from '@playwright/test';

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';

// Test credentials (must match a real Firebase Auth user in the staging project)
const E2E_USER = {
  email: process.env.E2E_TEST_EMAIL || 'e2e@agentbase-staging.iam.gserviceaccount.com',
  password: process.env.E2E_TEST_PASSWORD || '',
};

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

// Helper: navigate to wizard and wait for it to render.
// The wizard is accessible signed-out, and the Discord step (1) auto-expands
// for everyone on mount, so we wait on its header.
const goToWizard = async (page) => {
  await page.goto(`${TEST_URL}/infra-setup`);
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText('Step 1: Discord Bot')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
};

// Helper: navigate to wizard with e2e credentials injected.
// extraParams.skipGithubPat:true keeps the GitHub step open (the test pastes
// the PAT manually instead of letting the injection complete step 2).
const navigateWithE2E = async (page, extraParams = {}) => {
  const { skipGithubPat, ...restParams } = extraParams;
  const params = new URLSearchParams();

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
  if (process.env.E2E_GITHUB_PAT && !skipGithubPat) {
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
  // NOTE: __e2e_billing_enabled is intentionally NOT injected anymore. The
  // wizard now performs a REAL billing check + link in e2e mode (the previous
  // run's teardown unlinks billing), so the full billing flow gets tested.

  for (const [key, val] of Object.entries(restParams)) {
    if (val) params.set(key, val);
  }

  const qs = params.toString();
  await page.goto(`${TEST_URL}/infra-setup${qs ? '?' + qs : ''}`);
  await page.waitForLoadState('domcontentloaded');
  // No redirect to /login — wizard is fully accessible signed-out.
  await expect(page.getByText('Step 1: Discord Bot')).toBeVisible({ timeout: 15000 });
};

// Open a wizard step by clicking its header, retrying until the given input is
// visible (hard deadline + attempt cap so the loop always terminates).
//
// Why retry: the shared e2e user's Firestore doc carries completion flags
// (e.g. discord_bot_added) from previous runs — a step can therefore load
// already-complete and open. It can also flip mid-interaction: the async
// config restore sets those flags AFTER first paint, so a step that was
// locked on initial render may unlock moments after our first click.
//
// Opens via a direct DOM click (no Playwright actionability waiting, so it
// cannot hang on animations/overlays/navigations). A failure leaves a precise
// expect(...).toBeVisible timeout with a DOM snapshot instead.
const openStepIfNeeded = async (targetPage, stepTitle, inputLocator, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline && attempts < 30) {
    attempts += 1;
    if (await inputLocator.isVisible().catch(() => false)) return true;
    const clicked = await targetPage.evaluate((title) => {
      const header = [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim().startsWith(title) && b.offsetParent !== null);
      if (!header) return false;
      header.click();
      return true;
    }, stepTitle).catch(() => false);
    if (!clicked) return false;
    await targetPage.waitForTimeout(300);
  }
  return false;
};

test.describe('Wizard E2E Regression', () => {

  // ---------- Signed-out access tests (app mode only) ----------
  test.describe('Signed-out Access', () => {
    test('loads wizard signed-out without redirect', async ({ page }) => {
      test.skip(process.env.E2E_APP_MODE !== 'true', 'Wizard route only available in app mode');
      await page.goto(`${TEST_URL}/infra-setup`);
      await page.waitForLoadState('domcontentloaded');
      // Must NOT bounce to /login — wizard is fully accessible signed-out.
      await expect(page).toHaveURL(new RegExp(`/infra-setup`), { timeout: 10000 });
      // Discord step (1) auto-expands — never locked.
      await expect(page.getByText('Discord Bot Token:')).toBeVisible({ timeout: 10000 });
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

    test('shows all 3 step headers', async ({ page }) => {
      await goToWizard(page);
      const steps = [
        'Step 1: Discord Bot',
        'Step 2: GitHub',
        'Step 3: Google Cloud',
      ];
      for (const step of steps) {
        await expect(page.getByText(step)).toBeVisible({ timeout: 10000 });
      }
    });

    test('Discord step auto-expands after sign-in', async ({ page }) => {
      await goToWizard(page);
      // Step 1 (Discord) auto-expands on mount for everyone — token input visible
      const tokenInput = page.getByPlaceholder(/MTE4/);
      await expect(tokenInput).toBeVisible({ timeout: 10000 });
    });

    test('locked steps show correct message', async ({ page }) => {
      await goToWizard(page);
      // Step 3 is locked until GitHub (step 2) completes. Locked headers are
      // not clickable — the lock note renders inline on the header.
      await expect(page.getByText('(Complete previous step first)').first()).toBeVisible({ timeout: 10000 });
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

      // E2E injection completes Discord (step 1) + GitHub (step 2).
      // Completed steps stay expanded (no auto-collapse), so just verify
      // the step headers are visible and step 3 is unlocked.
      await page.waitForTimeout(2000); // allow injection to settle

      // All 3 headers always render (even when locked/complete)
      await expect(page.getByText('Step 1: Discord Bot')).toBeVisible();
      await expect(page.getByText('Step 2: GitHub')).toBeVisible();
      await expect(page.getByText('Step 3: Google Cloud')).toBeVisible();

      // Step 3 is unlocked (GitHub pat injected) and its sections render.
      // Injection never dispatches EXPAND_STEP 3 on its own, so open the
      // step by clicking its header (with a re-click guard in case the
      // toggle collapsed it) — same pattern as the VM creation test.
      const step3SectionOne = page.getByText('1. Connect Google Cloud & Service Account');
      if (!(await step3SectionOne.isVisible().catch(() => false))) {
        await page.getByText('Step 3: Google Cloud').first().click();
        await page.waitForTimeout(400);
      }
      if (!(await step3SectionOne.isVisible().catch(() => false))) {
        await page.getByText('Step 3: Google Cloud').first().click();
        await page.waitForTimeout(400);
      }
      await expect(step3SectionOne).toBeVisible({ timeout: 10000 });

      console.log('Wizard e2e injection test passed: Steps 1-2 auto-completed, Step 3 unlocked with sections');
    });

    test('creates VM and verifies wizard success', async ({ page }) => {
      test.skip(process.env.E2E_FULL !== 'true',
        'E2E_FULL=true required — creates real GCP VM, GitHub repo, and Discord bot');

      // 10 minutes total: up to 90s billing link wait + up to 90s GitHub
      // variables wait (both BEFORE the click), plus VM creation (API
      // enablement polls up to 30s per API across ~5 APIs, zone-capacity
      // fallbacks, instance provisioning) with a 6-minute race budget.
      test.setTimeout(600000);

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

      // E2E injection auto-completes Discord + GitHub. Completed steps
      // stay expanded (no auto-collapse).
      await page.waitForTimeout(2000); // allow injection to settle
      await page.waitForTimeout(1000);

      // Step 3 (Google Cloud) holds the Create VM section. The e2e auto-OIDC
      // setup dispatches EXPAND_STEP 3 once all creds are injected, so the
      // section usually appears on its own. If not, toggle the header (with
      // a re-click guard in case step 3 is still locked/collapsed).
      const sectionOne = page.getByText('1. Connect Google Cloud & Service Account');
      if (!(await sectionOne.isVisible().catch(() => false))) {
        await page.getByText('Step 3: Google Cloud').first().click();
        await page.waitForTimeout(400);
      }
      if (!(await sectionOne.isVisible().catch(() => false))) {
        await page.getByText('Step 3: Google Cloud').first().click();
        await page.waitForTimeout(400);
      }
      await expect(sectionOne).toBeVisible({ timeout: 10000 });

      if (page.url().includes('/login')) {
        throw new Error('Redirected to /login — Firebase auth failed silently');
      }

      const createBtn = page.getByRole('button', { name: /Enable APIs & Create VM/i });
      // Defensive: the shared e2e user's Firestore config can carry a stale
      // vm_ip from an earlier run, which renders the "VM created and ready"
      // view (Delete VM / Recreate VM) instead of the Create button. The app
      // now ignores vm_ip on load in E2E mode, but handle it here too so a
      // retry after a same-run VM creation can't hide the button.
      // NOTE: the create section itself ALSO contains a "Recreate VM" button
      // (starts creation with isRecreate:true), so gate on the ready-view
      // text, NOT the button name — clicking the wrong one kicks off VM
      // creation and hides the Create button.
      const readyView = page.getByText('VM created and ready');
      if (await readyView.isVisible().catch(() => false)) {
        console.log('E2E: stale VM state detected, clicking Recreate VM to reveal create button');
        await page.getByRole('button', { name: /Recreate VM/i }).first().click();
        await page.waitForTimeout(400);
      }

      // Wait for the REAL billing link to land before creating the VM. The
      // wizard's e2e auto-billing effect runs on injection (check → list →
      // link → verify) and flips data-billing-linked="true" when done. If it
      // stays false, the e2e-test-runner SA is missing roles/billing.user on
      // the billing account — fail fast with the fix instead of a vague
      // "Billing is required" error 3 minutes later.
      const billingSection = page.locator('[data-billing-linked="true"]');
      try {
        await billingSection.first().waitFor({ timeout: 90000 });
        console.log('E2E: billing is linked (real check + link flow ran)');
      } catch (_) {
        throw new Error(
          'E2E: billing was not linked within 90s. The e2e-test-runner SA needs roles/billing.user on the billing account:\n' +
          '  gcloud billing accounts add-iam-policy-binding <BILLING_ACCOUNT> \\\n' +
          '    --member="serviceAccount:e2e-test-runner@agentbase-test-staging.iam.gserviceaccount.com" \\\n' +
          '    --role="roles/billing.user"'
        );
      }

      // Assert the GitHub variable upload REALLY landed — against the GitHub
      // API, not console logs. uploadGitHubVars swallows upload errors in e2e
      // mode (so a failing PAT can't trip this test with an error box), which
      // means the old "vars uploaded successfully" console line could lie
      // while every setGitHubVariable call 403'd. The deploy-critical set
      // must exist AND have been refreshed by THIS run (updated_at within
      // the last 15 minutes — stale variables from a previous run don't
      // count, the OIDC values are per-run).
      const e2eGithubPat = process.env.E2E_GITHUB_PAT || '';
      if (e2eGithubPat) {
        const requiredVars = ['GCP_WIF_PROVIDER', 'GCP_SA_STAGING', 'FIREBASE_PROJECT_ID_STAGING', 'VITE_APP_NAME'];
        const varsUrl = `https://api.github.com/repos/${process.env.E2E_GITHUB_OWNER || 'kallhoffa'}/${process.env.E2E_PROJECT_NAME || 'agentbase-testing'}/actions/variables?per_page=100`;
        let varsOk = false;
        let lastVarsDetail = 'not fetched yet';
        const varsDeadline = Date.now() + 90000;
        while (Date.now() < varsDeadline) {
          try {
            const varsResp = await fetch(varsUrl, {
              headers: { Authorization: `token ${e2eGithubPat}`, Accept: 'application/vnd.github+json' },
            });
            if (varsResp.ok) {
              const varsData = await varsResp.json();
              const byName = Object.fromEntries((varsData.variables || []).map(v => [v.name, v]));
              const staleOrMissing = requiredVars.filter(name => {
                const v = byName[name];
                if (!v) return true;
                return (Date.now() - new Date(v.updated_at).getTime()) / 60000 >= 15;
              });
              lastVarsDetail = `present ${requiredVars.length - staleOrMissing.length}/${requiredVars.length}` +
                (staleOrMissing.length ? `, stale/missing: ${staleOrMissing.join(', ')}` : '');
              if (staleOrMissing.length === 0) {
                varsOk = true;
                break;
              }
              console.log(`E2E: waiting for GitHub variables upload (${lastVarsDetail})`);
            } else {
              console.log(`E2E: GitHub variables fetch HTTP ${varsResp.status} — check E2E_GITHUB_PAT Variables read permission`);
            }
          } catch (e) {
            console.log(`E2E: GitHub variables fetch error: ${e.message}`);
          }
          await page.waitForTimeout(5000);
        }
        if (!varsOk) {
          throw new Error(
            `E2E: deploy-critical GitHub variables were not refreshed by the wizard upload within 90s (${lastVarsDetail}). ` +
            'The staging deploy cannot authenticate without GCP_WIF_PROVIDER/GCP_SA_STAGING. ' +
            'Check E2E_GITHUB_PAT has Variables Read and Write, and the wizard console for "Failed to upload GitHub vars".'
          );
        }
        console.log('E2E: GitHub variables verified fresh via API (GCP_WIF_PROVIDER, GCP_SA_STAGING, FIREBASE_PROJECT_ID_STAGING, VITE_APP_NAME)');
      }

      await expect(createBtn).toBeVisible({ timeout: 5000 });
      await createBtn.click();

      // After clicking, the handler runs billing check → API enablement → VM creation.
      // This can take 3-5 minutes total. We wait for one of these outcomes:
      // 1. Init modal appears ("VM is initializing...") — VM created, startup script running
      // 2. Error text appears — creation failed at some step
      // 3. Retry button reappears — creation failed silently

      const initModal = page.getByText('VM is initializing...');
      // NOTE: 'out of capacity' alone must NOT match — the wizard logs
      // "Zone X may be out of capacity, trying next zone..." as a normal
      // zone-fallback recovery line while still creating the VM. Only the
      // fatal "All zones are out of capacity" (matched via 'All zones') is
      // a real failure.
      const errorText = page.getByText(
        /Billing is required|Failed to authenticate|Failed to enable|Failed to create|Failed to store secrets|All zones|VM terminated|VM is in "|Permission denied|billing.*linkedaccount/i
      );
      const retryBtn = page.getByRole('button', { name: /Enable APIs & Create VM/i });

      // The button is still visible right after click (React re-render lag).
      // Wait for it to DISAPPEAR first — proves the handler took over and
      // set step4Status to 'enabling'. Without this, retryBtn.waitFor below
      // resolves instantly against the still-visible button, producing a
      // false 'button' result even though VM creation is proceeding.
      await expect(retryBtn).not.toBeVisible({ timeout: 15000 });

      // Race: wait for init modal (success) OR error text OR retry button.
      // 6 minutes: VM creation includes API enablement polls (up to 30s per
      // API) plus zone-capacity fallbacks — 4 minutes was marginal and failed
      // while the VM was still being created successfully in the background.
      const result = await Promise.race([
        initModal.waitFor({ timeout: 360000 }).then(() => 'modal').catch(() => 'timeout'),
        errorText.first().waitFor({ timeout: 360000 }).then(() => 'error').catch(() => 'timeout'),
        retryBtn.waitFor({ state: 'visible', timeout: 360000 }).then(() => 'button').catch(() => 'timeout'),
      ]);

      if (result === 'timeout') {
        const bodyText = await page.locator('body').innerText().catch(() => 'could not read');
        console.error('VM creation test timed out. Page content:\n', bodyText.substring(0, 3000));
        if (consoleLogs.length > 0) {
          console.log('Browser console logs:', consoleLogs.join('\n'));
        }
        throw new Error('VM creation timed out after 6 minutes');
      }

      if (result === 'error' || result === 'button') {
        const errorBody = await page.locator('body').innerText().catch(() => '');
        const errorLines = errorBody.split('\n').filter(l =>
          /error|failed|billing|permission|capacity|terminated/i.test(l)
        ).join(' | ');
        const errMsg = `VM creation failed (${result}): ${errorLines || 'unknown'}`;
        if (consoleLogs.length > 0) {
          console.log('Browser console logs:', consoleLogs.join('\n'));
        }
        throw new Error(errMsg);
      }

      // Init modal appeared — VM was created successfully and startup script is running
      await expect(initModal).toBeVisible();
      console.log('VM creation e2e test passed: VM created, init modal visible, startup script running');

      // Capture serial port logs from the init modal DOM (the dark terminal-style div)
      await page.waitForTimeout(5000); // wait for some serial port output to appear
      const serialLogEl = page.locator('.bg-gray-900.font-mono');
      if (await serialLogEl.isVisible({ timeout: 3000 }).catch(() => false)) {
        const serialContent = await serialLogEl.innerText();
        if (serialContent && serialContent !== 'Waiting for serial port logs...') {
          console.log('Serial port logs from init modal:\n' + serialContent);
        } else {
          console.log('Serial port logs: still waiting for output');
        }
      }

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
      console.log(`Staging deploy test: polling ${stagingUrl}`);

      // Pre-check 1: Fetch serial port output from VM to see startup script progress
      let serialOutput = '';
      let repoStale = false;
      let foundVmZone = null; // saved for periodic diagnostics
      const instanceName = 'secureagent-manager'; // hoisted: periodic diag uses it too
      if (E2E_GCP_TOKEN) {
        const zones = ['us-east1-b', 'us-central1-b', 'us-central1-c', 'us-west1-a', 'us-west1-b', 'us-east1-c', 'us-east1-d', 'europe-west1-d', 'asia-east1-a'];
        for (const zone of zones) {
          try {
            const resp = await fetch(
              `https://compute.googleapis.com/compute/v1/projects/${stagingProjectId}/zones/${zone}/instances/${instanceName}/serialPort?port=1`,
              { headers: { Authorization: `Bearer ${E2E_GCP_TOKEN}` } }
            );
            if (resp.ok) {
              const data = await resp.json();
              serialOutput = data.contents || '';
              foundVmZone = zone;
              break;
            }
          } catch (_) { /* zone not found, try next */ }
        }
        if (serialOutput) {
          const tail = serialOutput.slice(-3000);
          console.log(`Serial port output from VM (last 3000 chars):\n${tail}`);
          if (/Permission denied|fatal:.*repository.*not found|error:.*push/i.test(tail)) {
            console.log('WARNING: Serial port shows git push failure — GitHub Actions deploy will not trigger');
          }
          const pushMatch = tail.match(/PUSH_RESULT=(\w+)/);
          const scriptMatch = tail.match(/SCRIPT_COMPLETE\|PUSH=(\w+)/);
          if (pushMatch) console.log(`Serial port push result: ${pushMatch[1]}`);
          if (scriptMatch) console.log(`Serial port script complete: push=${scriptMatch[1]}, repo=${(tail.match(/SCRIPT_COMPLETE\|PUSH=\w+\|REPO=([^|]+)/) || [])[1] || '?'}`);
          const permsMatch = tail.match(/PAT_PERMS:\s*(.+)/);
          if (permsMatch) console.log(`Serial port PAT permissions: ${permsMatch[1]}`);
        } else {
          console.log('Serial port: VM not found in any zone, or serial port output unavailable');
        }

        // Pre-check 2: Check if the GitHub repo was updated recently
        const githubPat = process.env.E2E_GITHUB_PAT || '';
        if (githubPat) {
          try {
            const repoResp = await fetch('https://api.github.com/repos/kallhoffa/agentbase-testing/commits?per_page=1', {
              headers: { Authorization: `token ${githubPat}`, Accept: 'application/vnd.github+json' },
            });
            if (repoResp.ok) {
              const commits = await repoResp.json();
              if (commits.length > 0) {
                const ageMinutes = Math.round((Date.now() - new Date(commits[0].commit.committer.date).getTime()) / 60000);
                console.log(`GitHub repo last commit: ${commits[0].sha.substring(0, 7)} (${ageMinutes} min ago) — ${commits[0].commit.message.substring(0, 80)}`);
                repoStale = ageMinutes > 30;
                if (repoStale) {
                  console.log('WARNING: Repo not updated recently — VM push likely failed. GitHub Actions deploy will not trigger.');
                }
              }
            } else {
              console.log(`GitHub repo check: HTTP ${repoResp.status}`);
            }
          } catch (e) {
            console.log(`GitHub repo check error: ${e.message}`);
          }
        }
      }

      // Fail-fast: if no VM was found AND repo is stale, the VM creation
      // (previous test) failed — no point polling for 10 minutes.
      if (serialOutput === '' && repoStale) {
        throw new Error(`Staging deploy test: VM not found and repo untouched >30 min — VM creation failed.`);
      }

      // Fail-fast: if serial port shows the PAT itself is broken (curl probe
      // 401/403/404), no deployment can ever land — the VM push will fail.
      // (The gh probe failing is NOT fatal — the push uses git's credential
      // store and no longer depends on gh auth.)
      if (serialOutput) {
        const tail = serialOutput.slice(-3000);
        const probeMatch = tail.match(/PAT_PROBE: type=(\S+) curl=(\w+) gh=(\w+)/);
        if (probeMatch) {
          const [, patType, curlCode, ghState] = probeMatch;
          console.log(`Staging deploy test: VM PAT probe — type=${patType}, curl=${curlCode}, gh=${ghState}`);
          if (curlCode === '401') {
            throw new Error('Staging deploy test: VM PAT probe returned 401 (invalid token) — the Secret Manager github-pat secret does not match the current E2E_GITHUB_PAT. Update the secret and retry.');
          }
          if (curlCode === '403') {
            throw new Error('Staging deploy test: VM PAT probe returned 403 (token valid but forbidden) — check the PAT\'s repository access includes the target repo.');
          }
          if (curlCode === '404') {
            throw new Error('Staging deploy test: VM PAT probe returned 404 (no visibility of the repo) — check the PAT\'s repository access scope and Metadata permission.');
          }
          if (curlCode === '000' || curlCode === 'ERR') {
            throw new Error('Staging deploy test: VM PAT probe could not reach api.github.com (curl failed) — VM network issue.');
          }
        }
        // Also detect the SCRIPT_COMPLETE marker with push result
        const scriptMatch = tail.match(/SCRIPT_COMPLETE\|PUSH=(\w+)/);
        if (scriptMatch) {
          const pushStatus = scriptMatch[1];
          if (pushStatus === 'PUSH_FAILED' || pushStatus === 'ALL_PUSH_FAILED') {
            throw new Error(`Staging deploy test: VM startup push result: ${pushStatus} — GitHub push failed, deploy will not trigger.`);
          }
          if (pushStatus === 'NOT_ATTEMPTED') {
            throw new Error('Staging deploy test: VM startup push was NOT_ATTEMPTED — GITHUB_PAT was empty or missing, deploy will not trigger.');
          }
          console.log(`Staging deploy test: VM push status from serial: ${pushStatus}`);
        }
      }

      // Step 1: Snapshot current content to detect when a NEW deployment lands
      let baselineHtml = '';
      let baselineVersion = '';
      try {
        const baseRes = await fetch(stagingUrl);
        console.log(`Staging deploy test: baseline fetch — HTTP ${baseRes.status}`);
        if (baseRes.ok) {
          baselineHtml = await baseRes.text();
          // Extract current VITE_APP_VERSION from nav bar (first 7 chars of SHA)
          const versionMatch = baselineHtml.match(/v([0-9a-f]{7})/);
          baselineVersion = versionMatch ? versionMatch[1] : '';
          console.log(`Staging deploy test: baseline snapshot — version: ${baselineVersion || 'none'}, HTML length: ${baselineHtml.length}`);
          console.log(`Staging deploy test: baseline first 200 chars: ${baselineHtml.substring(0, 200)}`);
        } else {
          const body = await baseRes.text();
          console.log(`Staging deploy test: baseline not OK — body (first 500): ${body.substring(0, 500)}`);
        }
      } catch (e) {
        console.log(`Staging deploy test: baseline fetch error — ${e.message}`);
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
            const errBody = await res.text().catch(() => '(no body)');
            console.log(`Staging deploy test: HTTP ${res.status} (${elapsed}s) — body: ${errBody.substring(0, 300)}`);
            await new Promise(r => setTimeout(r, interval));
            continue;
          }

          const html = await res.text();

          // Check if content changed from baseline (new deployment landed)
          const contentChanged = html !== baselineHtml;

          // Check for expected template content in raw HTML
          const hasWelcome = /Welcome to/i.test(html);

          // Extract new version from raw HTML (version hash is injected at build time)
          const versionMatch = html.match(/v([0-9a-f]{7})/);
          const newVersion = versionMatch ? versionMatch[1] : '';

          if (contentChanged && hasWelcome) {
            // Fast path: "Welcome to" found directly in raw HTML
            if (baselineVersion && newVersion && newVersion !== baselineVersion) {
              console.log(`Staging deploy test: PASSED — new deployment detected (${baselineVersion} → ${newVersion}, ${elapsed}s)`);
            } else if (!baselineVersion) {
              console.log(`Staging deploy test: PASSED — first deployment detected (version: ${newVersion}, ${elapsed}s)`);
            } else {
              console.log(`Staging deploy test: PASSED — content changed (version: ${newVersion}, ${elapsed}s)`);
            }
            return;
          }

          if (contentChanged && !hasWelcome) {
            // Content changed but "Welcome to" is React-rendered, not in raw HTML.
            // Use Playwright to render the page and check the actual DOM.
            console.log(`Staging deploy test: content changed, checking rendered DOM (${elapsed}s, new version: ${newVersion})`);
            try {
              await page.goto(stagingUrl, { waitUntil: 'networkidle', timeout: 60000 });
              const bodyText = await page.textContent('body');
              const renderedWelcome = /Welcome to/i.test(bodyText);
              console.log(`Staging deploy test: rendered body text (first 300 chars): ${bodyText.substring(0, 300)}`);

              if (renderedWelcome) {
                if (baselineVersion && newVersion && newVersion !== baselineVersion) {
                  console.log(`Staging deploy test: PASSED — new deployment with rendered content (${baselineVersion} → ${newVersion}, ${elapsed}s)`);
                } else {
                  console.log(`Staging deploy test: PASSED — deployment verified via rendered DOM (${elapsed}s, version: ${newVersion})`);
                }
                return;
              }

              // Content changed but React app doesn't render "Welcome to" — may be build error
              const versionBadge = await page.textContent('nav').catch(() => '');
              console.log(`Staging deploy test: rendered nav text: ${versionBadge.substring(0, 200)}`);
              console.log(`Staging deploy test: content changed but rendered app missing "Welcome to" (${elapsed}s)`);
            } catch (renderErr) {
              console.log(`Staging deploy test: page render error — ${renderErr.message}`);
            }
          } else {
            console.log(`Staging deploy test: no change yet (${elapsed}s, baseline version: ${baselineVersion})`);
          }

          // Periodic diagnostics: read serial port and check GitHub state at 3min intervals
          if (elapsed > 60 && elapsed % 180 < interval / 1000) {
            if (E2E_GCP_TOKEN) {
              try {
                const serialResp = await fetch(
                  `https://compute.googleapis.com/compute/v1/projects/${stagingProjectId}/zones/${foundVmZone || 'us-east1-b'}/instances/${instanceName}/serialPort?port=1`,
                  { headers: { Authorization: `Bearer ${E2E_GCP_TOKEN}` } }
                );
                if (serialResp.ok) {
                  const sd = await serialResp.json();
                  const full = sd.contents || '';
                  const tail = full.slice(-3000);
                  console.log(`[diag ${elapsed}s] Serial port (last 3000 chars):\n${tail}`);
                  // Search the FULL buffer for markers — the compact markers
                  // can scroll past the 3000-char tail on verbose boots.
                  const allMarkers = [
                    ...full.matchAll(/PAT_PROBE:[^\n]*/g),
                    ...full.matchAll(/GH_PROBE_ERR:[^\n]*/g),
                    ...full.matchAll(/PUSH_RESULT=\w+/g),
                    ...full.matchAll(/SCRIPT_COMPLETE\|[^\n]*/g),
                    ...full.matchAll(/GITHUB_PAT=(set|missing)/g),
                  ].map(m => m[0]);
                  if (allMarkers.length > 0) {
                    console.log(`[diag ${elapsed}s] Serial markers (full buffer): ${[...new Set(allMarkers)].join(' | ')}`);
                  }
                  // Fail fast: if the startup script already completed but the
                  // secrets were missing (or the push failed), no deployment
                  // will ever land — don't burn the full 10-minute poll.
                  const patMissing = /GITHUB_PAT=missing/i.test(full);
                  const scriptDone = /SCRIPT_COMPLETE/i.test(full);
                  const pushFailed = /PUSH_RESULT=(PUSH_FAILED|ALL_PUSH_FAILED)/i.test(full);
                  if (pushFailed) {
                    throw new Error(`Staging deploy test: VM startup script finished with ${(full.match(/PUSH_RESULT=\w+/i) || ['PUSH_FAILED'])[0]} — GitHub push failed, deploy will not trigger.`);
                  }
                  if (patMissing && scriptDone) {
                    throw new Error('Staging deploy test: VM startup script completed but GITHUB_PAT is missing — Secret Manager fetch failed on the VM, deploy will not trigger.');
                  }
                } else {
                  console.log(`[diag ${elapsed}s] Serial port fetch failed: HTTP ${serialResp.status} (zone ${foundVmZone || 'us-east1-b'})`);
                }
              } catch (e) {
                if (e.message?.startsWith('Staging deploy test:')) throw e;
                console.log(`[diag ${elapsed}s] Serial port fetch error: ${e.message}`);
              }
            }
            const gpat = process.env.E2E_GITHUB_PAT || '';
            if (gpat) {
              try {
                const gr = await fetch(`https://api.github.com/repos/${process.env.E2E_GITHUB_OWNER || 'kallhoffa'}/${process.env.E2E_PROJECT_NAME || 'agentbase-testing'}/commits?per_page=1`, {
                  headers: { Authorization: `token ${gpat}`, Accept: 'application/vnd.github+json' },
                });
                if (gr.ok) {
                  const c = await gr.json();
                  const age = c.length > 0 ? Math.round((Date.now() - new Date(c[0].commit.committer.date).getTime()) / 60000) : -1;
                  console.log(`[diag ${elapsed}s] GitHub last commit: ${c[0]?.sha?.substring(0, 7) || 'none'} (${age} min ago)`);
                }
              } catch (_) {}
            }
          }
        } catch (e) {
          console.log(`Staging deploy test: error — ${e.message} (${elapsed}s)`);
        }
        await new Promise(r => setTimeout(r, interval));
      }

      // Timeout — fail the test
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      // Re-read serial port output NOW (after startup script has had time to run) for diagnostics
      if (E2E_GCP_TOKEN) {
        const instanceName = 'secureagent-manager';
        const zones = ['us-east1-b', 'us-central1-b', 'us-central1-c', 'us-west1-a', 'us-west1-b', 'us-east1-c', 'us-east1-d', 'europe-west1-d', 'asia-east1-a'];
        for (const zone of zones) {
          try {
            const resp = await fetch(
              `https://compute.googleapis.com/compute/v1/projects/${stagingProjectId}/zones/${zone}/instances/${instanceName}/serialPort?port=1`,
              { headers: { Authorization: `Bearer ${E2E_GCP_TOKEN}` } }
            );
            if (resp.ok) {
              const data = await resp.json();
              const serialOutput = data.contents || '';
              // Show the LAST 5000 chars (startup script output appears after boot messages)
              const tail = serialOutput.slice(-5000);
              console.log(`Serial port output at timeout (last 5000 chars from ${zone}):\n${tail}`);
              break;
            }
          } catch (_) {}
        }
      }

      // Check GitHub repo state one more time
      const githubPat = process.env.E2E_GITHUB_PAT || '';
      if (githubPat) {
        try {
          const repoResp = await fetch(`https://api.github.com/repos/${process.env.E2E_GITHUB_OWNER || 'kallhoffa'}/${process.env.E2E_PROJECT_NAME || 'agentbase-testing'}/commits?per_page=3`, {
            headers: { Authorization: `token ${githubPat}`, Accept: 'application/vnd.github+json' },
          });
          if (repoResp.ok) {
            const commits = await repoResp.json();
            console.log(`GitHub repo state at timeout — ${commits.length} recent commits:`);
            commits.forEach(c => console.log(`  ${c.sha.substring(0, 7)} ${c.commit.message.substring(0, 80)} (${c.commit.committer.date})`));
          } else {
            console.log(`GitHub repo check at timeout: HTTP ${repoResp.status}`);
          }
        } catch (e) {
          console.log(`GitHub repo check at timeout error: ${e.message}`);
        }
      }

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

      // --- Unlink billing so the next run can test the full billing link flow ---
      console.log(`Teardown: unlinking billing from project ${projectId}...`);
      try {
        const billingResp = await fetch(
          `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${E2E_GCP_TOKEN}`,
              'Content-Type': 'application/json',
              'x-goog-user-project': projectId,
            },
            body: JSON.stringify({ billingAccountName: '' }),
          }
        );
        if (billingResp.ok) {
          console.log('Teardown: billing unlinked successfully');
        } else {
          const body = await billingResp.text().catch(() => '');
          console.warn(`Teardown: billing unlink returned ${billingResp.status}: ${body.slice(0, 300)}`);
        }
      } catch (e) {
        console.warn(`Teardown: billing unlink error: ${e.message}`);
      }

      // --- Delete VM instances ---
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

    test('GitHub PAT flow completes step 2 and unlocks step 3', async ({ page }) => {
      test.skip(!process.env.E2E_GITHUB_PAT,
        'E2E_GITHUB_PAT required — validates the PAT against the GitHub API');
      test.skip(process.env.E2E_DISCORD_BOT_ADDED !== 'true',
        'E2E_DISCORD_BOT_ADDED=true required — step 2 is locked until Discord completes');
      test.skip(!process.env.E2E_GITHUB_OWNER || !process.env.E2E_PROJECT_NAME,
        'E2E_GITHUB_OWNER and E2E_PROJECT_NAME required to derive the repo name');

      await signIn(page);

      // Inject everything except the GitHub PAT so step 2 stays open for typing
      await navigateWithE2E(page, { skipGithubPat: true });

      // Discord (step 1) is completed via injection → GitHub (step 2) unlocks
      // but starts collapsed. Click the header to expand it and reach the PAT input.
      await page.getByText('Step 2: GitHub').click();
      await page.waitForTimeout(300);

      const patInput = page.getByPlaceholder(/ghp_/);
      await expect(patInput).toBeVisible({ timeout: 10000 });

      await patInput.fill(process.env.E2E_GITHUB_PAT);

      // Listen for the GitHub API call so we can diagnose failures.
      const githubResponsePromise = page.waitForResponse(
        (res) => res.url().includes('api.github.com'),
        { timeout: 30000 }
      ).catch(() => null);

      await page.getByRole('button', { name: 'Save GitHub Configuration' }).click();

      // Wait for the GitHub API response and log the result for diagnostics.
      const ghResp = await githubResponsePromise;
      if (ghResp && !ghResp.ok()) {
        console.error(`[PAT-test] GitHub API ${ghResp.status()}: ${ghResp.url()}`);
        const body = await ghResp.text().catch(() => '<unreadable>');
        console.error(`[PAT-test] GitHub API body: ${body.slice(0, 500)}`);
      } else if (!ghResp) {
        console.error('[PAT-test] No GitHub API response captured within 30s');
      } else {
        console.log(`[PAT-test] GitHub API ${ghResp.status()} OK`);
      }

      // After Save: either the step-3 body appears (success) or an error message
      // shows. Capture whichever wins the race for diagnostics.
      const errorBox = page.locator('.bg-red-50.border.border-red-200');
      const bodyText = page.getByText('1. Connect Google Cloud & Service Account');

      const result = await Promise.race([
        bodyText.waitFor({ state: 'visible', timeout: 20000 }).then(() => 'body-visible'),
        errorBox.first().waitFor({ state: 'visible', timeout: 20000 }).then(async () => {
          const msg = await errorBox.first().textContent().catch(() => '<unreadable>');
          return `error: ${msg}`;
        }),
      ]);

      console.log(`[PAT-test] Race result: ${result}`);

      if (result === 'body-visible') {
        await expect(bodyText).toBeVisible();
      } else {
        // Log full page state for CI debugging
        const pageContent = await page.locator('body').textContent().catch(() => '<unreadable>');
        console.error(`[PAT-test] Page content (first 1000 chars): ${pageContent.slice(0, 1000)}`);
        throw new Error(`PAT save failed: ${result}`);
      }

      // Also verify step 3 header is visible (sanity check)
      await expect(page.getByText('Step 3: Google Cloud')).toBeVisible({ timeout: 5000 });
    });
  });

  // ---------- No state saving: tokens do NOT persist across tabs ----------
  // State saving was removed — verify that tokens entered in one tab do NOT
  // leak to a fresh context via SM restore or browser storage.
  test.describe('No State Saving (Cross-Tab)', () => {
    test.beforeEach(async () => {
      test.skip(process.env.E2E_APP_MODE !== 'true', 'Wizard route only available in app mode');
      test.skip(!process.env.E2E_GITHUB_PAT || !process.env.E2E_DISCORD_TOKEN,
        'E2E_GITHUB_PAT and E2E_DISCORD_TOKEN required');
    });

    test('no state saving: tokens do NOT persist across tabs', async ({ page, context }) => {
      test.setTimeout(300000);

      // ============ Tab 1: enter tokens ============
      console.log('[no-persist] tab1: signIn + goto');
      const browserLogs = [];
      page.on('console', (msg) => browserLogs.push(`[${msg.type()}] ${msg.text()}`));
      page.on('pageerror', (err) => browserLogs.push(`[pageerror] ${err.message}`));
      await signIn(page);
      await page.goto(`${TEST_URL}/infra-setup`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByText('Step 1: Discord Bot')).toBeVisible({ timeout: 15000 });

      // Step 1: Discord bot token
      const discordInput = page.getByPlaceholder(/MTE4/);
      await openStepIfNeeded(page, 'Step 1: Discord Bot', discordInput);
      await expect(discordInput).toBeVisible({ timeout: 10000 });
      await discordInput.fill(process.env.E2E_DISCORD_TOKEN);
      await page.getByRole('button', { name: 'Save Discord Bot' }).click();
      // Invite link appears → "Bot Added — Continue" marks step 1 complete
      const botAddedBtn = page.getByRole('button', { name: /Bot Added/ });
      await expect(botAddedBtn).toBeVisible({ timeout: 10000 });
      await botAddedBtn.click();
      await expect(page.getByText('Step 2: GitHub')).toBeVisible({ timeout: 10000 });

      // Step 2: GitHub PAT
      const patInput = page.getByPlaceholder(/ghp_/);
      await openStepIfNeeded(page, 'Step 2: GitHub', patInput);
      await expect(patInput).toBeVisible({ timeout: 10000 });
      await patInput.fill(process.env.E2E_GITHUB_PAT);
      await page.getByRole('button', { name: 'Save GitHub Configuration' }).click();

      // Verify no browser storage persistence (state saving is disabled)
      const storageState = await page.evaluate(() => ({
        ssDiscord: sessionStorage.getItem('wz_discord_bot_token') || sessionStorage.getItem('discordBotToken'),
        ssPat: sessionStorage.getItem('wz_github_pat') || sessionStorage.getItem('githubPat'),
        lsDiscord: localStorage.getItem('wz_discord_bot_token') || localStorage.getItem('discordBotToken'),
        lsPat: localStorage.getItem('wz_github_pat') || localStorage.getItem('githubPat'),
      })).catch(() => ({}));
      console.log('[no-persist] tab1 storage:', JSON.stringify(storageState));

      // ============ Tab 2: fresh context must start EMPTY ============
      console.log('[no-persist] tab2: fresh context signIn');
      const ctx2 = await context.browser().newContext();
      const page2 = await ctx2.newPage();
      const page2Console = [];
      page2.on('console', (msg) => page2Console.push(`[${msg.type()}] ${msg.text()}`));
      page2.on('pageerror', (err) => page2Console.push(`[pageerror] ${err.message}`));
      await signIn(page2);
      await page2.goto(`${TEST_URL}/infra-setup`);
      await page2.waitForLoadState('domcontentloaded');
      await expect(page2.getByText('Step 1: Discord Bot')).toBeVisible({ timeout: 15000 });

      try {
        const discord2 = page2.getByPlaceholder(/MTE4/);
        await openStepIfNeeded(page2, 'Step 1: Discord Bot', discord2);
        await expect(discord2).toBeVisible({ timeout: 10000 });

        // Fresh context must start EMPTY — no state saving, so tokens from tab 1
        // must not leak through.
        await expect(discord2).toHaveValue('', { timeout: 15000 });
        console.log('[no-persist] tab2: Discord input correctly empty');

        // Step 2 is locked when step 1 isn't complete — verify it's locked
        // (no PAT input visible) rather than checking the input value.
        const step2Header = page2.getByText('Step 2: GitHub');
        await expect(step2Header).toBeVisible({ timeout: 10000 });
        const pat2 = page2.getByPlaceholder(/ghp_/);
        await expect(pat2).not.toBeVisible({ timeout: 5000 });
        console.log('[no-persist] tab2: Step 2 correctly locked (no PAT input visible)');
      } catch (err) {
        console.log('--- TAB2 FAILURE DIAGNOSTICS ---');
        console.log('page2 URL:', page2.url());
        const dom = await page2.evaluate(() => {
          const wizardRoot = document.querySelector('[class*="space-y"]') || document.body;
          return {
            text: wizardRoot.textContent.replace(/\s+/g, ' ').slice(0, 1500),
            patInputs: [...document.querySelectorAll('input[placeholder*="ghp_"]')]
              .map((i) => `hasValue=${i.value.length > 0} visible=${i.offsetParent !== null}`),
            discordInputs: [...document.querySelectorAll('input[placeholder*="MTE4"]')]
              .map((i) => `hasValue=${i.value.length > 0} visible=${i.offsetParent !== null}`),
            stepHeaders: [...document.querySelectorAll('button')]
              .filter((b) => /^Step \d/.test(b.textContent.trim()))
              .map((b) => b.textContent.trim().slice(0, 60)),
          };
        }).catch(() => ({}));
        console.log('tab2 DOM:', JSON.stringify(dom, null, 2));
        console.log('page2 console (last 60):');
        console.log(page2Console.slice(-60).join('\n') || '(no page2 console logs)');
        console.log('--- END TAB2 DIAGNOSTICS ---');
        throw err;
      } finally {
        await ctx2.close().catch(() => {});
      }

      console.log('No-state-saving e2e test passed: tokens do NOT persist across tabs');
    });
  });

  // ---------- No state saving: fresh tab starts empty ----------
  // State saving was removed from main — verify that tokens entered in one
  // tab do NOT leak to a fresh tab via browser storage.
  test.describe('No State Saving (Fresh Tab)', () => {
    test.beforeEach(async () => {
      test.skip(process.env.E2E_APP_MODE !== 'true', 'Wizard route only available in app mode');
      test.skip(!process.env.E2E_GITHUB_PAT || !process.env.E2E_DISCORD_TOKEN,
        'E2E_GITHUB_PAT and E2E_DISCORD_TOKEN required');
    });

    test('steps 1-2 start empty in a fresh tab (no persistence)', async ({ page, context }) => {
      test.setTimeout(300000);

      // ============ Tab 1: enter tokens — NO GCP token injected ============
      // Intentionally skips injectTokenOnly/navigateWithE2E: this test proves
      // the no-step-3 path, so the app must never see a GCP access token.
      console.log('[persist-local] tab1: signIn (no GCP token) + goto');
      const browserLogs = [];
      page.on('console', (msg) => browserLogs.push(`[${msg.type()}] ${msg.text()}`));
      page.on('pageerror', (err) => browserLogs.push(`[pageerror] ${err.message}`));
      await signIn(page);
      await page.goto(`${TEST_URL}/infra-setup`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByText('Step 1: Discord Bot')).toBeVisible({ timeout: 15000 });

      // Step 1: Discord bot token
      const discordInput = page.getByPlaceholder(/MTE4/);
      await openStepIfNeeded(page, 'Step 1: Discord Bot', discordInput);
      await expect(discordInput).toBeVisible({ timeout: 10000 });
      await discordInput.fill(process.env.E2E_DISCORD_TOKEN);
      await page.getByRole('button', { name: 'Save Discord Bot' }).click();
      const botAddedBtn = page.getByRole('button', { name: /Bot Added/ });
      await expect(botAddedBtn).toBeVisible({ timeout: 10000 });
      await botAddedBtn.click();
      await expect(page.getByText('Step 2: GitHub')).toBeVisible({ timeout: 10000 });

      // Step 2: GitHub PAT
      const patInput = page.getByPlaceholder(/ghp_/);
      await openStepIfNeeded(page, 'Step 2: GitHub', patInput);
      await expect(patInput).toBeVisible({ timeout: 10000 });
      await patInput.fill(process.env.E2E_GITHUB_PAT);
      await page.getByRole('button', { name: 'Save GitHub Configuration' }).click();

      // State saving is disabled — verify no browser storage persistence.
      const storageState = await page.evaluate(() => ({
        ssDiscord: sessionStorage.getItem('wz_discord_bot_token') || sessionStorage.getItem('discordBotToken'),
        ssPat: sessionStorage.getItem('wz_github_pat') || sessionStorage.getItem('githubPat'),
        lsDiscord: localStorage.getItem('wz_discord_bot_token') || localStorage.getItem('discordBotToken'),
        lsPat: localStorage.getItem('wz_github_pat') || localStorage.getItem('githubPat'),
      })).catch(() => ({}));
      console.log('[no-persist-local] tab1 storage:', JSON.stringify(storageState));

      // ============ Tab 2: FRESH PAGE in the SAME context ============
      // State saving disabled: tab 2 starts empty regardless of tab 1 state.
      console.log('[no-persist-local] tab2: new page in same context (expect empty)');
      const page2 = await context.newPage();
      const page2Console = [];
      page2.on('console', (msg) => page2Console.push(`[${msg.type()}] ${msg.text()}`));
      page2.on('pageerror', (err) => page2Console.push(`[pageerror] ${err.message}`));
      page2.on('dialog', (dialog) => dialog.dismiss().catch(() => {}));
      await page2.goto(`${TEST_URL}/infra-setup`);
      await page2.waitForLoadState('domcontentloaded');
      await expect(page2.getByText('Step 1: Discord Bot')).toBeVisible({ timeout: 15000 });

      try {
        const discord2 = page2.getByPlaceholder(/MTE4/);
        await openStepIfNeeded(page2, 'Step 1: Discord Bot', discord2);
        await expect(discord2).toBeVisible({ timeout: 10000 });

        // Fresh tab must start EMPTY — no state saving.
        await expect(discord2).toHaveValue('', { timeout: 15000 });
        console.log('[no-persist-local] tab2: Discord input correctly empty in fresh tab');

        // Step 2 is locked when step 1 isn't complete — verify it's locked
        // rather than checking the PAT input value.
        const step2Header = page2.getByText('Step 2: GitHub');
        await expect(step2Header).toBeVisible({ timeout: 10000 });
        const pat2 = page2.getByPlaceholder(/ghp_/);
        await expect(pat2).not.toBeVisible({ timeout: 5000 });
        console.log('[no-persist-local] tab2: Step 2 correctly locked in fresh tab');
      } catch (err) {
        console.log('--- NO-PERSIST TAB2 FAILURE DIAGNOSTICS ---');
        console.log('page2 URL:', page2.url());
        const dom = await page2.evaluate(() => {
          const wizardRoot = document.querySelector('[class*="space-y"]') || document.body;
          return {
            text: wizardRoot.textContent.replace(/\s+/g, ' ').slice(0, 1500),
            patInputs: [...document.querySelectorAll('input[placeholder*="ghp_"]')]
              .map((i) => `hasValue=${i.value.length > 0} visible=${i.offsetParent !== null}`),
            discordInputs: [...document.querySelectorAll('input[placeholder*="MTE4"]')]
              .map((i) => `hasValue=${i.value.length > 0} visible=${i.offsetParent !== null}`),
            stepHeaders: [...document.querySelectorAll('button')]
              .filter((b) => /^Step \d/.test(b.textContent.trim()))
              .map((b) => b.textContent.trim().slice(0, 60)),
          };
        }).catch(() => ({}));
        console.log('tab2 DOM:', JSON.stringify(dom, null, 2));
        console.log('page2 console (last 60):');
        console.log(page2Console.slice(-60).join('\n') || '(no page2 console logs)');
        console.log('--- END NO-PERSIST TAB2 DIAGNOSTICS ---');
        throw err;
      } finally {
        await page2.close().catch(() => {});
      }

      console.log('Fresh-tab test passed: steps 1-2 correctly empty in a fresh tab (no persistence)');
    });
  });
});
