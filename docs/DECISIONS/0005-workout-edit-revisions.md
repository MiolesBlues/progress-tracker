# ADR 0005: Revision checks and idempotency for workout-set edits

- Status: Accepted in source; hosted rollout not confirmed
- Recorded: 5 November 2026

## Context

Creating an entry already uses an immutable operation snapshot, but row/advisory locks do not tell whether an edit from the client is fresh. A late edit or retry after a lost response could overwrite a newer change.

## Decision

Add a monotonic integer revision to each set and an `edit_workout_entry_set` RPC that accepts the expected revision and a separate operation UUID. One transaction checks owner, prior operation result, revision, and payload; existing SQL validation checks normalized fields. An exact retry returns its stored result revision without changing current sets. Reusing the same UUID with a changed payload is rejected. The older update RPC without revision is revoked from `authenticated` while remaining an internal value-validation implementation.

The UI captures the revision when the editor opens, preserves input on conflict, and does not perform blind automatic retries. For an unknown network result it retains a frozen operation in the open editor; retrying uses the same UUID and payload. This does not provide recovery of the history editor after its tab is closed.

## Consequences and release

A forward SQL migration is required. Older browser clients cannot edit sets through the prior RPC, while reads and creation remain available. Before releasing a new client, separately authorize a rehearsal and verify the installed migration/ACL. On an older hosted database, the new client must fail the edit without an unsafe fallback.

The edit ledger contains personal payload, is protected by privileges/RLS, and is removed with the entry or Auth owner. Deleting a set prevents a late retry from recreating it. Historical create snapshots do not change.

This decision covers saved sets. Program PATCH is covered by [ADR 0006](0006-program-edit-revisions.md). Account-deletion lifecycle needs its own approved contract.

## Evidence

`20261105010000_workout_set_edit_revisions.sql`, `src/lib/edit-workout-set.ts`, `HistorySetRow`, `scripts/release-integrity-db.test.mjs`, and `src/lib/edit-workout-set.test.ts`.
