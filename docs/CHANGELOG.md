# Changelog

Chronological record of changes. Durable rules stay in `AGENTS.md`; this file
captures outcomes, fixes and releases.

## 2026-10-29 (v1.5.2 release, 5c40fa6)

- **Release**: `v1.5.2` — staging gate, production deploy and npm publish all green. Production bundle verified to serve `LEGAL_URLS` from `secureagentbase.com`; npm registry at `1.5.2`.
- **Legal URLs**: `LEGAL_URLS` now points at `secureagentbase.com/privacy` and `/terms` instead of `agentbase.web.app` (Google rejects production consent screens on Public Suffix List subdomains). Recorded as ADR-0007. Merged as PR #70 — the first change through the newly enabled branch protection (10 required checks, PRs mandatory, force pushes blocked).
- **Branch protection**: `main` now requires a PR with all 10 PR-context checks green; direct pushes (admin included) are rejected, force pushes and deletions blocked. Verified by attempting and being rejected. `CODEOWNERS` stays advisory while the repo is single-maintainer (self-approval deadlock).

## 2026-10-29 (v1.5.1 release, 9a7a316)

- **Release**: `v1.5.1` shipped the apt-key fingerprint verification added after `v1.5.0`. Staging E2E gate, production deploy and npm publish all green; the published tarball confirmed to contain `key_fprs_allowlisted()` and both pinned fingerprints. Production live.
- **VM hardening**: The git-core PPA key (keyserver.ubuntu.com) and the GitHub CLI keyring (cli.github.com) were previously installed into `/usr/share/keyrings` unverified. Both are now checked against fingerprints pinned in the startup script, and the apt repository is skipped entirely on mismatch — a missing PPA downgrades git to the distro version, a substituted signing key is root code execution. The check rejects *every* primary key not in the allowlist, so a key appended to a genuine keyring is refused.

## 2026-10-29 (bbaceb6, 047dd70, bb8e962, 7515fbb, c358da3, 4962f0a, v1.5.0 release)

- **Release**: `v1.5.0` shipped. Staging E2E gate (full wizard + CLI e2e), production deploy and npm publish all green; `secureagentbase@1.5.0` verified on the registry and its bundled startup script confirmed to contain the pinned kimaki. `patched_versions: 1.5.0` recorded on `GHSA-jr35-vrjh-x8m8` / `GHSA-8v3r-8672-22m5` (published advisories cannot be closed through the API).
- **Supply chain**: The bundle pipeline no longer runs `curl … | bash` and no longer pulls any floating version. Every input is pinned to an exact version *and* SHA256, verified with `sha256sum -c`: opencode `1.18.9`, gh `2.63.2`, Node `20.18.0`, Bun `1.1.42`. `kimaki@latest` became `kimaki@1.4.0` in the bundle build, the VM startup script, the `npx -y` registration fallback, and `scripts/build-bundle.sh`. Docker image `node:20-bullseye` became `node:20.18.0-bullseye`. Fixes `GHSA-jr35-vrjh-x8m8` / `GHSA-8v3r-8672-22m5`.
- **Security (pre-review)**: Dropped the `--sa-key` flag from the landing-page copy, deleted the undeployed `functions/create-secret/` function (took a raw service-account key in `req.body`), deleted the dead `secret-storage.js`, and added `.github/CODEOWNERS`.
- **CI**: Pinned the three Playwright jobs to `ubuntu-24.04`. GitHub moved `ubuntu-latest` to 26.04, where Playwright cannot install Chromium (`Playwright does not support chromium on ubuntu26.04-x64`).
- **Dependencies**: Cleared 7 newly published advisories (vite, vitest/@vitest/mocker, zod, qs, fast-uri) with same-major bumps; `npm audit` back to 0. Kept `typed-rest-client` at 2.3.1 because Stryker requires `~2.3.0`.
- **CLI**: `SECUREAGENTBASE_GITHUB_PAT` / `SECUREAGENTBASE_DISCORD_TOKEN` env fallbacks so tokens stay out of argv; explicit flags still win.

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