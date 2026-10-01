# Wizard Development Notes

Internal notes for the SecureAgentBase wizard development team — GCP propagation
quirks and debugging detail that is not part of the user-facing product.

These are not user-project docs. Nothing in the build strips this file; it is
simply wizard-specific, so keep it that way. If a note here is needed to run the
product, it belongs in `docs/cli.md` or `.opencode/skills/infra-setup/SKILL.md`
instead.

For how to apply these (rather than what they are), see
`.opencode/skills/infra-setup/SKILL.md`. For the decisions behind them, see
`docs/adr/README.md`.

**Verify before trusting.** These describe external GCP behaviour that shifts.
Each claim below was last checked against the code on 2026-10-01.

## GCP Cloud Billing API consumer-project mismatch

The `403 SERVICE_DISABLED` error from `cloudbilling.googleapis.com` references
the OAuth client's own project as the **consumer**, not the wizard's target
project. Enabling the API on the target project via Service Usage flips that
project to `ENABLED`, but billing calls are still billed to the OAuth client's
project — which never had the API enabled — so it stays `SERVICE_DISABLED`
indefinitely. This is **not** propagation; it persists for days.

The fix is the `x-goog-user-project` header, set to the target project ID, which
overrides the consumer project so the service-enabled check runs against the
project where we actually enabled the API. It is on every `cloudbilling` call in
`src/infra-setup.tsx`.

Reference: <https://cloud.google.com/apis/docs/system-parameters#specifying_a_project_for_billing_and_quota>

## OAuth scope alone does not guarantee Cloud Billing access

Granting `cloud-billing.readonly` and `cloud-platform` scopes is necessary but
not sufficient. During a service-enablement propagation window, `GET
/v1/billingAccounts` and `GET /v1/projects/{project}/billingInfo` still 403, so
the wizard cannot enumerate accounts even though the user is signed in. The
scope list itself is settled in `docs/adr/0002-sa-oauth-scope-policy.md`; this
note is about the *timing*, not the list.

## Service-account impersonation, not key signing

**Superseded — do not reintroduce key signing.** Earlier versions of the web flow
downloaded the service-account JSON key and signed a JWT assertion locally
(`signJwtAssertion`, then exchanged it for a token) to work around IAM
propagation delays on Firebase Management API calls. That is gone.

`getServiceAccountToken` now impersonates via the IAM Credentials API
(`generateAccessToken` on the agent SA), so **no SA key is ever downloaded,
held, or signed with** in the browser. When there is no agent SA to impersonate
(the e2e auto-OIDC flow never creates one), it falls back to the operator's own
OAuth token, which already carries `cloud-platform` scope.

The reason to keep this note: the old approach still reads as a reasonable fix
in a git blame, and it silently reintroduces browser-side key handling — a real
security regression, not a style preference.

## Service-account creation race condition

`createDeployServiceAccount` may receive a 409 from POST and then immediately
fail a GET for the existing SA because creation has not propagated. The
implementation catches the failed GET, logs `SA not found after conflict,
retrying creation...`, and retries POST.

## Service-account IAM propagation delay

`grantFirebaseRoles` may fail with "SA does not exist" when the IAM policy is
set before SA creation has propagated. It retries the IAM policy update up to 6
attempts with delays.

## Identity Toolkit / OAuth client ID discovery

Step 5 may 404 from the Identity Toolkit API even after enabling it via Service
Usage, because no config exists yet. The implementation retries 6 times with 5s
delays, creating the config on first 404 by enabling email/password sign-in, and
returns `null` if the OAuth client ID never appears.

Discovery is a **best-effort convenience**. A `null` return means the user must
configure Firebase Authentication manually in the GCP console — it is not a
failure of the wizard.
