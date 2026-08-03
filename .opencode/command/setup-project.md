---
description: Configure this repo for the agent skills — scaffold CONTEXT.md and docs/adr/, and record the issue tracker and triage label vocabulary in docs/agents/. Run once per repo before first use of to-tickets, to-spec, wayfinder, or code-review. Use when a repo has no CONTEXT.md, no docs/adr/, or the skills complain about a missing issue tracker.
---

# Setup Project (per-repo configuration)

Scaffold the per-repo configuration that the other skills assume:

- **Domain docs** — where `CONTEXT.md` and ADRs live (root-level by default).
- **Issue tracker** — where issues live: GitHub, GitLab, or local markdown under `.scratch/`.
- **Triage labels** — the strings used for triage (only if the `triage` skill is installed).

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Don't assume:

- `git remote -v` — is this a GitHub/GitLab repo?
- Does `CONTEXT.md` exist at the root? Does `docs/adr/` exist?
- Does `docs/agents/` already hold this skill's output from a prior run?
- Is a `triage` skill installed (a `triage` skill folder alongside this one, or `triage` in available skills)? This decides whether the triage-label section runs at all.
- Monorepo signals — a `pnpm-workspace.yaml`, `workspaces` in `package.json`, or populated `packages/*` with its own `src/`. Their absence means single-context, which is almost every repo.

### 2. Present findings and ask

Summarise what's present and what's missing, then take the sections in order — one section, one answer, then the next. Lead each with the recommended answer so the user can accept it in a word. Skip a section entirely when exploration already settled it.

**Section A — Issue tracker.**

> Explain to the user: skills like `to-tickets`, `to-spec`, and `wayfinder` read from and write to the issue tracker. They need to know whether to call `gh issue create`, write a markdown file under `.scratch/`, or follow some other workflow.

Default posture: these skills were designed for GitHub. If `git remote` points at GitHub, propose GitHub. Otherwise offer:

- **GitHub** — issues live in the repo's GitHub Issues (`gh` CLI). Recommend for SecureAgentBase projects.
- **GitLab** — issues live in the repo's GitLab Issues (`glab` CLI).
- **Local markdown** — issues live as files under `.scratch/<feature>/` (solo projects or repos without a remote).
- **Other** (Jira, Linear, etc.) — ask the user to describe the workflow in one paragraph.

Record the choice in `docs/agents/issue-tracker.md`.

**Section B — Triage label vocabulary.** Skip entirely if the `triage` skill isn't installed.

Ask exactly one question: keep the default triage labels? Defaults: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. On "no", collect the overrides and write them to `docs/agents/triage-labels.md`.

**Section C — Domain docs.** Default to **single-context**: one `CONTEXT.md` + `docs/adr/` at the repo root. Offer multi-context (a root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files) only when exploration found monorepo signals.

### 3. Write

- Create `CONTEXT.md` at the repo root with a heading and a one-line "glossary of this project's domain terms" note — the `domain-modeling` skill fills it in as the team works. Keep it a glossary, never a spec or scratch pad.
- Create `docs/adr/` (the `domain-modeling` skill writes ADRs there as decisions crystallise; see its `ADR-FORMAT.md`).
- Write `docs/agents/issue-tracker.md` (and `docs/agents/triage-labels.md` when the triage skill is installed).
- Do NOT create or edit `AGENTS.md`/`CLAUDE.md` unless the user explicitly asks — this skill scaffolds working files, not agent instructions.

### 4. Confirm

Show the user the drafts and the list of created files before finishing. Never overwrite an existing `CONTEXT.md` or `docs/agents/*` without asking first.
