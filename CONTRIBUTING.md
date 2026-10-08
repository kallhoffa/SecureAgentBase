# Contributing

Thanks for looking at this project. This file is the short path to a
contributor's first merged change, and a statement of what the project will and
will not accept.

## Ground rules

- **JavaScript and JSX, not TypeScript**, for application code — except
  `cli/`, which is TypeScript. `typecheck` covers both.
- **ES modules.** Named exports for hooks and utilities; default export only for
  top-level route components.
- **CI is the source of truth.** A local pass is convenience, not proof. If your
  box behaves oddly, push a branch and let CI decide.

## Setup

```bash
npm install
npm run dev          # http://localhost:3000
```

First-time Firebase/GitHub setup is interactive and intended to be run by a
person with both CLIs authenticated:

```bash
npm run setup
```

You do not need Firebase to build, lint, or run unit tests.

## The commands

```bash
npm run check        # test:ci + lint + typecheck + build — run this before pushing
```

Or individually:

| Command | What it does |
|---|---|
| `npm run test` | unit tests, watch mode |
| `npm run test:ci` | unit tests once, with coverage |
| `npm run lint` | ESLint on `src/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | production build |
| `npm run e2e` | Playwright end-to-end |

Single test:

```bash
npm run test -- --filter "test-name-pattern"
```

Firestore rules tests need the emulator and are **not** part of `test:ci`:

```bash
npm install @firebase/rules-unit-testing@5.0.1 --legacy-peer-deps
npm run test:rules
```

CLI development lives in `cli/`:

```bash
cd cli && npm install && npm run build && npm run dev -- --help
```

## What runs on every pull request

`.github/workflows/ci.yml` runs `npm run check` plus a CLI build.
`.github/workflows/security-scan.yml` runs CodeQL, Semgrep, Trivy, the grep
guard, doc-link checking, and `npm audit` (must be 0).

All of them must pass. See `.opencode/skills/release-gate/SKILL.md` for what
gates a production release, which is stricter still.

Run the security scans locally when they are cheap to run:

```bash
npx semgrep --config=.semgrep/ .
npx trivy fs . --scanners config,secret
node scripts/check-doc-links.js .
```

## Non-negotiable rules

These are enforced by CI, not by reviewer preference. CI will fail your PR.

1. **Firestore writes go through the guardrails.** Never `setDoc`, `updateDoc`,
   `addDoc`, or `deleteDoc` outside `src/guardrails/`. Use `safeCreate`,
   `safeUpdate`, `safeDelete`, `safeSet`, `safeQuery`.
2. **Every collection gets an `ALLOW_FIELDS` constant.** Reads and writes never
   reach fields outside it.
3. **Validate user input with `validate(data, SCHEMA)` before any write.** The
   schema declares `type`, `required`, and length bounds.
4. **Every user-triggered action gets `useRateLimit`.** Minimum 5 per minute.
   This is UX, not abuse control — see `SECURITY.md` on scope.
5. **New features ship behind `useFeatureFlag`**, defaulting to off.
6. **Never `console.log` in shipped source.** The codebase currently carries
   legacy logging; do not add to it. Use `console.error` for real failures.
7. **No `as any` in new code.** Type the value.
8. **Docs move with the change they describe.** If you change a procedure,
   update its owning skill in the same commit.

## Code style

Functional components and hooks. Destructure props. Follow the
`react-hooks/exhaustive-deps` rule; put every dependency in the array, and
return a cleanup function from every effect.

```js
useEffect(() => {
  let mounted = true;
  const load = async () => {
    try {
      const data = await fetchData();
      if (mounted) setData(data);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };
  load();
  return () => { mounted = false; };
}, [dependency]);
```

Error handling: `try`/`catch` around every async call, log with a descriptive
message, set an explicit error state, never swallow silently.

Imports order: React and external libraries, then internal framework
utilities, then local components and utilities.

Naming — components `PascalCase`, hooks and utilities `camelCase` with a `use`
prefix for hooks, constants `SCREAMING_SNAKE_CASE`, contexts `PascalCase` with
a `Context` suffix.

Tests live in `src/_tests_/` with a `.test.{js,jsx,ts,tsx}` suffix and use
`@testing-library/react` and Vitest.

## Where documentation belongs

Do not add status notes to `AGENTS.md`. The precedence is documented in
`docs/README.md`, but in short:

| If you wrote… | it belongs in |
|---|---|
| code or a test | the code or test — that is ground truth for behaviour |
| a procedure, a command, a sequence | `.opencode/skills/` |
| a decision someone will question later | `docs/adr/` |
| a rule or convention | `AGENTS.md` |
| a user-facing CLI instruction | `docs/cli.md` |
| what changed, recently | `docs/CHANGELOG.md` |

Links between docs are enforced by `scripts/check-doc-links.js`, which runs in
CI. Run it before you push.

## On test failures

**Every test failure is your responsibility**, including ones you believe are
preexisting. If you break a test you fix it, and if a test was already broken
before your change you fix that too. Labeling a failure "preexisting" without a
CI run showing it existed on `main` is not acceptable — and fixing it is still
the correct response.

## Commits and pull requests

Keep messages in the conventional shape the history already uses:

```
feat(cli): guide the user through ADC login
fix(auth): run gcloud with shell on Windows
docs(release-gate): correct the release procedure
ci: fail on broken documentation references
```

A pull request should say what problem it solves and how you verified it. If
the change has a security dimension, name it. If it is a decision that a
reviewer would question, link or add an ADR.

Note that `main` currently has **no branch protection** — CI is the only gate.
Read the diff before you push.

## Reporting a security issue

See [`SECURITY.md`](./SECURITY.md). Do not open a public issue for a
vulnerability.

## License

By contributing you agree your contributions are licensed under the Apache
License 2.0 (see [`LICENSE`](./LICENSE)).
