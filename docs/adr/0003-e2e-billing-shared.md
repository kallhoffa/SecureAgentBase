# E2E suites share a billing account; nothing unlinks it

The Full Wizard e2e suite and the CLI e2e suite both provision VMs and both need a
GCP project with billing attached. We originally unlinked billing in the e2e
teardown to leave the shared test project clean. That broke the second suite: with
billing removed, the CLI's `isBillingEnabled` check returned false and the CLI
skipped Step 4, so the CLI e2e run failed at Step 5 with `BILLING_DISABLED`. Worse,
teardown unlinking turned the two suites into a zero-sum resource: whichever suite
ran second could not provision at all.

We now never unlink billing from the shared e2e project. VM deletion is the only
real cost driver (a stopped VM still bills, so we delete it in teardown), and the
billing account attachment itself is idempotent and shared by design.

**Status:** accepted
**Considered Options:** (a) unlink billing in teardown (rejected — breaks the second suite, creates a zero-sum resource); (b) separate billing projects per suite (rejected — doubles the e2e GCP setup for no isolation benefit, since the conflict is the shared project not the billing account); (c) keep billing attached, delete VMs (adopted)
**Consequences:** the e2e GCP project retains a billing account permanently. The `BILLING_ACCOUNT` CLI env override remains a real flag for projects whose billing is *not* already attached. Cost control relies on VM teardown (including the pre-flight cleanup that removes orphaned `secureagent-manager` VMs across zones), not on unlinking.