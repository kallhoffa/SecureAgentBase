---
name: release-gate
description: SecureAgentBase release and CI/CD pipeline. Use when releasing a new version, preparing a PR, debugging a failing CI workflow, deciding what must pass before a production deploy, or understanding the staging e2e gate. Covers npm run check, security-scan, staging deploy, the wizard+CLI e2e gate, and the tag-based production promote.
---

# Release Gate (SecureAgentBase CI/CD)

A release travels through a chain of gates. **Do not cut a release until every gate is green.**

## The chain

1. **PR / push to `main`** → `.github/workflows/security-scan.yml` runs on every PR and push:
   - **CodeQL** — JS/TS analysis (`github/codeql-action`).
   - **Semgrep SAST** — custom rules in `.semgrep/`. Note: the `generic` language is rejected by modern semgrep-core; vm-secrets rules must use `regex` language. All path patterns should carry a `**/` prefix to comply with semgrepignore v2.
   - **Trivy** — config + secret scan, SARIF uploaded to GitHub Security (needs `security-events: write` on the job).
   - **Grep Guard** — greps for raw Firestore writes outside `src/guardrails/` and inline `Environment="..."` secret expansions in startup scripts.
   - **npm Audit** — `npm audit --audit-level=high` for both the root and `cli/` (must be 0).
2. **Push to `main`** → `.github/workflows/firebase-deploy-staging.yml` deploys hosting + Firestore rules to staging. This run skips `E2E_FULL`.
3. **Version tag (`vX.Y.Z`)** → `.github/workflows/firebase-deploy.yml`:
   - **Staging E2E Gate** — hardcodes `E2E_FULL: 'true'` and runs the real wizard e2e suite (`tests/e2e/wizard.spec.js`, ~38 tests incl. "VM creation e2e test") and the CLI e2e suite (`tests/e2e/cli.spec.mjs`, 13 tests) against staging. This is the only place the full wizard + CLI e2e actually runs.
   - **Deploy to Production** — `needs: staging-gate`, then `firebase deploy --only hosting,firestore --project ${{ vars.FIREBASE_PROJECT_ID_PRODUCTION }}`.

> **⚠️ Keep `firebase-deploy.yml`'s staging-gate in sync with `firebase-deploy-staging.yml`.**
> The two workflows duplicate the CLI e2e setup (best-effort role loop, deploy-SA
> self-grant step, Build CLI / Run CLI E2E steps). Fixes to the CLI e2e gate (e.g.
> PR #51/#55: deploy SA self-grant of `secretmanager.admin` + `iam.serviceAccountUser`,
> and the `vars.GCP_SA_STAGING` phantom-SA fix) MUST be mirrored in both files or the
> next release fails at the gate. `DEPLOY_SA` derives from `vars.GCP_SA_STAGING`
> (agentbase-staging project), never from `@${PROJECT}` (agentbase-test-staging).

## Pre-PR checklist

Run `npm run check` (test:ci + lint + build) before opening a PR. Also run the security scans locally when feasible:

```bash
npm run check
npx semgrep --config=.semgrep/ .
npx trivy fs . --scanners config,secret
```

## Cutting a release

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
```

Watch the `firebase-deploy.yml` run: the Staging E2E Gate takes ~15 minutes (wizard ~7.3m + CLI), then Deploy to Production runs. Confirm both jobs end `success` before announcing.

## Environment variables (GitHub repo variables, not secrets)

- `VITE_APP_MODE=true` only in `kallhoffa/SecureAgentBase`.
- `VITE_APP_NAME` — app title (falls back to `'Your App'` / `'SecureAgentBase'`).
- `FIREBASE_API_KEY_*`, `FIREBASE_PROJECT_ID_*`, `GCP_WIF_PROVIDER`, etc. — read via the `vars` context.
- `WIZARD_GITHUB_USERNAME` — only this user can trigger the staging deploy via `workflow_dispatch`.
