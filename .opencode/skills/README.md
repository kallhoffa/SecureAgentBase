# Agent Skills

This directory vendors agent skills in the standard `SKILL.md` format. opencode and kimaki auto-discover them (`**/SKILL.md` under a skills directory), so every project built from this template inherits them — and the VM startup script also installs them globally to `~/.config/opencode/skills/` (and `~/.claude/skills/`), so even fresh/empty user repos get them.

## Attribution

Most of these skills are adapted from **Matt Pocock's engineering skills** — https://github.com/mattpocock/skills — MIT licensed, © 2026 Matt Pocock. Their content has been lightly adapted for opencode/kimaki (cross-skill references, subagent naming) and the Codex-specific `agents/` configs were dropped.

- Vendored/adapted from mattpocock/skills: `tdd`, `code-review`, `diagnosing-bugs`, `research`, `prototype`, `resolving-merge-conflicts`, `domain-modeling`, `codebase-design`, `improve-codebase-architecture`, `to-tickets`, `to-spec`, `implement`, `wayfinder`.
- SecureAgentBase-original: `secure-firestore`, `infra-setup`, `release-gate`, `setup-project`.

## How to use them

**Model-invoked** (the agent reaches for them when relevant — no action needed):

- `tdd` — red-green-refactor vertical slices
- `code-review` — two-axis review (Standards + Spec)
- `diagnosing-bugs` — disciplined bug/perf diagnosis loop
- `research` — background agent reading primary sources
- `prototype` — throwaway prototype to answer a design question
- `resolving-merge-conflicts` — resolve by intent, never `--abort`
- `domain-modeling` — build/sharpen CONTEXT.md and ADRs inline
- `codebase-design` — deep-module vocabulary (interface, seam, depth)
- `secure-firestore` — SecureAgentBase Firestore guardrails

**User-invoked** (run as slash commands — the skills are designed to be triggered explicitly):

- `/setup-project` — configure this repo for the skills (issue tracker, domain docs). Run once per repo.
- `/to-tickets` — break a plan/spec into tracer-bullet tickets
- `/to-spec` — turn the current conversation into a spec
- `/implement` — build from a spec/tickets, then review
- `/wayfinder` — chart huge work as a map of decision tickets
- `/improve-codebase-architecture` — scan for deepening opportunities, HTML report, then grill
- `/tdd` — explicit TDD invocation
- `/code-review` — explicit review of changes since a fixed point

## Per-repo prerequisites

The workflow skills assume a `CONTEXT.md` (domain glossary), `docs/adr/` (decisions), and a recorded issue tracker in `docs/agents/issue-tracker.md`. Run `/setup-project` once per repo to scaffold these. A `CONTEXT.md` stub is created automatically by the VM startup script.
