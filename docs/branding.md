# Branding & Messaging Guide

Authoritative for how SecureAgentBase describes itself — landing page copy, README,
changelog announcements, release notes, and anywhere else words represent the product.
When a claim and this guide disagree with the code, **the code wins and this guide gets
corrected**. See [../AGENTS.md](../AGENTS.md) for coding rules; this file is for words.

## Positioning statement

**SecureAgentBase is the sovereign, guardrailed SDLC for autonomous coding agents.**
One command bootstraps a locked-down GCP + Firebase + GitHub Actions software factory
in the user's own cloud account; OpenCode agents then build inside a deterministic cage —
spec-first skills, validated writes, tested security rules, security scans and PR gates —
commanded asynchronously from Discord.

- **Audience:** senior engineers, technical founders, high-agency builders who want AI
  velocity without AI spaghettiware or platform lock-in.
- **Enemy:** prompt-to-app platforms that emit unmaintainable code, leak keys, skip
  testing, and trap users in proprietary sandboxes.
- **Moat:** deterministic cages around probabilistic agents, on 100% user-owned
  infrastructure.

## The claim-to-evidence rule

Every capability claim in public copy must name a mechanism that exists in this repo
today. If you cannot point at the artifact, the claim does not ship. Current inventory:

| Claim | Evidence in repo |
|---|---|
| Automated static security scans on every PR | `.github/workflows/security-scan.yml` — CodeQL, Semgrep, Trivy, Grep Guard, npm Audit |
| Strict PR/test gates | Branch protection on `main` — 10 required checks; `.github/workflows/ci.yml` |
| Spec-first agent workflow | `.opencode/skills/` shipped with every template repo (`to-spec`, `to-tickets`, `implement`, `code-review`) — procedural, **not** a CI-enforced gate; never claim "CI rejects PRs without specs" |
| Validated, audited Firestore writes | `src/guardrails/` (`validate`, `safe-firestore`, rate limits) — enforced by the Grep Guard CI check |
| Tested Firestore security rules | `firestore.rules` + `src/_tests_/firestore-rules.test.js` (40 tests) |
| One-command bootstrap of user-owned infra | `cli/src/index.ts` → `init` (GCP, Firebase, GitHub, VM) |
| Staging deploy on merge, production on release | `firebase-deploy-staging.yml` (push to `main`), `firebase-deploy.yml` (`release: published`) |
| Command from Discord | Kimaki-managed VM running agent sessions in Discord threads |

Wording nuance that matters: skills *steer* agents spec-first; guardrails code and CI
gates *enforce*. Don't blur the two — a reviewer will check.

## Discord framing

Discord is **asynchronous mobile command** for technical builders: dispatching specs,
reviewing PRs, directing merges from a phone. It is never a "no terminal required"
crutch or a no-code pitch. The terminal bootstrap is the primary path; Discord is how
you run the factory when you're away from the desk.

## Canonical CLI facts

The only source of truth is the parser in `cli/src/index.ts`. Copy anywhere (landing
page, README, docs) must match it exactly. As of 1.5.2:

```
npm install -g secureagentbase
secureagentbase init [--project-id <id>] [--billing-account <id>] [--auto-sa]
                     [--no-firebase] [--no-vm] [--github-pat <token>]
                     [--repo-name <name>] [--discord-token <token>]
                     [--discord-guild <id>] [--vm-zone <zone>] [-y]
secureagentbase status
secureagentbase destroy [-y]
```

`--sa-key` was removed in `bbaceb6` (2026-10-29) — never mention it again. Tokens are
preferably passed via `SECUREAGENTBASE_GITHUB_PAT` / `SECUREAGENTBASE_DISCORD_TOKEN`
env vars; copy should say "credentials stay in your environment".

## Status language

- Never label a working feature "coming soon". The web wizard works end-to-end today;
  only Google's production sign-in verification is pending. Correct form:
  "Works today — Google sign-in verification in progress".
- Capability status (e.g. OAuth verification) is stated as fact with its scope, not
  hidden behind vague badges that read as "unfinished product".

## Banned phrases

| Banned | Why |
|---|---|
| "No terminal required" | Positions as no-code toy; contradicts the CLI-first moat |
| "No-code" / "without writing code" | Same — the audience writes and reviews code |
| "CI enforces spec-first" | Not true yet; skills are procedural (see table above) |
| "10x faster" / vague multipliers | Unverifiable; our pitch is trust, not speed hype |
| Any capability without a repo artifact | Violates the claim-to-evidence rule |

## Change protocol

Public copy changes go through a PR and must update, in the same PR:
1. the copy itself,
2. `src/_tests_/posts.test.tsx` (it pins the landing messaging),
3. this guide if the claim inventory or canonical facts changed.
