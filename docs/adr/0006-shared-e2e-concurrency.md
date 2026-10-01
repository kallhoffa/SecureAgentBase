# Publish job and release gate share one concurrency group

The staging deploy workflow and the production gate workflow both run the staging e2e
rig against shared, mutable resources: the staging Firebase project, the e2e GCP
project, the fixed VM name `secureagent-manager`, and the shared GitHub repo
`kallhoffa/agentbase-testing`. They previously used separate concurrency groups
(`staging-deploy` and `production-deploy`), so a push-to-main deploy and a tag gate
could run in parallel and fight over those resources — duplicate-deploy 409s, a VM
deleted mid-run, or a re-initialized repo.

We unified both workflows under the single group `secureagentbase-e2e` with
`cancel-in-progress: false`. Concurrent runs now queue instead of racing. Cancelling
is not an option because the group also guards the production promote job — a newer
push must never abort a production deploy.

**Status:** accepted
**Considered Options:** (a) keep separate groups (rejected — allows the races above); (b) shared group with `cancel-in-progress: true` (rejected — a newer push would cancel an in-flight production promote); (c) shared group, queue, never cancel (adopted)
**Consequences:** a tag gate waits behind any in-flight staging deploy and vice
versa. Pushes to main during a long gate queue rather than run concurrently, trading
latency for correctness.