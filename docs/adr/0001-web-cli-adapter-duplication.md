# Web and CLI GCP/GitHub adapters stay separate by design

The web wizard (`src/framework/infra-setup/api.ts`) and the VM-shipped CLI (`cli/src/lib/{gcp,github,firebase}.ts`) each own a copy of the GCP/GitHub fetch adapters. The CLI is bundled separately and deployed to customer VMs, so it cannot import from `src/`; and while the two `gcpFetch`/`gcpApiFetch` wrappers are byte-identical (~30 lines each), the operations built on them are disjoint — the web adapter is wizard-centric (OIDC pools, SA keys, Firebase apps), the CLI is VM-ops-centric (create/delete VMs, zone cleanup, serial logs). We accept the duplication rather than extract a shared package: the shared surface is small, a new shared build unit would cost more than the ~60 lines it saves, and the wrappers are frozen interfaces.

**Status:** accepted
**Considered Options:** extract a shared adapter package (rejected — separate bundles, disjoint operation sets, tiny shared surface)
**Consequences:** fixes to the wrappers must be mirrored manually. Maintenance rule: error handling / response-parsing fixes in one wrapper (e.g. the 204-no-content fix in v1.2.9) must be applied to the other in the same change, and the SA scope list must stay in sync (see ADR-0002).
