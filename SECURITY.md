# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Preferred: use GitHub's private advisory form.

**https://github.com/kallhoffa/SecureAgentBase/security/advisories/new**

Your report lands as a draft advisory only maintainers can see. You get a
conversation thread with the maintainer and credit in the published advisory.

> **If that form rejects you** (it requires private vulnerability reporting to be
> enabled in *Settings → Code security*), open a public issue titled
> `SECURITY: report — do not disclose` saying only that you have a report to
> share and a maintainer will contact you. Paste no details. You may also mail
> the maintainer directly via the commit author of any release tag.

Include in your report:

- What the attacker does, and from where (authenticated user, anonymous, CI,
  the deployed VM).
- The affected version or commit (`secureagentbase --version`, or a `git rev-parse HEAD`).
- Steps to reproduce, or a proof of concept.
- What you believe the impact is.

You should receive a response within **72 hours**. If you do not, chase the
same thread — nothing else in this repo is a security contact.

## Scope

In scope:

- The web app and Firestore rules in this repository.
- The `secureagentbase` CLI published to npm.
- The VM startup scripts under `shared/` and `cli/src/lib/startup-script.sh`.
- GitHub Actions workflows and the deploy path.
- Dependency vulnerabilities reachable in the shipped artifacts.

Out of scope:

- Findings that require a compromised CI secret or an attacker who already has
  repository write access — with the exception of privilege escalation or
  secret exfiltration that a workflow can trigger.
- Social engineering of maintainers or contributors.
- Vulnerabilities in third-party services (Google Cloud, Firebase, GitHub) or
  in dependencies at versions we do not ship.
- Reports from automated scanners with no demonstrated impact.

## What this project treats as high impact

These are the parts of the system where a bug has real consequences, and are
what an external reviewer should probe first:

| Area | Why it matters | Guardrails |
|---|---|---|
| **Client-side validation is advisory** | Any validation in the browser can be bypassed. Enforcement that matters is in Firestore security rules. | `firestore.rules`, tested by `npm run test:rules` |
| **Firestore writes** | Raw writes bypass ownership checks and audit stamps. | `src/guardrails/` — enforced by CI grep-guard |
| **The infrastructure wizard** | Handles user credentials, PATs, and service-account state. | See ADRs 0002 and 0007 |
| **The VM startup scripts** | Run as root at boot; secrets here reach the serial console. | `chmod 600` `EnvironmentFile=`, checked by Trivy and grep-guard |
| **The `secureagentbase` CLI** | Executes on contributor machines; spawns external tools. | CLI e2e suite in the release gate |

## Security tooling

Every push and pull request runs `.github/workflows/security-scan.yml`:

- **CodeQL** — JS/TS static analysis.
- **Semgrep** — custom rules in `.semgrep/`.
- **Trivy** — config and secret scanning; results upload to GitHub Security.
- **Grep guard** — fails on raw Firestore writes outside `src/guardrails/` and
  on inline `Environment="..."` secret expansions in systemd units.
- **npm audit** — `--audit-level=high` for both the root and `cli/`, must be 0.

Repository settings: secret scanning and push protection are **enabled**.

## Supported versions

Security fixes land on `main` and ship in the latest tagged release. Prior
releases are not patched.

| Version | Supported |
|---|---|
| latest release on npm | ✅ |
| anything older | ❌ |

Verify what is published with `npm view secureagentbase version`. Note that
`cli/package.json` in the working tree is stamped from the git tag at publish
time and is not a reliable answer to "what do users have?".

## Known caveats

This project ships client-side code. Treat the following as design constraints
rather than as vulnerabilities when reviewing:

- **Firebase config in the client bundle is public by design.** Security comes
  from Firestore rules, not from hiding the config.
- **OAuth client IDs are public.** Restriction happens at the Google console
  level (origins, redirect URIs), never in source.
- **Rate limiting in `src/guardrails/useRateLimit.js` is client-side only.** It
  improves UX; it is not an abuse control. Server-side enforcement would need
  Firestore rules or Cloud Functions.

A reviewer who reports any of the above as a finding is correct about the
mechanism and wrong about it being a defect — see `CONTEXT.md` for the reasoning.
