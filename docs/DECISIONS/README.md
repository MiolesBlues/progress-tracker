# Architecture decision records

This directory contains ADRs: recorded decisions that affect architecture, data security, or project workflow.

Each ADR includes context, decision, consequences, and supporting repository evidence. An `Accepted` status means the decision reflects the code or an explicitly approved project policy; it does not confirm hosted-service state.

Number ADRs sequentially (`0001-...md`). Preserve the history of an accepted decision: when it changes, add a new ADR, mark the previous one superseded, and link to its replacement. Significant changes to the data model, security boundaries, API, runtime/deployment, or development policy need an ADR; minor documentation corrections do not.

## Decisions

- [0001 — PostgreSQL-enforced user data isolation](0001-postgresql-user-isolation.md)
- [0002 — Idempotent workout logging operations](0002-idempotent-workout-operations.md)
- [0003 — Per-set records with a compatible historical snapshot](0003-workout-sets-and-legacy-snapshot.md)
- [0004 — Short-lived topic branches and SHA-specific CI checks](0004-branching-and-ci-policy.md)
- [0005 — Revision checks and idempotency for workout-set edits](0005-workout-edit-revisions.md)
- [0006 — Compare-and-swap for program edits](0006-program-edit-revisions.md)
- [0007 — Approval-gated agent workflow](0007-approval-gated-agent-workflow.md)
