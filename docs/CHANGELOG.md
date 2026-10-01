# Changelog

Chronological record of changes. Durable rules stay in `AGENTS.md`; this file
captures outcomes, fixes and releases.

## 2026-10-01 (e1361a9, fcf8b1b, 81cbfca)

- **CLI**: Added `ensureAdc()` to guide users through `gcloud auth application-default login` instead of dying on raw Google Auth errors; `init` and `destroy` now surface copy-pasteable "Fix/Then/Docs" guidance. Handles common cases (no credential source, expired/revoked, gcloud missing, scope-less VM, GCE metadata) without spawning the interactive login on a GCE VM.
- **Security**: Fixed `npm audit` by overriding vulnerable transitives (@grpc/grpc-js, brace-expansion, @vitest/mocker, fast-uri, qs) so the security scan passes.
- **CI**: Unshared concurrency between deploy workflows (`secureagentbase-e2e`) to prevent e2e races.
- **CLI**: `secureagentbase --version` now reads from `cli/package.json`.

## 2026-09-30 (4d9f97d, b66dccb, 3829e96, b4db476)

- **Discord cleanup**: Added `scripts/e2e-discord-cleanup.sh`; both e2e workflows now run pre-flight and post-run (always) cleanup of `#agentbase-testing` channels.
- **Billing/roles**: Staging deploy SA gets `billing.projectManager` + `compute.admin`. Stopped unlinking billing between e2e suites.
- **Cache headers**: `firebase.json` sets immutable assets and no-store for HTML to kill stale bundle issues.
- **VM pre-flight**: Hardened teardown and cleanup of leftover `secureagent-manager` VMs before wizard runs.

## 2026-09-30 (v1.4.7 release)

- Gate green, production deployed, `secureagentbase@1.4.7` published to npm.
- Tag moved to `b66dccb`. Production serves updated assets (409 classifier included).

## Earlier

See git history for full detail. This changelog tracks user-visible behavior,
security fixes, and CI hardenings only; resolved-debug sections were removed
from `AGENTS.md` in favour of ADRs.