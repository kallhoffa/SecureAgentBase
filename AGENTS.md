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

**Firestore rules tests** (require Firebase emulator):
```bash
npm install @firebase/rules-unit-testing@5.0.1 --legacy-peer-deps
npm run test:rules       # firebase emulators:exec vitest
```
These are excluded from `npm run test:ci` — run separately.

### Linting & Type Checking
```bash
npm run lint         # Run ESLint on src/
npm run lint:fix     # Fix ESLint issues automatically
npm run check        # Run test:ci, lint, and build (full check) — optional local fast feedback
```

**CI is the source of truth.** `ci.yml` runs `npm run check` + CLI build on every PR and push to main. Local runs are optional fast feedback only — if your local env has quirks (npm 10.8 hang, missing toolchain, etc.), push your branch and let CI verify rather than fixing your box. Don't block a release on a local pass or fixate on a local timeout.

### Security Scanning (CI — free tools)
```bash
# These run in CI on every PR, but also available locally:
npx semgrep --config=.semgrep/ .           # Custom SAST rules
npx trivy fs . --scanners config,secret    # Config + secret scanner
```

All security scans are defined in `.github/workflows/security-scan.yml` and run automatically on every PR.

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

**safeCreate / safeUpdate / safeDelete / safeSet / safeQuery** — Wraps Firestore with audit stamps (createdBy, updatedBy, createdAt, updatedAt) and optional ownership enforcement. Use `safeSet` when you need a custom document ID instead of auto-generated.
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

## Rules for AI Agents

### Test Failures: No "Preexisting" Exemptions

**All test failures must be treated at the same priority as failures you introduced.** When an AI agent causes a test failure, it must NOT classify it as "preexisting" to avoid fixing it. LLMs have a known tendency to break one test, then label it preexisting in the next turn to avoid accountability.

Rules:
1. **If you break a test, you fix it.** Period. Even if it was "already broken before."
2. **Before making changes, record the current test state.** Check the most recent CI run on `main` (or push a baseline branch and let CI run `npm run check`), and note which tests pass/fail. Any new failures after your changes are YOUR responsibility.
3. **Never say "this test was already failing" without evidence.** You must provide the CI run number showing the failure existed before your changes.
4. **If a test is genuinely preexisting, fix it anyway.** A broken test is a broken test. Classifying it as preexisting does not fix it and erodes code quality.
5. **When in doubt, push a PR and let CI run.** Don't skip tests to save time — skipping hides regressions. Local `npm run test:ci` works when your box supports it, but CI is the source of truth.

**Rules for AI agents adding features:**
1. Wrap all Firestore writes through safeCreate/safeUpdate/safeDelete/safeSet
2. Always define ALLOW_FIELDS constant for each collection
3. Always call validate() before any write with user input
4. Always add useRateLimit for user-triggered actions (form submits, button clicks)
5. Use useFeatureFlag for gating new features behind Firestore toggles
6. Never read/write Firestore fields outside allowlists
7. Never skip error/success/loading states in components

### Security Rules (must-follow, enforced by CI)

**Firestore writes:** Always use guardrail functions (`safeCreate`/`safeUpdate`/`safeDelete`/`safeSet`). Never use raw `setDoc`/`updateDoc`/`addDoc`/`deleteDoc`. CI will fail on any raw Firestore write method found outside `src/guardrails/`.

**Startup scripts (VM):**
- Secrets (PAT, tokens, Firebase IDs) must use `EnvironmentFile=` with `chmod 600`, never inline `Environment=` in systemd unit files
- Serial console (`/dev/ttyS0`) writes must never include secrets, project identifiers, or metadata values
- CI runs Trivy to detect hardcoded secrets in startup scripts

**Validation:** Every user-input write must be prefixed with `validate(data, SCHEMA)`. The schema must define `type`, `required`, and length constraints.

**Rate limiting:** Every user-triggered action (form submit, button click) must use `useRateLimit`. Minimum 5 requests/minute.

**Feature flags:** New features must be gated with `useFeatureFlag(db, 'feature-name', defaultValue)`. Feature flag names must be documented in Firestore.

**Staging deployment:** Only the wizard user (`WIZARD_GITHUB_USERNAME` repo variable) can deploy to staging. The deploy workflow checks `github.actor == vars.WIZARD_GITHUB_USERNAME`.

### CI/CD Pipeline

The following workflows run automatically:
- **security-scan.yml** — On every PR: CodeQL (JS/TS analysis) + Semgrep (custom rules) + Trivy (secrets/config) + grep guard (raw Firestore check)
- **firebase-deploy-staging.yml** — On push to `main` + `workflow_dispatch` (restricted to wizard user). Deploys hosting + Firestore rules.
- **firebase-deploy.yml** — On version tags. Deploys to production.
- **generate-e2e-key.yml** — On workflow_dispatch. Generates e2e test SA keys.
- **ci.yml** — On every PR + push to main: `npm run check` (test:ci + lint + typecheck + build) + CLI build. **This is the source of truth for merge/deploy gating.** Local `npm run check` runs are optional fast feedback only — don't block a release on a local pass or fixate on a local timeout. Push a PR branch and let CI verify.

For forks: ci.yml ships in `.github/workflows/`, so copies of this repo inherit the gate automatically. No per-fork setup.

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

## Documentation

Durable rules live here. Other kinds of knowledge live elsewhere:

- `docs/README.md` — **index for every doc**; start here when unsure where to look
- `docs/cli.md` — the `secureagentbase` CLI: install, auth, commands, troubleshooting
- `docs/adr/` — why decisions were made (do not expire)
- `docs/CHANGELOG.md` — what changed recently
- `.opencode/skills/` — procedures, written against the current pipeline; the most
  frequently updated docs in the repo. **When a skill and this file disagree on a
  procedure, trust the skill.**
- `LIFECYCLE.md` — philosophy, CI/CD layout, rollback
- `CONTEXT.md` — domain glossary

Rules for keeping this file useful: do not add perishable status notes here.
Record outcomes in `docs/CHANGELOG.md` and decisions in `docs/adr/`.
