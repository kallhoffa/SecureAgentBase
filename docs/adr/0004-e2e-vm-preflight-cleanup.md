# Pre-flight VM cleanup prevents cross-run resource leaks

Each e2e run provisions a VM named `secureagent-manager`. If a run crashes or is
cancelled before its teardown step, that VM survives and keeps billing. Because the
name is fixed, the next run's wizard hits `409 Already exists` and misreads it as a
half-created deployment, compounding the leak. In practice five orphaned VMs
accumulated across zones before this was addressed.

We added two defenses. (1) Teardown deletes the VM and treats only a `404` as
already-gone — any other response is reported as a real failure rather than
silently ignored. (2) A pre-flight cleanup step runs before the wizard e2e suite and
deletes any VM with the fixed name across all zones, so a crashed run cannot poison
the next one. This mirrors the same reasoning as the Discord channel cleanup: the
rig mutates shared, fixed-named resources, and the cleanup must be idempotent and
run on both ends.

**Status:** accepted
**Considered Options:** (a) unique VM names per run (rejected — the CLI and startup script treat the name as a fixed contract for identify/delete); (b) rely on teardown alone (rejected — teardown does not run when a job is cancelled); (c) idempotent pre-flight + hard teardown (adopted)
**Consequences:** pre-flight cleanup requires the e2e service account to hold `compute.admin` so it can list and delete instances across zones. Cleanup is best-effort; a failure warns and continues rather than blocking the run.