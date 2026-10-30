/**
 * Legal page URLs — the canonical addresses to wire into both Google OAuth
 * consent screens (Google Auth Platform console, operator-side). Both the
 * Firebase Auth Google sign-in client and the wizard's GCP-access client
 * require a privacy policy URL and a terms-of-service URL to reach production
 * (verified) status.
 *
 * Where to wire them (issue #25 checklist):
 *  1. Firebase sign-in client (app login):
 *     Google Auth Platform console → Clients → the Firebase sign-in client →
 *     set the privacy policy + terms URLs to the values below → save.
 *  2. Wizard GCP-access client (infra-setup; scopes cloud-platform +
 *     cloud-billing.readonly):
 *     GCP console (project agentbase-8c022) → APIs & Services → OAuth consent
 *     screen → set both URLs → save.
 *
 * These must stay on the custom domain: Google rejects production consent
 * screens whose legal pages live on a shared-platform subdomain, and
 * `agentbase.web.app` is on the Public Suffix List. The `*.web.app` URLs keep
 * working through the hosting redirect, but reviewers read the URL on the
 * consent screen, so a stale value fails review even when the redirect
 * resolves. See docs/adr/0007-custom-domain-secureagentbase-com.md.
 */
export const LEGAL_URLS = {
  privacyPolicy: 'https://secureagentbase.com/privacy',
  termsOfService: 'https://secureagentbase.com/terms',
} as const;
