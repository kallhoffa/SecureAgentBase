---
name: secure-firestore
description: SecureAgentBase Firestore guardrails. Use when writing, updating, deleting, or querying Firestore data, adding fields to a collection, validating user input, rate-limiting a user action, or gating a feature behind a flag. Enforces safeCreate/safeUpdate/safeDelete/safeSet, validate(), ALLOW_FIELDS, ownership, useRateLimit, and useFeatureFlag.
---

# Secure Firestore (SecureAgentBase Guardrails)

This project enforces a strict guardrail layer around Firebase/Firestore. **Never use raw Firestore write methods.** All reads/writes go through the guardrail modules in `src/guardrails/`.

## Non-negotiable rules

1. **Never call `setDoc`, `updateDoc`, `addDoc`, or `deleteDoc` directly.** CI fails on any raw Firestore write found outside `src/guardrails/` (Grep Guard + Semgrep rules). Use the guardrail wrappers instead.
2. **Define an `ALLOW_FIELDS` constant for every collection** you write to. Extra fields are silently dropped — never rely on that to bypass validation.
3. **Call `validate(data, SCHEMA)` before every write with user input.** The schema must define `type`, `required`, and length constraints.
4. **Rate-limit every user-triggered action** (form submit, button click) with `useRateLimit`, minimum 5 requests/minute.
5. **Gate new features behind `useFeatureFlag(db, 'feature-name', defaultValue)`** and document the flag name in Firestore.
6. **Never read or write Firestore fields outside allowlists.**

## The guardrail API

```js
import { validate } from '../guardrails/validate';
import { safeCreate, safeUpdate, safeDelete, safeSet, safeQuery } from '../guardrails/safe-firestore';
import { useFeatureFlag } from '../guardrails/useFeatureFlag';
import { useRateLimit } from '../guardrails/useRateLimit';
```

**validate(data, schema)** — returns `null` when valid, or `{ field: errorMessage }` when not.

```js
const errors = validate(data, {
  title: { type: 'string', required: true, minLength: 1, maxLength: 200, label: 'Title' },
  email: { type: 'email', required: true },
  age: { type: 'number', min: 0, max: 150 },
  role: { oneOf: ['admin', 'user'] },
  active: { type: 'boolean' },
  url: { type: 'url' },
});
if (errors) { setError(Object.values(errors)[0]); return; }
```

**safeCreate / safeUpdate / safeDelete / safeSet** — wrap Firestore with audit stamps (`createdBy`, `updatedBy`, `createdAt`, `updatedAt`) and optional ownership enforcement. Use `safeSet` when you need a custom document ID.

```js
// Create with field allowlist (extra fields silently dropped)
await safeCreate(db, 'tasks', { title: '...', completed: false }, userId, { allowFields: ['title', 'completed'] });

// Update with ownership check (throws if createdBy !== userId)
await safeUpdate(db, 'tasks', docId, { completed: true }, userId, { allowFields: ['title', 'completed'], requireOwnership: true });

// Delete with ownership check
await safeDelete(db, 'tasks', docId, userId, { requireOwnership: true });
```

**safeQuery** — auto-filters by `createdBy`.

```js
const results = await safeQuery(db, 'tasks', userId, { maxResults: 100, sortOrder: 'desc' });
```

## Full feature pattern

```js
const SCHEMA = { title: { type: 'string', required: true, maxLength: 200 } };
const ALLOW_FIELDS = ['title', 'completed'];

const Feature = ({ db }) => {
  const { user } = useAuth();
  const rateLimit = useRateLimit('my-action', 10);
  const flagEnabled = useFeatureFlag(db, 'my-feature', false);

  const handleSubmit = async () => {
    if (!flagEnabled) { setError('Feature disabled'); return; }
    const errors = validate(data, SCHEMA);
    if (errors) { setError(errors.title); return; }
    if (!rateLimit.check()) {
      setError(`Rate limit. Try again in ${Math.ceil(rateLimit.resetIn / 1000)}s.`);
      return;
    }
    try {
      await safeCreate(db, 'collection', data, user.uid, { allowFields: ALLOW_FIELDS });
    } catch (err) {
      console.error('Failed:', err);
      setError(err.message);
    }
  };
};
```

## Rules of thumb

- Match the conventions in `AGENTS.md` — it is the source of truth for this project.
- Component responsibilities: error, success, and loading states are never optional.
- Follow the import order: React/external, internal framework utilities, local components.
- Run `npm run check` (test:ci + lint + build) before any PR.
