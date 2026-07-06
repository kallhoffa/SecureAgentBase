# Proposed E2E Auth Architecture (Option C)

Replace the static `E2E_SA_KEY_B64` secret with **WIF + impersonation**: the CI runner authenticates via OIDC as the deploy SA, then generates a short-lived token for the e2e-test-runner SA. No JSON key stored anywhere.

## Scope: Two CI Pipelines

This proposal affects **two distinct CI pipelines** — one for our repo, one for user projects the wizard creates:

| Dimension | Our CI (`kallhoffa/SecureAgentBase`) | User's CI (created by wizard) |
|-----------|----------------------------------------|-------------------------------|
| WIF provider condition | Set manually in GCP console — **needs verification** | Set programmatically by `createWorkloadIdentityProvider` at `api.ts:176` — `assertion.repository == '{userRepo}'` |
| e2e SA key in CI | Yes — `E2E_SA_KEY_B64` secret (what we're replacing) | **Never pushed** — wizard doesn't set `E2E_SA_KEY_B64`, `E2E_GCP_PROJECT_ID`, or `E2E_TEST_PASSWORD` |
| e2e tests run? | Yes — full wizard regression in CI | **No** — step gated by `${{ vars.E2E_GCP_PROJECT_ID != '' }}`, which is never set for users |
| Critique concerns apply? | Yes — OIDC condition, token leakage, token lifetime | **No** — user CI only builds + deploys Firebase via WIF |

The critique's concerns are **our CI only**. The wizard already handles user projects correctly.

## Auth Chain

```
GitHub Actions
    │  OIDC token (signed by GitHub, includes repository claim)
    ▼
WIF Provider (workloadIdentityPools/firebase-deploy-pool)
    ┌── attribute.repository == "kallhoffa/SecureAgentBase"   ◄── critical gate
    │   attribute.ref == "refs/heads/main"
    └── exchanges for GCP access token (deploy SA)
    ▼
deploy SA (firebase-deploy-staging@agentbase-staging.iam.gserviceaccount.com)
    │  iamcredentials.generateAccessToken (impersonate)
    ▼
e2e-test-runner SA (e2e-test-runner@{E2E_GCP_PROJECT_ID}.iam.gserviceaccount.com)
    │  1-hour access token
    ▼
Playwright injects into sessionStorage   │  gcloud --impersonate-service-account
    ▼                                     ▼
Wizard GCP API calls                     e2e-gcp-loop.sh
```

## One-time Setup (user in GCP console)

### 1. Verify WIF provider has repository condition

The existing WIF pool provider (`firebase-deploy-pool` / `github-provider`) must have attribute conditions that restrict which repos and branches can authenticate. Without these, any GitHub repo that discovers the pool ID could mint tokens.

```
attribute.repository == "kallhoffa/SecureAgentBase"
attribute.ref.matches("refs/heads/main")
```

If missing, update the provider in GCP console (IAM → Workload Identity Federation → `firebase-deploy-pool` → `github-provider` → edit attribute mapping/condition).

### 2. Ensure e2e-test-runner SA exists

Service account `e2e-test-runner@{E2E_GCP_PROJECT_ID}.iam.gserviceaccount.com` in the e2e GCP project with these roles:

| Role | Why |
|------|-----|
| `roles/iam.securityAdmin` | Grant IAM roles during wizard |
| `roles/iam.serviceAccountAdmin` | Create/manage agent SAs |
| `roles/serviceusage.serviceUsageAdmin` | Enable APIs |
| `roles/compute.admin` | Create/manage VMs |

### 3. Grant deploy SA `iam.serviceAccountTokenCreator` on e2e-test-runner

This is a **SA-level IAM binding**, not a project-level role. Must be on the target SA resource specifically:

```
gcloud iam service-accounts add-iam-policy-binding \
  e2e-test-runner@{E2E_GCP_PROJECT_ID}.iam.gserviceaccount.com \
  --member='serviceAccount:firebase-deploy-staging@agentbase-staging.iam.gserviceaccount.com' \
  --role='roles/iam.serviceAccountTokenCreator'
```

When this binding is missing, `gcloud auth print-access-token --impersonate-service-account=...` will return a generic 403 with no clear indication the impersonation role is what's missing. Reference the SA resource path specifically when debugging.

### 4. Set/keep GitHub variables

| Variable | Value |
|----------|-------|
| `E2E_GCP_PROJECT_ID` | The e2e GCP project ID |
| `E2E_TEST_PASSWORD` | Random password for e2e Firebase test user |

### 5. Remove `E2E_SA_KEY_B64` secret (no longer needed)

## CI Changes

### Playwright e2e tests (deploy job)

```
Authenticate to GCP (OIDC)
  → authenticates as firebase-deploy-staging@agentbase-staging

Generate ephemeral e2e token
  → gcloud auth print-access-token \
       --impersonate-service-account=e2e-test-runner@{E2E_GCP_PROJECT_ID}
  → stores as step output E2E_GCP_TOKEN

Run Full E2E Tests
  → passes E2E_GCP_TOKEN to Playwright as env var
  → Playwright injects into sessionStorage (not URL param)
  → wizard reads from sessionStorage and uses for GCP API calls
```

### GCP loop job

```
Authenticate to GCP (OIDC)
  → same WIF auth as deploy job

Set gcloud impersonation
  → gcloud config set auth/impersonate_service_account \
       e2e-test-runner@{E2E_GCP_PROJECT_ID}

Run e2e-gcp-loop.sh
  → all gcloud commands run as e2e-test-runner via impersonation
  → no SA key export/cleanup step needed
  → token is short-lived but ample for ~5-15 min test run
```

## Playwright / Wizard Integration

### Current approach (URL param)

The wizard already supports `__e2e_token` via the `extractE2EParams` effect in `infra-setup.tsx`. On mount, it reads base64-encoded params from the URL and sets React state directly.

### Proposed approach (sessionStorage)

Instead of URL params, Playwright injects the token into `sessionStorage` before navigation:

```javascript
// In Playwright test, before page.goto():
await page.addInitScript((token) => {
  sessionStorage.setItem('__e2e_token', token);
}, base64Encode(E2E_GCP_TOKEN));
```

The wizard's `extractE2EParams` already checks `sessionStorage` as a fallback. URL params remain supported for manual debugging but CI uses sessionStorage exclusively — no token appears in the address bar, browser history, or referer headers.

## Token Lifetime

| Concern | Mitigation |
|---------|-----------|
| Tests exceed 1 hour | Current full suite runs ~5 min. If grows to >45 min, implement a token refresh step in CI |
| Token refresh mechanism | Future: run `gcloud auth print-access-token --impersonate-service-account` again and pass new token via Playwright's `page.evaluate()` mid-run |
| GCP org policy limits | Default max token lifetime is 1h. Extending requires an org policy exception — not recommended |

## Security Properties

| Property | Before (static key) | After (Option C) |
|----------|---------------------|------------------|
| Key storage | GitHub secret (long-lived) | None |
| Token lifetime | Until key rotated | 1 hour |
| Exposure in CI | Full SA private key on runner | Only at `gcloud` step |
| Exposure in browser | SA private key in URL param | Access token in sessionStorage (not address bar) |
| Exposure in logs/URLs | Yes — URL params logged by proxy, history, referer | No — sessionStorage not visible in address bar |
| GitHub auth gate | None (secret is just a stored value) | OIDC token with repository + branch condition |
| Compromise impact | Full SA access (create keys, VMs, roles) until key rotated | 1-hour window, same SA roles |
| Easily revokable | No (must delete key from GCP + GitHub) | Yes (revoke token or remove impersonation binding) |

## Risk

The e2e-test-runner SA is powerful (`compute.admin`, `iam.securityAdmin`, `iam.serviceAccountAdmin`). A compromised 1-hour token still enables creating/deleting VMs and SAs.

This is **acceptable** because:
- The e2e project is isolated (not staging or prod)
- The token is only present in ephemeral CI runners (auto-terminated)
- The impersonation binding is a single SA-level IAM policy (auditable in Cloud Audit Logs)
- GCP budget alerts + killswitch cap cost exposure
- WIF provider is gated by `attribute.repository == "kallhoffa/SecureAgentBase"` — no other repo can mint tokens against this pool
- SA-level `iam.serviceAccountTokenCreator` is narrowly scoped (can't impersonate any other SA)

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| 403 on `gcloud auth print-access-token --impersonate-service-account` | Deploy SA lacks `iam.serviceAccountTokenCreator` on target SA — check SA-level IAM binding, not project-level |
| WIF auth step fails | Provider attribute condition rejects the OIDC token — verify `attribute.repository` and `attribute.ref` match the CI run |
| Token arrives empty in Playwright | sessionStorage is per-origin — ensure `addInitScript` runs after origin is set but before page scripts execute |
