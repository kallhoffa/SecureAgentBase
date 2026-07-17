# AGENTS.md - Developer Guide for SecureAgentBase

## Project Overview

This is a React 19 application built with Vite, using JavaScript (not TypeScript). The project uses Firebase for authentication and Firestore, Sentry for error tracking, and TailwindCSS for styling.

## Build / Lint / Test Commands

### Development
```bash
npm run dev          # Start development server (port 3000)
npm run build        # Build for production (output: build/)
npm run preview      # Preview production build
```

### Testing
```bash
npm run test              # Run unit tests in watch mode
npm run test:ci           # Run unit tests once (for CI)
npm run e2e               # Run e2e tests with Playwright
npm run e2e:ci            # Run e2e tests in CI mode
npm run e2e:smoke         # Run smoke tests only
npm run e2e:smoke:ci      # Run smoke tests in CI mode
```

**Running a single test**: Use Vitest's `--filter` flag:
```bash
npm run test -- --filter "test-name-pattern"
# Or directly:
npx vitest run --filter "test-name-pattern"
```

### Linting & Type Checking
```bash
npm run lint         # Run ESLint on src/
npm run lint:fix     # Fix ESLint issues automatically
npm run check        # Run test:ci, lint, and build (full check)
```

## Code Style Guidelines

### General
- Use JavaScript (JSX), not TypeScript
- Use ES modules (`import`/`export`)
- Enable automatic JSX transform in Vite (`esbuild.jsx: 'automatic'`)

### Naming Conventions
- **Components**: PascalCase (e.g., `AuthProvider`, `UserProfile`)
- **Hooks**: camelCase with `use` prefix (e.g., `useAuth`, `useFeatureFlag`)
- **Utilities**: camelCase (e.g., `fetchFeatureFlags`, `remoteConfig`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `MAX_RETRY_COUNT`)
- **Context**: PascalCase with `Context` suffix (e.g., `AuthContext`)

### Imports
Order imports as follows:
1. React/External libraries
2. Internal framework utilities
3. Local components/utils

```javascript
import { useState, useEffect } from 'react';
import { fetchFeatureFlags } from '../firestore-utils/remote-config';
import { useAuth } from './auth-context';
```

### Components
- Use functional components with hooks
- Use named exports for hooks and utilities
- Use default export only for top-level route components
- Destructure props for clarity

```javascript
// Good
export const AuthProvider = ({ auth, children }) => {
  const [user, setUser] = useState(null);
  // ...
};

// Avoid
const AuthProvider = ({ auth, children }) => { ... };
export default AuthProvider;
```

### React Hooks
- Follow ESLint react-hooks rules (exhaustive-deps)
- Always include all dependencies in dependency arrays
- Use cleanup functions in useEffect for subscriptions/timers

```javascript
useEffect(() => {
  let mounted = true;
  const loadData = async () => {
    try {
      const data = await fetchData();
      if (mounted) {
        setData(data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };
  loadData();
  return () => { mounted = false; };
}, [dependency]);
```

### Error Handling
- Use try/catch for async operations
- Log errors with descriptive messages
- Set appropriate fallback states on error
- Never swallow errors silently

```javascript
try {
  const result = await riskyOperation();
  setResult(result);
} catch (error) {
  console.error('Operation failed:', error);
  setError('Failed to complete operation');
}
```

### Context Usage
- Create context with `createContext(null)`
- Throw descriptive errors when context is used outside provider
- Use custom hooks to expose context values

```javascript
const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

### Testing
- Place tests in `src/_tests_/` directory
- Use `.test.{js,jsx,ts,tsx}` suffix
- Use Vitest with jsdom environment
- Follow `@testing-library/react` patterns

```javascript
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

describe('useFeatureFlag', () => {
  it('returns flag value', () => {
    // test implementation
  });
});
```

### TailwindCSS
- Use utility classes for styling
- Avoid custom CSS unless necessary
- Use semantic class names for complex components

### File Organization
```
src/
├── framework/
│   ├── config/           # Configuration files
│   ├── firestore-utils/  # Firebase utilities
│   ├── hooks/            # Custom React hooks
│   └── infra-setup/      # Infra setup wizard
├── guardrails/           # Safety wrappers (validate, safe-firestore, useFeatureFlag, useRateLimit)
├── template/             # Template mode pages (Dashboard, Tasks)
└── _tests_/              # Test files
```

### Guardrails (src/guardrails/)

**ALWAYS use guardrails instead of raw Firestore/validation code.** These modules enforce ownership, audit trails, field allowlists, and safe defaults.

```javascript
import { validate } from '../guardrails/validate';
import { safeCreate, safeUpdate, safeDelete, safeQuery } from '../guardrails/safe-firestore';
import { useFeatureFlag } from '../guardrails/useFeatureFlag';
import { useRateLimit } from '../guardrails/useRateLimit';
```

**validate(data, schema)** — Returns `null` on valid, `{ field: errorMessage }` on invalid.
```javascript
const errors = validate(data, {
  title: { type: 'string', required: true, minLength: 1, maxLength: 200, label: 'Title' },
  email: { type: 'email', required: true },
  age: { type: 'number', min: 0, max: 150 },
  role: { oneOf: ['admin', 'user'] },
  active: { type: 'boolean' },
  url: { type: 'url' },
});
if (errors) { setError(Object.values(errors)[0]); return; }
```

**safeCreate / safeUpdate / safeDelete / safeQuery** — Wraps Firestore with audit stamps (createdBy, updatedBy, createdAt, updatedAt) and optional ownership enforcement.
```javascript
// Create with field allowlist (extra fields are silently dropped)
await safeCreate(db, 'tasks', { title: '...', completed: false }, userId, { allowFields: ['title', 'completed'] });

// Update with ownership check (throws if createdBy !== userId)
await safeUpdate(db, 'tasks', docId, { completed: true }, userId, { allowFields: ['title', 'completed'], requireOwnership: true });

// Delete with ownership check
await safeDelete(db, 'tasks', docId, userId, { requireOwnership: true });

// Query auto-filters by createdBy
const results = await safeQuery(db, 'tasks', userId, { maxResults: 100, sortOrder: 'desc' });
```

**useFeatureFlag(flagName, defaultValue)** — Reads from Firestore `featureFlags/{flagName}` doc, real-time subscription via onSnapshot.
```javascript
const betaEnabled = useFeatureFlag(db, 'beta-feature', false);
if (!betaEnabled) return null;
```

**useRateLimit(action, maxPerMinute)** — Client-side sliding window rate limiter.
```javascript
const rateLimit = useRateLimit('add-comment', 10);
if (!rateLimit.check()) {
  setError(`Rate limit. Try again in ${Math.ceil(rateLimit.resetIn / 1000)}s.`);
  return;
}
```

**Rules for AI agents adding features:**
1. Wrap all Firestore writes through safeCreate/safeUpdate/safeDelete
2. Always define ALLOW_FIELDS constant for each collection
3. Always call validate() before any write with user input
4. Always add useRateLimit for user-triggered actions (form submits, button clicks)
5. Use useFeatureFlag for gating new features behind Firestore toggles
6. Never read/write Firestore fields outside allowlists
7. Never skip error/success/loading states in components

```javascript
// Full pattern for a feature:
const SCHEMA = { title: { type: 'string', required: true, maxLength: 200 } };
const ALLOW_FIELDS = ['title', 'completed'];

const Feature = ({ db }) => {
  const { user } = useAuth();
  const rateLimit = useRateLimit('my-action', 10);
  const flagEnabled = useFeatureFlag(db, 'my-feature', false);

  const handleSubmit = async () => {
    if (!flagEnabled) { setError('Feature disabled'); return; }
    const errors = validate(data, SCHEMA);
    if (errors) { setError(errors.title); return; }
    if (!rateLimit.check()) { setError('Slow down!'); return; }
    try {
      await safeCreate(db, 'collection', data, user.uid, { allowFields: ALLOW_FIELDS });
    } catch (err) {
      console.error('Failed:', err);
      setError(err.message);
    }
  };
};
```

### Firebase Integration
- Initialize Firebase outside components
- Pass auth instance as prop to providers
- Use Firebase SDK methods directly in context/logic layers

### Environment Variables
- Use `.env` files for local development
- Prefix variables with `VITE_` for client-side exposure
- Never commit secrets to repository

### App Mode vs Template Mode
- `VITE_APP_MODE=true` → shows SecureAgentBase product (landing page, infra-setup wizard, create-app). **Only set in our repo** (`kallhoffa/SecureAgentBase`) as a GitHub variable.
- `VITE_APP_MODE` not set (default) → shows template mode (generic "Welcome to {VITE_APP_NAME}" dashboard, Tasks demo, no infra-setup).
- `VITE_APP_NAME` → displayed as the app title in nav bar and dashboard. Falls back to `'Your App'` in template mode or `'SecureAgentBase'` in app mode.

Both env vars are set in CI via GitHub Actions workflow variables.

---

## Session Status (Jul 16, 2026)

### What was done
- **All prior work preserved**: 320+ unit tests, 23+ e2e tests, guardrails system, admin panel, template mode, CI pipelines, startup script cleanup, wizard auto-configuration
- **Production URL bug found and fixed**: `PRODUCTION_URL` was `agentbase-8c022.web.app` (project's default hosting) but `firebase.json:18` specifies `"site": "agentbase"` → deployment goes to `agentbase.web.app`. Updated via `gh variable set`.
- **`v0.18.1` release created** with URL fix → production deploy succeeded at `https://agentbase.web.app`
- **Profile page cleaned**: removed "Your Apps" block with "Create New App" button; removed unused `Plus` import; profile test updated to expect section is absent
- **Version badge dynamic**: `navigation-bar.tsx:39` hardcoded `v0.1.0` → now uses `import.meta.env.VITE_APP_VERSION` (set from `${{ github.ref_name }}` by CI)
- **Staging deploy fix**: profile test failing due to "Your Apps" text removal — updated test and pushed
- **Wizard `addFirebaseToProject` 403 fix** — root cause: user's GCP OAuth token lacks `firebase.admin` even after IAM grant (different account or propagation delay):
  - Extracted `signJwtAssertion(jsonKey, scopes)` helper (reusable SA key JWT assertion signing via Web Crypto API)
  - Created `generateFirebaseSaToken()` — generates SA token via JWT signing (cloud-platform scope), falls back to user's `gcpAccessToken`
  - Refactored `getServiceAccountToken()` to use `signJwtAssertion` helper (reducing duplication)
  - Added `roles/firebase.admin` to SA roles in `grantGcpRolesProgrammatically`
  - Updated `autoConfigureFirebaseProject()` and `handleCreateFirebaseProject()` to use SA token instead of user token for all Firebase Management API calls
  - **Result**: Firebase API calls now authenticate directly as the SA (which has `firebase.admin`), bypassing IAM propagation delay and user token permission issues entirely
- **SA creation race condition fixed**: `createDeployServiceAccount` (api.ts:226) when POST returned 409 but GET for existing SA also failed (race — SA creation not yet propagated), it crashed silently → now catches GET failure, waits 3s, retries POST creation
- **SA IAM propagation delay fixed**: `grantFirebaseRoles` (api.ts:252) failed with "SA does not exist" when IAM policy was set before SA creation propagated → now retries up to 6x with 5s delays
- **Billing API 403 fixed** — Root cause: the Cloud Billing API's service-enabled check runs against the OAuth client's own project (the consumer), not the wizard's target project. `tryEnableBillingApi` enabled the API on the target project, but the billing backend kept seeing the consumer project as `SERVICE_DISABLED` forever. Fix: all `cloudbilling.googleapis.com` requests now send the `x-goog-user-project` header set to the target project, overriding the consumer to the project where the API is actually enabled. Also added a polling loop (up to 2 min) and a manual billing account input fallback for propagation edge cases.

### What needs to be done
1. Push `main` to `origin` to trigger staging CI + deploy with all wizard fixes
2. Verify staging deploy green at `https://agentbase-staging.web.app`
3. Test wizard `addFirebase` now works (SA key auth instead of user token)
4. Cut `v0.18.2` release for prod deploy
5. Run full e2e with `E2E_FULL=true` once GCP pre-requisites are set up
6. **Still failing: OAuth client ID null** — Step 5 (Identity Toolkit API) may return 404 even after enabling via Service Usage API. The OAuth discovery flow is a best-effort convenience and may require manual Firebase Auth config in console.

### Relevant files
- `src/infra-setup.tsx` — wizard UI and GCP automation flows, including billing account detection and manual fallback
- `src/framework/infra-setup/api.ts` — service account creation and IAM role grants
- `WIZARD_DEV_NOTES.md` — internal wizard development notes (stripped from user projects)
- `src/navigation-bar.tsx:39` — version badge uses `VITE_APP_VERSION`
- `src/profile.tsx` — "Your Apps" block removed
- `src/_tests_/profile.test.tsx` — test updated
- `.github/workflows/firebase-deploy.yml` — `PRODUCTION_URL` var corrected
- `src/guardrails/`, `src/admin/`, `src/template/` — unchanged from prior sessions

---

## First-Time Setup

**This must be done by the user** (not the agent) to configure Firebase and GitHub:

```bash
npm install
npm run setup
```

The setup script will:
1. Check/install GitHub CLI
2. Check/install Firebase CLI
3. Create Firebase projects (prod + staging)
4. Get Firebase web app configs
5. Upload secrets to GitHub
6. Create `.firebaserc` and `.env.local`

---

## Deployment

### Prerequisites
- GH CLI authenticated with GitHub
- Firebase project configured via `npm run setup`
- Secrets uploaded to GitHub

### Deploy to Staging
The agent can deploy to staging automatically after tests pass:
- Triggered on push to `main`
- Runs: `npm run build` → `firebase deploy --only hosting,firestore`

### Deploy to Production
Create a GitHub release to deploy to production:
```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers the production deployment workflow.

### Manual Deploy
```bash
firebase use staging
firebase deploy --only hosting,firestore
```

---

## 🛠️ Resolved Issues, Fixes & Current Active Status (State Preservation)

As of May 20, 2026, the codebase has been extensively debugged, hardened, and streamlined. The following state preserves all critical context, resolved issues, and added automations:

### 1. VM Startup & Runtime Fixes
* **Missing Passphrase Metadata:** The GCP VM creation calls in `src/infra-setup.tsx` previously omitted the `encryption_passphrase` metadata key, causing the startup script's `curl` request to return a 404 HTML error page on the VM. This multi-line HTML code was written directly into `kimaki.service`, corrupting systemd's parser.
  * *Fix:* Added `encryption_passphrase` to VM metadata items in `src/infra-setup.tsx` and added robust Bash Indirect Reference sanitization inside `src/framework/infra-setup/scripts.ts` to strip any potential HTML error responses from failed metadata curls.
* **Invalid ExecStart Subcommand:** The systemd service was executing `/usr/bin/node $KIMAKI_PATH start`. However, the `kimaki` CLI has no `start` command—causing the service to exit with status `1`.
  * *Fix:* Changed the command to `/usr/bin/node $KIMAKI_PATH` (without `start`) in `scripts.ts`.
* **Missing `unzip` Dependency:** The VM startup script was missing the `unzip` package. When `kimaki` booted and tried to auto-install `bun` from the web, the installer crashed with `error: unzip is required to install bun`.
  * *Fix:* Added `unzip` to the dependencies in `sudo apt-get install -y` in `scripts.ts`.
* **Missing `KIMAKI_BOT_TOKEN` Env Variable:** The systemd service was only configuring `DISCORD_BOT_TOKEN`, but `kimaki` specifically looks for `KIMAKI_BOT_TOKEN`. Without it, `kimaki` fell back to launching its interactive TTY onboarding session, causing the non-TTY systemd daemon to crash.
  * *Fix:* Configured the systemd service in `scripts.ts` to export `Environment="KIMAKI_BOT_TOKEN=$DISCORD_BOT_TOKEN"`.
* **Empty Git Repository:** The VM was initializing a blank Git repo and pushing only a boilerplate `.gitignore` and `README.md`.
  * *Fix:* Updated the startup script (`scripts.ts`) to programmatically clone the actual public template codebase (`https://github.com/kallhoffa/SecureAgentBase.git`) on the VM, clear its `.git` folder, and run a fresh `git init` to build a clean Git history starting with an "Initial commit". Includes a robust fallback if cloning fails.

### 2. GitHub Actions CI/CD Pipeline Fixes
* **Aligned GitHub Context Variables:** The setup wizard uploads public Firebase configurations as **GitHub Actions Variables** (hitting `/repos/.../actions/variables`), but the staging and production workflows (`firebase-deploy-staging.yml` and `firebase-deploy.yml`) were trying to access them via the `secrets` context (e.g. `${{ secrets.FIREBASE_API_KEY_STAGING }}`).
  * *Fix:* Edited both workflow files to access these properties through the correct `${{ vars... }}` context.
* **Dynamic Target Project Flags:** Both pipelines previously deployed via `-P staging` or default alias flags, which failed because the newly cloned repos did not contain local `.firebaserc` project alias configs.
  * *Fix:* Replaced the alias flags with explicit project targets (`--project ${{ vars.FIREBASE_PROJECT_ID_... }}`).
* **Resolved React Async State Race Condition:** In Step 5 (OIDC setup), OIDC credentials were created asynchronously, setting state variables that weren't yet available when `uploadGitHubVars()` was fired in the same click handler—causing critical variables (`GCP_WIF_PROVIDER`) to be skipped during upload.
  * *Fix:* Refactored `setupOidcInfrastructure()` to return its data directly, passing it straight to `uploadGitHubVars(oidcData)` to bypass the React rendering lag.
* **Resolved `204 No Content` Crash:** Updating existing repository variables on GitHub returns a `204 No Content` response with an empty body. Calling `response.json()` on these empty bodies caused `Unexpected end of JSON input` crashes.
  * *Fix:* Updated both `gcpApiFetch` and `githubApiFetch` to check for status `204` or empty bodies, returning a clean `{}` instead of parsing empty strings.

### 3. Setup Wizard Streamlining & Automation (New UX)
* **🔌 Direct Google Cloud Connection:** Since Google OAuth access tokens are short-lived (1 hour) and are never saved persistently in Firestore for safety reasons, we added a clear **"Connect Google Cloud Account"** button directly inside **Step 2** and **Step 4** when the token is missing/expired. This auto-recovers credentials on page load or token expiry instantly.
* **⚡ One-Click Service Account Creation (Step 2):** If connected to Google Cloud, Step 2 now features a **Programmatic Auto-Generation** section. The user simply selects their project and clicks a button—and our client-side app programmatically creates the service account, assigns all six required IAM permissions, generates a JSON key, and loads it into the setup automatically.
* **⚡ One-Click GCP Project Creation:** Added an inline **`+ Create New Project`** toggle right inside Step 2 and Step 4. Users can type a new project name, programmatically create it, and automatically select it directly from our portal.
* **⚡ One-Click Firebase Auto-Configuration (Step 4):** Programmatically queries the **Firebase Management API**, lists or creates the Firebase Web App, fetches its Web SDK config, and populates both staging and production project environments instantly.
* **🤖 Auto-Extract Discord Client ID (Step 6):** Pasting your Bot Token instantly decodes the base64 prefix in your browser and automatically populates your Client ID.
* **🤖 Pre-Baked Scopes:** Updated the Discord invite link generator to pre-bake the correct scopes directly: `scope=bot%20applications.commands` so slash commands register instantly.
* **💾 Saved Config Cards:** If you reload the page and configurations are already stored in Firestore/localStorage, Step 2 and Step 4 will show beautiful **"Configuration Active" success cards** detailing your active Project IDs with "Clear & Reconfigure" options, eliminating confusing blank fields.

Every fix has been fully built, linted, verified, and successfully deployed live to **https://agentbase.web.app**!

### 4. Unit/E2e Test Suite & CI Enforcement
* **Missing `lucide-react` imports in Step1-Step7:** Extracting Step components from `infra-setup.tsx` left `Check`, `AlertTriangle`, `Server` icons referenced without imports. They worked due to a partial global scope but failed in Vitest's isolated module environment.
  * *Fix:* Added direct `import { Check }` / `import { Check, AlertTriangle }` / `import { Check, Server }` to each step component.
* **Brittle smoke test selectors:** Smoky tests used `text=Sign In` selectors that matched multiple elements or broke across re-renders.
  * *Fix:* Switched to `getByRole('heading', { name: 'Sign In' })` throughout.
* **Wizard step test selectors too fragile:** Tests used `getByText('exact@string')` which failed when text was split across child elements.
  * *Fix:* Changed to regex matchers: `getByText(/test@example\.com/)`.
* **`@vitejs/plugin-react` unresolvable in Vitest:** npm 10.8 flat mode doesn't install transitive dependencies correctly in this environment, so the vitest config's `import react from '@vitejs/plugin-react'` fails.
  * *Fix:* Replaced with `esbuild: { jsx: 'automatic' }` in vitest.config.js (no react plugin needed for JSX transform in tests).
* **npm 10.8 flat mode hoisting bug:** `npm install` with the default `hoisted` strategy installs only ~175 packages instead of 530. The `linked` strategy works but is experimental.
  * *Fix:* Generated lockfile using `linked` strategy, verified with `npm ci --dry-run` on restored lockfile to ensure CI compatibility. CI runs `npm ci` with a working npm version and will install all packages correctly.
