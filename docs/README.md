# Documentation Index

One place to find the right document. Each entry says what it is authoritative
for and when to reach for it instead of something else.

## Start here

| I want to… | Read |
|---|---|
| Install and run the CLI | [cli.md](./cli.md) — the `secureagentbase` CLI end to end |
| Set up this repo locally | [../README.md](../README.md) → Quick Start, then `npm run setup` |
| Know what the pieces are called | [../CONTEXT.md](../CONTEXT.md) — domain glossary |
| Understand the engineering approach | [../LIFECYCLE.md](../LIFECYCLE.md) — philosophy, CI/CD, rollback, feature flags |
| Know the coding rules | [../AGENTS.md](../AGENTS.md) — conventions, guardrails, security rules |

## By task

| Task | Authoritative doc |
|---|---|
| Cut a release / check the gate | `.opencode/skills/release-gate/SKILL.md` |
| Change the infra wizard or VM startup | `.opencode/skills/infra-setup/SKILL.md` |
| Write Firestore code | `.opencode/skills/secure-firestore/SKILL.md` |
| Debug a failing e2e | `.opencode/skills/diagnosing-bugs/SKILL.md` |
| Debug the CI pipeline | `../LIFECYCLE.md` → CI/CD Pipeline; otherwise `.opencode/skills/release-gate/SKILL.md` |
| Get the code ready for an external reviewer | `.opencode/skills/external-readiness/SKILL.md` — hygiene bar, audit commands, how to defend the approach |
| Understand why something is the way it is | [adr/](./adr/) — architecture decision records |
| Find out what changed recently | [CHANGELOG.md](./CHANGELOG.md) |
| Report or fix a security issue | [../SECURITY.md](../SECURITY.md) — reporting channel, scope, known caveats |
| Contribute a change | [../CONTRIBUTING.md](../CONTRIBUTING.md) — commands, gates, non-negotiable rules |
| Read the wizard-only debugging notes | [../WIZARD_DEV_NOTES.md](../WIZARD_DEV_NOTES.md) — internal, not user-project docs |

## Reading order for a new contributor

1. [../CONTEXT.md](../CONTEXT.md) — vocabulary
2. [cli.md](./cli.md) — the product you ship
3. [../README.md](../README.md) — repo layout and commands
4. [../AGENTS.md](../AGENTS.md) — the rules you must follow
5. [../LIFECYCLE.md](../LIFECYCLE.md) — why the pipeline is shaped this way

Wizard maintainers should also read
[WIZARD_DEV_NOTES.md](../WIZARD_DEV_NOTES.md) — GCP propagation quirks and
debugging detail. Nothing strips it from the build, so it stays
wizard-specific: if a note there is needed to run the product, it belongs in
[cli.md](./cli.md) or the infra-setup skill instead.

## Which doc wins

There is overlap by design. The precedence rule:

1. **Code and tests** are ground truth for behaviour.
2. **Skills** (`.opencode/skills/`) are ground truth for *procedures* — they are
   written against the current pipeline and are the most frequently maintained
   docs here. When a skill and `AGENTS.md` disagree on a procedure, trust the skill.
3. **ADRs** are ground truth for *why* a decision was made. They do not expire.
4. **`AGENTS.md`** is ground truth for *rules and conventions*.
5. **`LIFECYCLE.md`** is ground truth for *philosophy and infrastructure layout*.
6. **`CHANGELOG.md`** is ground truth for *what changed*, and is the only doc
   expected to age.

## Keeping docs honest

- Perishable status notes do not belong in `AGENTS.md`. Record outcomes in
  `CHANGELOG.md` and decisions in `docs/adr/`.
- When you change a procedure (a pipeline step, a wizard step, a guardrail),
  update the owning skill in the same commit.
- When you make a decision that a future reader would reasonably question,
  write an ADR. `docs/adr/README.md` has the format.
- Doc links are enforced: `scripts/check-doc-links.js` runs in the
  `grep-guard` job of `security-scan.yml` and fails if a referenced file is
  missing. Run it locally with `node scripts/check-doc-links.js .` before you
  push.