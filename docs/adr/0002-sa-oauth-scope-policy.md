# Service-account OAuth scopes: one least-privilege list per role

All service-account impersonation tokens — web wizard (`src/infra-setup.tsx`, `src/framework/infra-setup/api.ts`) and CLI (`cli/src/lib/auth.ts`) — request the same least-privilege scope set: `cloud-platform`, `compute`, `devstorage.read_write`, `cloud-billing.readonly`. In v1.2.9 the web flow was narrowed from `devstorage.full_control` to `read_write`, and in v1.2.11 the CLI was narrowed to match (commit `d3bf67c`). `read_write` (not `full_control`) because the SA key only uploads/overwrites the app bundle in GCS — it never lists or deletes buckets — so `full_control` was unnecessary blast radius if a key ever leaks. The user-facing consent screen is a separate, narrower surface (only `cloud-platform` + `cloud-billing.readonly`), and SA impersonation tokens never appear on a consent screen.

**Status:** accepted
**Consequences:** any future GCS delete operation in the CLI would need an explicit, documented scope escalation. Keep the web and CLI scope arrays identical; a diff between them is a bug. This single documented policy answers "which scope did we ship?" during the Google OAuth in-depth assessment.
