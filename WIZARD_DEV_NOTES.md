# Wizard Development Notes

This file is for the SecureAgentBase wizard development team. It is stripped out when the template is cloned into a user project, so it can contain internal debugging notes, propagation quirks, and implementation details that should not appear in user-facing documentation.

## GCP Cloud Billing API propagation quirk

Enabling `cloudbilling.googleapis.com` via the Service Usage API can report `state: ENABLED` while the Cloud Billing API backend still rejects every request with `403 SERVICE_DISABLED`. This is not an OAuth scope or IAM issue: the same token works for Cloud Resource Manager and Service Usage, and service-account tokens fail identically. The fix is to wait longer after enablement (60–120s) or provide a manual fallback so users can paste their billing account name.

## OAuth scope alone does not guarantee Cloud Billing API access

Granting `cloud-billing.readonly` and `cloud-platform` scopes is necessary but not sufficient. If the target project’s Cloud Billing API is in the SERVICE_DISABLED propagation window, `GET /v1/billingAccounts` and `GET /v1/projects/{project}/billingInfo` will still 403, so the wizard cannot enumerate accounts even though the user is signed in.

## Service-account JWT assertion signing for Firebase admin

When a user’s OAuth token lacks `roles/firebase.admin` after IAM grants, sign a JWT assertion with the downloaded service-account JSON key using the Web Crypto API (`signJwtAssertion`), exchange it for an access token (`generateFirebaseSaToken`), and use that token for Firebase Management API calls. This bypasses IAM propagation delays and permission issues tied to the user token.

## Service-account creation race condition

`createDeployServiceAccount` may receive a 409 from POST and then immediately fail a GET for the existing SA because creation has not propagated. Catch the GET failure, wait a few seconds, and retry POST creation.

## Service-account IAM propagation delay

`grantFirebaseRoles` may fail with "SA does not exist" when the IAM policy is set before SA creation has propagated. Retry the IAM policy update several times with delays until it succeeds.

## Identity Toolkit / OAuth client ID discovery

Step 5 may return 404 from the Identity Toolkit API even after enabling it via Service Usage API. The OAuth discovery flow (`discoveryUrl` → `oauthClientId`) is a best-effort convenience and may require manual Firebase Authentication configuration in the GCP console.
