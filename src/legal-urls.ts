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
 * These point at the currently hosted pages. Once the custom domain lands
 * (issue #26), update the values once here and in both consoles — the hosting
 * redirect keeps the *.web.app URLs working in the meantime.
 */
export const LEGAL_URLS = {
  privacyPolicy: 'https://agentbase.web.app/privacy',
  termsOfService: 'https://agentbase.web.app/terms',
} as const;
