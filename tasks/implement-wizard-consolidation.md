---
title: Implement wizard consolidation (map #27)
description: >
  Managed by kimaki wayfinder handoff. Implementation of the fully-grilled
  infra-setup wizard consolidation. Do not move or delete this file without
  updating the originating session.
---

# Implement: infra-setup wizard consolidation (map #27)

**Source of truth:** [Map #27 — Wizard consolidation](https://github.com/kallhoffa/SecureAgentBase/issues/27) — all 6 grilling tickets (#28–#33) are resolved and closed, each with a resolution comment. Read the map body AND all six resolution comments before writing code.

**Process:** Load the `implement` skill first (`.opencode/skills/implement/SKILL.md` — use tdd at agreed seams, typecheck regularly, full suite at end, code-review at end, commit to current branch). CI is the source of truth: `npm run check` (test:ci + lint + build) runs on every PR. Local runs are optional fast feedback.

## Final structure (from #33 resolution — this is the target)

```
[OPTIONAL] Sign in — "save your configuration/progress to the app"
            (skipable, never locks the next step; app auth = persistence only)
STEP 1: DISCORD — bot token + server invite. No GCP.
STEP 2: GITHUB  — PAT paste + repo vars. No GCP. (OIDC half moved out.)
STEP 3: GCP     — ONE "Connect Google Cloud" consent powers ALL cloud work:
                  Firebase apps app-staging + app-prod (select-or-create)
                  CI deploy SAs + Workload Identity Federation (moved from GitHub step)
                  app-vm project + agent SA (identity-only, no key)
                  Billing link (app-vm only, hard gate)
                  Secrets → Secret Manager
                  Create VM (or manual-IP escape hatch)
```

## Decisions that MUST be honored (from the resolutions)

1. **Optional Sign-in (step 0)** — app auth protects ONLY persistence: `infra_configs` + encrypted `projects` store (both uid-scoped). Signed-out = in-memory/localStorage, no Firestore writes. `/infra-setup` drops `RequireAuth` (App.tsx:81). Stale "Please sign in to Google (Step 1)" errors reworded to reference the GCP consent (they actually check the GCP token).
2. **Lock semantics (#32 amended):** `isStepLocked(1) = false` (Discord never locked); `isStepLocked(n) = !isStepCompleted(n-1)` for n ≥ 2. Step 0 completion = `!!ctx.user`, excluded from the chain. `step3Complete` flag + `SET_STEP3_COMPLETE` + REHYDRATE case + all 11 call sites DEAD; reducer owns `{ expandedSteps }` only; EXPAND_NEXT guard `<= 3`. `isStepWarning` dropped (selector, binding, StepHeader `isWarning` prop, warning UI). Auto-expand re-points to Discord (drops `[user]` dep); GSI callback's `expandNextStep` re-points.
3. **Legacy Firestore fields (#32):** stop writing `step3_complete` / `service_account_configured` (drop from saveConfig write + allowFields). Keep reading for rehydrate — legacy `vm_ip` / firebase project ids feed the new derivable completion signals directly; no migration write-back. SA-key-upload write of `service_account_configured` dies. create-app.tsx:58 chip reads `gcp_connected` instead.
4. **Openid fix (#33):** GCP consent scope (infra-setup.tsx:1818, `cloud-platform` + `cloud-billing.readonly`) gains `openid email`. IAM grants — `firebase.admin` on staging/prod (:546/:1571), `billing.projectManager` on app-vm (:1513/:1572), `grantUserBillingRole` (:1494) — target the GCP consent account's email instead of `user?.email`; warn when app-auth email (if signed in) differs. No GSI unification — two Google consents stay.
5. **#28/#31 mechanics preserved inside the GCP step:** operator OAuth only for Firebase apps (no SA token); project creation via cloudresourcemanager `projects.create` → `addFirebase` shared helper; billing hard gate — Create VM disabled until `billingEnabled === true`, auto-link-first-account shortcut (:3010-3024) removed; billing renders only in auto mode; manual-IP escape hatch (`handleManualVMIP`, infra-setup.tsx:3345) inside the GCP step.
6. **#29 roles for the agent SA:** `compute.instanceAdmin.v1`, `billing.user`, `billing.viewer`, `serviceusage.serviceUsageAdmin`, `iam.serviceAccountUser`, `iam.serviceAccountTokenCreator`, `secretmanager.secretAccessor`. Drop `firebase.admin`/`workloadIdentityPoolAdmin`/`securityAdmin`.
7. **Step-2 skip-to-manual hack (infra-setup.tsx:3996) dies** — no skip hacks anywhere.
8. **e2e (wizard.spec.js):** headers renumber to the new structure; auth injection (`__e2e_token`) kept (signed-in path exercises persistence); SA-key textarea + Continue flow dies (Firebase completion via `__e2e_firebase_*` injections); "Step 8 unlocked → Enable APIs & Create VM" becomes the GCP step; one signed-out smoke assertion optional (implementer's call).

## Files you'll touch

- `src/infra-setup.tsx` — the 8-step wizard (step headers at ~:3824-4865, GSI at :1818, saveConfig :2641, rehydrate :2414, manual IP :3345, skip hack :3996)
- `src/framework/infra-setup/wizard-progress.js` + `useWizardProgress.js` — selectors, reducer, lock chain
- `src/_tests_/wizard-progress.test.js` — 4-step matrix, step3Complete tests die
- `src/App.tsx` (:81 RequireAuth wrapper on /infra-setup comes off)
- `src/create-app.tsx` (:58 `service_account_configured` → `gcp_connected`)
- `tests/e2e/wizard.spec.js` — renumber + flow updates
- CONTEXT.md glossary if step names change meaningfully (Manual VM, Billing link terms exist)

## Constraints (enforced by CI)

- All Firestore writes through guardrails (safeSet/safeCreate/safeUpdate/safeDelete) with ALLOW_FIELDS; validate() before writes; useRateLimit on user-triggered actions; never raw Firestore write methods outside src/guardrails/.
- No secrets in serial-console writes or systemd inline Environment=.

## Suggested slice plan (adapt as you go, CI-gate each PR)

1. wizard-progress.js + useWizardProgress.js: 4-step selectors, step0-optional lock, drop step3Complete/isStepWarning; unit tests green.
2. infra-setup.tsx structural: step headers/case renumber, merge Firebase+VM+OIDC into GCP step, drop skip hack, manual IP wiring, RequireAuth off, create-app chip, legacy fields write/read.
3. openid scope + grant re-sourcing (GCP email), mismatch warning.
4. e2e rework; full `npm run check`; code-review; commit.
