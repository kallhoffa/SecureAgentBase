# Production consent screen on secureagentbase.com

Google rejects production OAuth consent screens whose homepage and legal pages live on a shared-platform subdomain. `agentbase.web.app` is a Firebase Hosting default domain, which sits on the Public Suffix List; Trust & Safety requires "a verified domain that you own" and has been rejecting `*.web.app` homepages on verification submissions since 2026. The production domain is therefore **secureagentbase.com**, attached to Firebase Hosting for the `agentbase` site, with `/privacy` and `/terms` served from it.

`LEGAL_URLS` in `src/legal-urls.ts` is the single source of truth for both legal URLs and must stay on the custom domain. The `*.web.app` URLs keep working through the hosting redirect, but reviewers read the URL that appears on the consent screen, so a stale value there fails review even when the redirect resolves.

Search Console verification of secureagentbase.com is a prerequisite for branding verification, which in turn gates sensitive-scope verification for the wizard's GCP-access client (`cloud-platform`, `cloud-billing.readonly`). Staging stays on `*.web.app` in Testing mode — verification is not required for dev/staging.

**Status:** accepted

**Consequences:** any change to the production domain touches `LEGAL_URLS`, the Search Console property, both consent screens, and the Firebase Hosting custom-domain mapping. Scope justification for the review lives in [0002-sa-oauth-scope-policy.md](./0002-sa-oauth-scope-policy.md); submission tracking lives in issue #19.