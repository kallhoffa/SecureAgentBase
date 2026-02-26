# SecureAgentBase Engineering Lifecycle Philosophy

## Guiding Principles

### 1. Autonomous but Guarded
The agent can deploy to **staging** autonomously after passing all local tests. Production deployments require a human to create a git tag, but the agent prepares everything.

### 2. Reliability Over Speed
Individual deployments may take longer, but we reduce babysitting. Every failure should be detectable and actionable without human intervention.

### 3. Test Everything
- **Local tests must pass** before any code leaves the machine
- **Smoke tests must pass** before full E2E suite runs
- **Full E2E suite must pass** before deployment is considered successful

---

## Implementation Details

### Local Development Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        DEVELOPER/AGENT                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Write Code + Tests (TDD)                                 │
│    - Unit tests in src/_tests_/                            │
│    - E2E tests in tests/e2e/                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Pre-Push Hook (Husky)                                   │
│    └─> npm run check                                       │
│        ├─> vitest run --pool=threads  (unit tests)        │
│        ├─> eslint src/              (linting)              │
│        └─> vite build               (build check)         │
│                                                             │
│    BLOCKS PUSH if any check fails                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Push to main                                             │
│    └─> Triggers CI/CD                                       │
└─────────────────────────────────────────────────────────────┘
```

### CI/CD Pipeline (Staging)

```
┌─────────────────────────────────────────────────────────────┐
│ Git Push to main                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CI Stage 1: Build                                          │
│    ├─> npm ci                                               │
│    ├─> npm run build                                        │
│    └─> Sentry sourcemaps upload (if token available)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CI Stage 2: Deploy to Staging                              │
│    └─> Firebase Hosting + Firestore Rules                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CI Stage 3: Smoke Tests (5 tests, ~30s)                   │
│    └─> npm run e2e:smoke:ci                               │
│        ├─> Home page loads                                  │
│        ├─> Navigation bar visible                           │
│        ├─> Search bar visible                               │
│        ├─> Login page accessible                            │
│        └─> Signup page accessible                           │
│                                                             │
│    RETRY 2x on failure → Fast feedback                     │
│    FAILS → No full E2E run                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CI Stage 4: Full E2E Suite (~2min)                        │
│    └─> npm run e2e:ci                                     │
│        ├─> Auth tests                                       │
│        ├─> Home tests                                       │
│        └─> Question tests                                   │
│                                                             │
│    RETRY 2x on failure                                     │
│    FAILS → Upload failure logs                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Staging Deployed Successfully                                │
│    URL: ${VITE_STAGING_URL}                               │
└─────────────────────────────────────────────────────────────┘
```

### CI/CD Pipeline (Production)

```
┌─────────────────────────────────────────────────────────────┐
│ Human creates git tag: v0.x.x                               │
│    └─> git tag v0.2.0 && git push origin v0.2.0           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CI Stage 1: Build                                          │
│    (same as staging)                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CI Stage 2: Deploy to Production                           │
│    └─> Firebase Hosting + Firestore Rules                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CI Stage 3: Smoke Tests                                    │
│    (same as staging, against production URL)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CI Stage 4: Full E2E Suite                                 │
│    (same as staging, against production URL)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Production Deployed Successfully                             │
│    URL: ${VITE_PRODUCTION_URL}                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Test Categories

### Unit Tests (`npm run test:ci`)
- **Location**: `src/_tests_/*.test.jsx`
- **Framework**: Vitest with React Testing Library
- **Coverage**: Components, hooks, utilities
- **Speed**: ~5 seconds
- **Parallel**: Yes (`--pool=threads`)

### Smoke Tests (`npm run e2e:smoke:ci`)
- **Location**: `tests/e2e/smoke.spec.js`
- **Framework**: Playwright
- **Purpose**: Critical path validation (< 30 seconds)
- **Retries**: 2x automatically

### Full E2E Tests (`npm run e2e:ci`)
- **Location**: `tests/e2e/*.spec.js`
- **Framework**: Playwright
- **Coverage**: Auth, Home, Questions
- **Speed**: ~2 minutes
- **Retries**: 2x automatically

---

## Guardrails Summary

| Guardrail | Location | What It Does |
|-----------|----------|--------------|
| **Pre-push hook** | `.husky/pre-push` | Blocks push if `npm run check` fails |
| **Pre-commit hook** | `.husky/pre-commit` | Lints and runs unit tests before commit |
| **Smoke tests** | `tests/e2e/smoke.spec.js` | Fast validation of critical paths |
| **E2E retries** | CI workflows | Auto-retry flaky tests |
| **Sentry integration** | `src/index.jsx` | Captures production errors automatically |

---

## Feature Flag System

### Rollout Strategy
| Segment | Treatment |
|---------|-----------|
| Staging | Always gets `beta` |
| Beta opt-in users | Gets `beta` (via Firestore preference) |
| 10% random bucket | Gets `next` (via Remote Config) |
| Stable (85%) | Gets `control` |

### Kill Switch
- Remote Config defaults to `control`
- Can be manually changed in Firebase Console
- LocalStorage caches preference for instant UI

### Testing Features
```javascript
// In browser console
window.__FLAG_TEST_MODE__ = { navigation_banner: 'beta' };
window.location.reload();
```

---

## Error Tracking (Sentry)

### What's Captured
- Uncaught exceptions
- Unhandled promise rejections
- React component errors (ErrorBoundary)
- Performance traces (10% sample)
- Session replays on errors

### Setup Required
1. Create Sentry project: `argbase-react`
2. Add to GitHub secrets: `SENTRY_AUTH_TOKEN`
3. Add to GitHub vars: `VITE_SENTRY_DSN`
4. Update CI to pass `SENTRY_AUTH_TOKEN` during build

---

## Rollback Procedure

### Staging Rollback
```bash
# Force push main to previous commit
git push --force origin main~1:main
```

### Production Rollback
```bash
# Re-tag with previous version
git tag -d v0.x.x
git push origin :refs/tags/v0.x.x
git tag v0.x.y  # previous version
git push origin v0.x.y
```

---

## Future Enhancements

### Phase 2 (Next)
- [ ] Health check endpoint for uptime monitoring
- [ ] Automatic rollback on 3+ consecutive failures
- [ ] Lighthouse CI for performance budgets
- [ ] Code coverage enforcement (80% threshold)

### Phase 3 (Later)
- [ ] Canary deploys (10% → 100%)
- [ ] GitHub issue creation on repeated failures
- [ ] Metrics dashboard (deploy frequency, MTTR)
- [ ] Slack notifications for deploy status

---

## Commands Reference

```bash
# Local development
npm run dev              # Start dev server
npm test                 # Watch mode for unit tests

# Pre-deploy validation
npm run check            # Full check (test + lint + build)
npm run e2e:smoke        # Run smoke tests locally

# Deployment
git push origin main     # Auto-deploys to staging
git tag v0.2.0 && git push origin v0.2.0  # Production

# Debugging
npm run e2e              # Run all E2E tests
npm run integration-test # Run tests against staging
```
