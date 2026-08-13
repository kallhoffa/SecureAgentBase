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
// The wizard is reachable signed-out now (step 0 sign-in is optional), and the
// Discord step (1) auto-expands for everyone on mount, so we wait on its header
// rather than on auth-dependent text that gets collapsed once complete.
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
  if (process.env.E2E_BILLING_ENABLED === 'true') {
    params.set('__e2e_billing_enabled', Buffer.from('true').toString('base64'));
  }

  for (const [key, val] of Object.entries(restParams)) {
    if (val) params.set(key, val);
  }

  const qs = params.toString();
  await page.goto(`${TEST_URL}/infra-setup${qs ? '?' + qs : ''}`);
  await page.waitForLoadState('domcontentloaded');
  // No redirect to /login anymore — step 0 sign-in is optional.
  await expect(page.getByText('Step 1: Discord Bot')).toBeVisible({ timeout: 15000 });
};

test.describe('Wizard E2E Regression', () => {

  // ---------- Signed-out access tests (app mode only) ----------
  test.describe('Signed-out Access', () => {
    test('loads wizard signed-out without redirect (optional sign-in)', async ({ page }) => {
      test.skip(process.env.E2E_APP_MODE !== 'true', 'Wizard route only available in app mode');
      await page.goto(`${TEST_URL}/infra-setup`);
      await page.waitForLoadState('domcontentloaded');
      // Must NOT bounce to /login — sign-in is optional persistence only.
      await expect(page).toHaveURL(new RegExp(`/infra-setup`), { timeout: 10000 });
      await expect(page.getByText('Step 0: Sign In (Optional)')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
      // Discord step (1) auto-expands for signed-out users too — never locked.
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

    test('shows all 4 step headers', async ({ page }) => {
      await goToWizard(page);
      const steps = [
        'Step 0: Sign In (Optional)',
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

      // E2E injection completes Discord (step 1) + GitHub (step 2) — their
      // bodies collapse, so the Discord token input should NOT be visible.
      await expect(page.getByText('Discord Bot Token:')).not.toBeVisible({ timeout: 15000 });

      // All 4 headers always render (even when locked/complete)
      await expect(page.getByText('Step 0: Sign In (Optional)')).toBeVisible();
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

      // E2E injection auto-completes Discord + GitHub — Discord body collapses
      await expect(page.getByText('Discord Bot Token:')).not.toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      // Step 3 (Google Cloud) holds the Create VM section. The e2e auto-OIDC
      // setup dispatches EXPAND_STEP 3 once all creds are injected, so the
      // section usually appears on its own. If not, toggle the header (with
      // a re-click guard in case the toggle collapsed it).
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
        throw new Error('VM creation timed out after 4 minutes');
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
              serialOutput = data.contents || '';
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
                  `https://compute.googleapis.com/compute/v1/projects/${stagingProjectId}/zones/${serialZone || 'us-east1-b'}/instances/${instanceName}/serialPort?port=1`,
                  { headers: { Authorization: `Bearer ${E2E_GCP_TOKEN}` } }
                );
                if (serialResp.ok) {
                  const sd = await serialResp.json();
                  const tail = (sd.contents || '').slice(-3000);
                  console.log(`[diag ${elapsed}s] Serial port (last 3000 chars):\n${tail}`);
                  // Fail fast: if the startup script already completed but the
                  // secrets were missing (or the push failed), no deployment
                  // will ever land — don't burn the full 10-minute poll.
                  const patMissing = /GITHUB_PAT=missing/i.test(tail);
                  const scriptDone = /SCRIPT_COMPLETE/i.test(tail);
                  const pushFailed = /PUSH_RESULT=(PUSH_FAILED|ALL_PUSH_FAILED)/i.test(tail);
                  if (pushFailed) {
                    throw new Error(`Staging deploy test: VM startup script finished with ${tail.match(/PUSH_RESULT=\w+/i)[0]} — GitHub push failed, deploy will not trigger.`);
                  }
                  if (patMissing && scriptDone) {
                    throw new Error('Staging deploy test: VM startup script completed but GITHUB_PAT is missing — Secret Manager fetch failed on the VM, deploy will not trigger.');
                  }
                } else {
                  console.log(`[diag ${elapsed}s] Serial port fetch failed: HTTP ${serialResp.status} (zone ${serialZone || 'us-east1-b'})`);
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

      // Discord (step 1) is completed via injection → GitHub (step 2) unlocks.
      // Its body collapses, so expand the header to reach the PAT input.
      await page.getByText('Step 2: GitHub').click();
      await page.waitForTimeout(300);

      const patInput = page.getByPlaceholder(/ghp_/);
      await expect(patInput).toBeVisible({ timeout: 10000 });

      await patInput.fill(process.env.E2E_GITHUB_PAT);
      await page.getByRole('button', { name: 'Save GitHub Configuration' }).click();

      // Save hits the GitHub API, derives owner/repo, and expands step 3
      await expect(page.getByText('Step 3: Google Cloud')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('1. Connect Google Cloud & Service Account')).toBeVisible({ timeout: 15000 });
    });
  });

  // ---------- Token persistence across reload (Secret Manager round-trip) ----------
  // Regression for "tokens are still not saving": enter real tokens, verify the
  // app writes them to Secret Manager, then reload in a FRESH tab (empty
  // sessionStorage — the same-tab sessionStorage restore can't mask the path)
  // and verify the wizard repopulates steps 1-2 from Secret Manager on its own.
  //
  // Injection is TOKEN-ONLY (__e2e_token + __e2e_project_id). That stands in
  // for a connected Google account without flipping e2eInjectedRef, so the
  // app's REAL sync + restore + config-restore paths run against live GCP.
  test.describe('Token Persistence (Secret Manager)', () => {
    test.beforeEach(async () => {
      test.skip(process.env.E2E_APP_MODE !== 'true', 'Wizard route only available in app mode');
      test.skip(!E2E_GCP_TOKEN || !E2E_GCP_PROJECT_ID,
        'E2E_GCP_TOKEN and E2E_GCP_PROJECT_ID required');
      test.skip(!process.env.E2E_GITHUB_PAT || !process.env.E2E_DISCORD_TOKEN,
        'E2E_GITHUB_PAT and E2E_DISCORD_TOKEN required');
    });

    test('tokens persist to Secret Manager and restore after reload', async ({ page, context }) => {
      test.setTimeout(180000);

      // Clean slate: delete any secrets written by previous runs so this test
      // proves a FRESH write + restore rather than a hit on last run's values.
      const smDelete = async (secretId) => {
        const resp = await fetch(
          `https://secretmanager.googleapis.com/v1/projects/${E2E_GCP_PROJECT_ID}/secrets/${secretId}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${E2E_GCP_TOKEN}` } }
        );
        console.log(`SM cleanup ${secretId}: HTTP ${resp.status} (404 = nothing to clean)`);
      };
      await smDelete('github-pat');
      await smDelete('discord-bot-token');

      // Read the LATEST version payload of a secret (null if missing/404).
      const smRead = async (secretId) => {
        const resp = await fetch(
          `https://secretmanager.googleapis.com/v1/projects/${E2E_GCP_PROJECT_ID}/secrets/${secretId}/versions/latest:access`,
          { headers: { Authorization: `Bearer ${E2E_GCP_TOKEN}` } }
        );
        if (!resp.ok) return null;
        const data = await resp.json();
        return Buffer.from(data.payload.data, 'base64').toString('utf8');
      };

      const injectTokenOnly = async (targetPage) => {
        await targetPage.addInitScript((token, projectId) => {
          sessionStorage.setItem('__e2e_token', token);
          sessionStorage.setItem('__e2e_project_id', projectId);
        }, Buffer.from(E2E_GCP_TOKEN).toString('base64'), E2E_GCP_PROJECT_ID);
      };

      // The shared e2e user's Firestore doc carries completion flags (e.g.
      // discord_bot_added) from previous runs — a step can therefore load
      // already-complete and collapsed. It can also flip mid-interaction: the
      // async config restore sets those flags AFTER first paint, and the
      // collapse effect then lands a moment after our first click. Retry
      // clicking until the input stays visible.
      const openStepIfNeeded = async (targetPage, stepTitle, inputLocator, timeoutMs = 20000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (await inputLocator.isVisible().catch(() => false)) return;
          await targetPage.getByText(stepTitle).first().click().catch(() => {});
          await targetPage.waitForTimeout(400);
        }
      };

      // ============ Tab 1: enter tokens, app must sync them to Secret Manager ============
      // Capture the app's console so a deferred sync (e.g. a GCP 403 on
      // secretmanager) surfaces its real error message in the CI log.
      const browserLogs = [];
      page.on('console', (msg) => browserLogs.push(`[${msg.type()}] ${msg.text()}`));
      page.on('pageerror', (err) => browserLogs.push(`[pageerror] ${err.message}`));
      await signIn(page);
      await injectTokenOnly(page);
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

      // Step 2: GitHub PAT (validated against the real GitHub API)
      const patInput = page.getByPlaceholder(/ghp_/);
      await openStepIfNeeded(page, 'Step 2: GitHub', patInput);
      await expect(patInput).toBeVisible({ timeout: 10000 });
      await patInput.fill(process.env.E2E_GITHUB_PAT);
      await page.getByRole('button', { name: 'Save GitHub Configuration' }).click();

      // The sync effect fires as soon as both tokens + GCP token + project are
      // present: poll Secret Manager until the payloads match the real values.
      try {
        await expect.poll(
          () => smRead('github-pat'),
          { timeout: 60000, message: 'github-pat should be written to Secret Manager' }
        ).toBe(process.env.E2E_GITHUB_PAT);
        await expect.poll(
          () => smRead('discord-bot-token'),
          { timeout: 60000, message: 'discord-bot-token should be written to Secret Manager' }
        ).toBe(process.env.E2E_DISCORD_TOKEN);
      } catch (err) {
        const syncRelevant = browserLogs.filter((l) =>
          /Secret Manager|secretmanager|deferred|GCP API error|sync|github|pat|discord|error|warn/i.test(l)
        ).slice(-30);
        console.log('--- Browser console (sync-relevant) ---');
        console.log(syncRelevant.join('\n') || '(no matching browser console logs)');
        console.log('--- End browser console ---');
        throw err;
      }

      // ============ Tab 2: fresh tab (empty sessionStorage) must self-restore ============
      const page2 = await context.newPage();
      await injectTokenOnly(page2);
      await signIn(page2);
      await page2.goto(`${TEST_URL}/infra-setup`);
      await page2.waitForLoadState('domcontentloaded');
      await expect(page2.getByText('Step 1: Discord Bot')).toBeVisible({ timeout: 15000 });

      // Discord token restored: open the step if needed and verify the input
      // holds the restored value (proves the token is back in state).
      const discord2 = page2.getByPlaceholder(/MTE4/);
      await openStepIfNeeded(page2, 'Step 1: Discord Bot', discord2);
      await expect(discord2).toBeVisible({ timeout: 10000 });
      await expect(discord2).toHaveValue(process.env.E2E_DISCORD_TOKEN, { timeout: 20000 });

      // GitHub PAT restored: step 2 is complete; open it and verify the value.
      const pat2 = page2.getByPlaceholder(/ghp_/);
      await openStepIfNeeded(page2, 'Step 2: GitHub', pat2);
      await expect(pat2).toBeVisible({ timeout: 10000 });
      await expect(pat2).toHaveValue(process.env.E2E_GITHUB_PAT, { timeout: 20000 });

      console.log('Token persistence e2e test passed: tokens written to Secret Manager and restored in a fresh tab');
    });
  });
});
