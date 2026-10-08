---
name: external-readiness
description: >
  Get a SecureAgentBase codebase ready to be read, judged, or defended by an
  outside reviewer — an external engineer, a security assessor, an investor,
  or a hostile one. Use when asked to "clean up", "polish", "make it presentable",
  "make it reviewable", "defend our approach", audit code hygiene, or when
  preparing the repo for external eyes. Covers the hygiene bar, the audit
  commands, what to fix first, and the answers to the objections a reviewer will
  raise. Load this before touching large files or when the question is "how does
  this look to someone who didn't write it".
---

# External Readiness

A reviewer forms their judgement from the first file they open. This skill is
the measured standard for how this repo should present, what to measure, and
what to say when someone challenges the design.

**Do not start with a rewrite.** Measure first, then fix the smallest thing that
changes the impression.

Canonical docs this skill defers to — read `docs/README.md` for the index,
`AGENTS.md` for rules, and `CONTRIBUTING.md` for the contributor surface. Never
restate those here; link them.

## The bar

Hard limits for new code. Existing debt is tracked in the baseline below so it
can shrink but not grow.

| Metric | Limit |
|---|---|
| Lines in one function or component | **500** |
| `useState` calls in one component | **20** |
| `console.log` in shipped source | **0** — use `console.error` for failures |
| `as any` / `: any` in new code | **0** |
| Silent `catch {}` (empty body) | **0** — log or rethrow |
| `TODO` / `FIXME` / `HACK` left in a merged change | **0** |
| Component over 1,000 lines | **0 new** |
| Test files or assertions deleted to make a change pass | **never** |

Every threshold is a signal a reviewer reads as a proxy for discipline. They are
enforced by review, not by CI — see "Make it enforceable" below.

## Measure before you claim anything

Never assert the codebase is clean. Run these and quote the numbers.

```bash
# Where is the bulk? largest files first
find src cli/src shared -name "*.ts" -o -name "*.tsx" -o -name "*.js" \
  | grep -v node_modules | xargs wc -l | sort -rn | head -20

# How tall is a single component? (function start → EOF)
grep -nE "^(export )?(const|function) [A-Za-z_]" src/infra-setup.tsx

# State load in one component
grep -c "useState" src/<file>.tsx

# Console noise in shipped source (exclude tests)
grep -rn "console\.log" src/ cli/src/ --include="*.ts" --include="*.tsx" \
  | grep -v _tests_ | wc -l

# Type escapes
grep -rn ": any\b\|as any" src/ cli/src/ --include="*.ts" --include="*.tsx" \
  | grep -v _tests_ | wc -l

# Swallowed errors
grep -rn -A 1 "catch.*{$" src/ cli/src/ --include="*.ts" --include="*.tsx" \
  | grep -E "catch \{\s*$|catch.*\{\s*\}" | wc -l

# Uncommented debt markers
grep -rn "TODO\|FIXME\|HACK\|XXX" src/ cli/src/ shared/ 2>/dev/null | wc -l

# Secret-shaped strings — verify each is a test fixture, never blanket-dismiss
git ls-files | xargs grep -ln "BEGIN PRIVATE KEY\|AKIA[0-9A-Z]\{16\}\|ghp_[A-Za-z0-9]\{36\}"
```

Then verify tests still pass and state the count:

```bash
npm run test:ci 2>&1 | grep -E "Test Files|Tests "
```

**Never call a secret-scanner hit a false positive without opening the line.**
The known hit here is `src/_tests_/schemas.test.js`, which uses
`'ghp_' + 'a'.repeat(36)` and a stub key — that is a fixture, and it is correct
for Trivy to pass on it.

## Fix in this order

Order is risk of damage, ascending. Do not skip to the last one first.

**1. Additive documents (do these always).** `SECURITY.md` and `CONTRIBUTING.md`
are pure additions that cannot break running code and directly answer "how do I
report a vuln" and "how do I contribute". Also `LICENSE` (Apache-2.0) and an
ADR when a decision will be questioned.

**2. Grow-prevention (cheap, high leverage).** Land the bar as a skill, a
review checklist, or a lint rule *before* attempting cleanup. The failure mode
is cleaning once while the monolith keeps accepting new code.

**3. Seams, not rewrites.** Extract behind tests. An in-place rewrite of the
highest-risk path, for cosmetic gain, is a bad trade.

**4. Enforce it.** Convert each manual rule to a check that fails CI. See
`.github/workflows/security-scan.yml` for the existing pattern and
`scripts/check-doc-links.js` for the shape of a cheap zero-dependency guard.

## Defending the approach

The reviewer's objection and the answer. Each is a design constraint, not a
defect — but say so with evidence, not with a shrug.

**"Client-side validation is bypassable."**
Correct, and not where we rely. Enforcement is in Firestore security rules,
tested by `npm run test:rules`. Point at `firestore.rules`.

**"Rate limiting is client-side."**
Yes — `useRateLimit` is a UX affordance, not an abuse control. It stops
accidental double-submits. Real enforcement needs rules or functions. Stating
this plainly is stronger than pretending otherwise.

**"Firebase config and OAuth client IDs are in the bundle."**
By design and public anyway. Security comes from Firestore rules and from
console-level origin restriction, never from hiding config.

**"Why not TypeScript everywhere?"** or **"Why JavaScript in the app?"**
Deliberate — `cli/` is TypeScript where types pay for themselves; application
code is JS. `npm run typecheck` still runs over it.

**"Why does the wizard log so much?"**
Historical debug instrumentation in `src/infra-setup.tsx`, acknowledged as
debt with a count. Do not defend it; commit to removing it and say by when.

**"There are 25 draft security advisories."**
That is the internal audit backlog, kept private until fixed. Triage them
before an external disclosure — do not present an unfixed 1 critical / 10 high
backlog as a strength.

**"The monolith is 4,849 lines."**
Acknowledge the number. The defence is that only **one** file exceeds 1,000
lines, it is the wizard's own root component, tests pass at 358, and there is
a staged extraction plan with e2e coverage. One isolated offender is a
different story than pervasive rot — verify that claim before repeating it.

## Current baseline

Recorded 2026-10-02 so the next audit can show movement rather than re-derive.

| Metric | Value |
|---|---|
| Largest file | `src/infra-setup.tsx` — 4,849 lines, **only** file over 1,000 |
| `InfraSetup()` component | lines 122 → 4,849 = **4,727 lines**, 92 `useState`, 14 `useEffect` |
| `console.log` in shipped src | **74** (59 in that one file) |
| `console.error` / `console.warn` | 46 / 34 — legitimate |
| `as any` / `: any` | **54** |
| Silent empty `catch` | **22** |
| `TODO` / `FIXME` / `HACK` | 4 |
| Commented-out code | 0 |
| Real secrets in tracked files | 0 |
| Tests | **358 passing** across 32 files |
| Draft security advisories | **25** — 1 critical, 10 high, 12 medium, 2 low, all undisclosed |
| Branch protection on `main` | **none** — CI is the only gate |
| Dependabot security updates | **disabled**, no `dependabot.yml` |
| Secret scanning + push protection | enabled |
| License | Apache-2.0 |

Never report these numbers as current without re-running the measurements. A
stale "it's clean" is worse than no claim.

## Make it enforceable

A skill is advice. A failing check is a constraint. For each rule in the bar,
prefer a gate:

```bash
# Existing precedent: scripts/check-doc-links.js, run first in the
# grep-guard job of .github/workflows/security-scan.yml
node scripts/check-doc-links.js .
```

Cheap checks worth adding, in order of value:

1. **`console.log` in shipped source** — a grep guard. Cheap, unambiguous,
   catches the 59-noise-per-file problem from growing.
2. **File / component length ceiling** — fails on any *new* file over the limit
   while grandfathering the known offender, so the debt cannot spread.
3. **`as any` in changed files only** — scoped so it does not fail the legacy
   count immediately.

Do not add a gate you are not willing to fix in the same PR. A red check that
is always ignored is worse than no check — it teaches everyone to skip the
output.

## Gotchas

- **Do not delete tests to get green.** `AGENTS.md` treats every test failure as
  yours, including preexisting ones. A CI run number is the only acceptable
  evidence for "this failed before I touched it."
- **Do not edit `.stryker-tmp/`.** It is a gitignored repo copy created by
  `npx stryker run`. The CLI e2e suite already had to learn to detect it by the
  absence of `.git`; see `tests/e2e/cli.spec.mjs`.
- **Do not trust `cli/package.json` for the version.** It is stamped from the
  git tag at publish time and lags by design. Use `npm view secureagentbase version`.
- **`rg`/`grep` counts are heuristics, not truth.** Verify any hit before
  acting on it — the secret-shaped hits and empty-catch hits especially.
