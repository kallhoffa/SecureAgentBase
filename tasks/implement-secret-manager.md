---
title: Implement Secret Manager credential storage (map #36)
description: >
  Managed by kimaki wayfinder handoff. Implementation of the fully-grilled
  Secret Manager credential storage map. Do not move or delete this file
  without updating the originating session.
---

# Implement: Secret Manager credential storage (map #36)

**Source of truth:** [Map #36 — Credential storage without passphrases](https://github.com/kallhoffa/SecureAgentBase/issues/36) — all 3 tickets (#34 research, #35 web grilling, #37 CLI grilling) are resolved and closed. Read the map body AND the resolution comments of #34/#35/#37 before writing code (they are binding).

**Process:** Load the `implement` skill first (`.opencode/skills/implement/SKILL.md`). CI is the source of truth: `npm run check` (test:ci + lint + build) runs on every PR. `npm run e2e:smoke:ci` / the staging deploy e2e gate verifies the wizard flow.

## Destination (map body, abridged)

Replace passphrase-encrypted config + plaintext metadata/Firestore secrets with Google Cloud Secret Manager in app-vm. Secret values (GitHub PAT, Discord bot token) live as per-secret IAM-gated secrets; accessors are the operator's Google account (via OAuth) and the agent SA (VM boot via metadata server). The agent SA JSON key is **eliminated** (identity-only). Firestore, VM metadata, and the CLI config carry only secret references. Passphrase UX, encrypted blob, metadata-carried secrets, and SA key are gone.

## Decisions that MUST be honored (from #35 + #37 resolutions)

1. **2 secrets only** — `github-pat` and `discord-bot-token` in Secret Manager (app-vm project). Per-secret `roles/secretmanager.secretAccessor` bound to `user:<operator email>` AND the agent SA. SA is identity-only — `createServiceAccountProgrammatically` already generates no key (keep it that way).
2. **Firestore `infra_configs/{uid}` keeps references only** — secret NAMES + non-secret config (project ids, repo, WIF provider, guild id, Firebase web configs). No raw secrets → the GHSA-x49w re-enter-every-session UX dies; rehydrate restores everything. Drop `discord_bot_token` (+ legacy `service_account_key`) from saveConfig allowFields; stop writing `github_pat` anywhere.
3. **VM boot** — startup script fetches the 2 secrets via the metadata-server identity (agent SA), with retry-with-backoff for IAM eventual consistency (fresh grants can 403 up to ~7 min). VM create body gains explicit `serviceAccounts` field: agent SA email + `cloud-platform` scope. `buildVmMetadata` drops `github_pat` + `discord_bot_token` keys. `encryption_passphrase` already scrubbed — keep it that way.
4. **App auth gates only the config doc** — wizard flow runs on the GCP OAuth token (already true post-consolidation).
5. **Rotation = new secret version** (strongly consistent); destroy old versions after grace. No key rotation (no key).
6. **CLI ADC-only** — delete `SAKeyAuthClient`, `signJwtAndGetToken`, `--sa-key` flag (init.ts/destroy.ts), `saKeyPath` config field. `createAuth` becomes a thin `GoogleAuth` wrapper. Scopes comment (auth.ts:5-9) loses the devstorage.read_write SA-key note.
7. **CLI secrets = same Secret Manager store** — write at prompt time (operator has `secretmanager.admin` from setup), read on demand (operator gets `secretAccessor`). GitHub PAT used in-memory during the init run only (grep: githubPat only in init.ts).
8. **CLI local config references-only** — remove `githubPat`/`discordBotToken` value fields from `Config`; keep non-secret fields + fixed secret names for `status`. Plaintext 0600 fine. CLI stays Firestore-free.
9. **CLI VM metadata carries no secret values** — drop `github_pat`/`discord_bot_token` from the metadata build (init.ts:438,440). Startup script fetches both itself via metadata-server identity, writing to `/root/.kimaki/env` as today.

## Current-state audit (Aug 6, post-consolidation)

Already done (keep):
- Agent SA identity-only: `createServiceAccountProgrammatically` generates no key; `gcp_sa_key` metadata carriers (createVm/handleCreateVM) deleted in cleanup; `hasGcpAccess` deleted.
- `roles/secretmanager.secretAccessor` + `iam.serviceAccountTokenCreator` in the #29 agent-SA role set.
- `encryption_passphrase` fully scrubbed from wizard + docs.
- `github_pat` no longer restored from Firestore; `discord_bot_token` not restored.

Remaining gaps:
- **Web:** `buildVmMetadata` (infra-setup.tsx:2840+) still pushes plaintext `github_pat` + `discord_bot_token` to VM metadata. saveConfig allowFields (:2548) still includes `discord_bot_token` + legacy `service_account_key`. No Secret Manager writes exist. `getServiceAccountToken` still has the `signJwtAssertion` SA-key fallback (last key consumer). No `serviceAccounts` field on the VM create body (createVmWithSetup). Operator lacks `roles/secretmanager.admin` grant for writes.
- **CLI:** `SAKeyAuthClient`/`signJwtAndGetToken`/`--sa-key`/`saKeyPath` all still present. config.ts holds `githubPat`/`discordBotToken` value fields. init.ts:438,440 put PAT/token in VM metadata. startup-script.sh:25-26,34,327-329 reads `github_pat`/`discord_bot_token`/`gcp_sa_key` metadata and writes `/root/.kimaki/gcp-sa-key.json`.

## Files you'll touch

- `src/framework/infra-setup/api.ts` — add `smEnsureSecret`/`smWriteSecret` (create → addVersion → setIamPolicy merge) + `smFetchSecret` helpers; maybe `grantUserSecretManagerAdmin`.
- `src/infra-setup.tsx` — saveConfig allowFields; buildVmMetadata; createVmWithSetup body (serviceAccounts); getServiceAccountToken (drop signJwtAssertion fallback); Discord/GitHub save handlers (write to SM); rehydrate (secret refs).
- `src/framework/infra-setup/scripts.ts` — startup script: metadata-server secret fetch with retry-with-backoff; env output as today.
- `src/_tests_/` — unit tests for the SM helpers (mocked fetch) + allowFields assertions.
- `cli/src/lib/auth.ts` — ADC-only createAuth.
- `cli/src/utils/config.ts` — references-only Config.
- `cli/src/commands/init.ts` — new init flow (prompt → validate → SM write → in-memory → refs); drop metadata secrets.
- `cli/src/commands/destroy.ts`, `cli/src/index.ts` — drop `--sa-key`.
- `cli/src/lib/startup-script.sh` + `startup-script.ts` — drop GCP_SA_KEY/gcp-sa-key.json; metadata-server secret fetch.
- `tests/e2e/wizard.spec.js` — wizard e2e auto-setup writes secrets to SM before VM boot test (E2E_FULL).
- AGENTS.md + CONTEXT.md — passphrase/SA-key glossary cleanup.

## Constraints (enforced by CI)

- All Firestore writes through guardrails with ALLOW_FIELDS; validate() before writes; useRateLimit on user-triggered actions.
- No secrets in serial-console writes or systemd inline Environment=. Secret Manager secret payloads base64-encoded over the wire; never logged.
- Trivy/Semgrep/Grep Guard must stay green (no raw Firestore writes, no inline secrets).

## Suggested slice plan (adapt as you go, CI-gate each PR)

1. **Web: SM write path + references-only.** `smEnsureSecret`/`smWriteSecret` helpers (create→addVersion→setIamPolicy with merge) in api.ts + unit tests (mocked fetch); grant operator `roles/secretmanager.admin` on app-vm in `grantGcpRolesProgrammatically`; Discord/GitHub save handlers write secrets to SM; saveConfig drops `discord_bot_token`/`service_account_key` from allowFields + write; config stores `sm_secret_github_pat`/`sm_secret_discord_token` refs; rehydrate restores refs (kills re-enter UX).
2. **Web: VM boot via metadata-server identity.** VM create body gains `serviceAccounts` (agent SA + cloud-platform); `buildVmMetadata` drops `github_pat`/`discord_bot_token`; scripts.ts startup fetches 2 secrets via metadata-server SA token with retry-with-backoff; drop `signJwtAssertion` fallback in getServiceAccountToken (identity-only).
3. **CLI: ADC-only auth.** Delete SAKeyAuthClient/signJwtAndGetToken/`--sa-key`/saKeyPath; createAuth = GoogleAuth wrapper; scopes comment update.
4. **CLI: SM secrets + references-only config.** New init flow; config.ts value fields out; status shows secret names; init.ts metadata drops secrets; startup-script.sh drops GCP_SA_KEY + fetches secrets via metadata server.
5. **Verification.** e2e wiring (wizard auto-setup writes secrets in SM mode before VM boot), full `npm run check`, code-review, staging e2e gate.
