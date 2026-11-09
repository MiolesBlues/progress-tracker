# ADR 0002: Idempotent workout logging operations

- Status: Accepted
- Recorded: 4 November 2026

## Context

Network retries and draft recovery can deliver a save operation more than once. Repeating an entry creation or deletion could corrupt workout history.

## Decision

Each save operation uses a stable UUID and an operation ledger. Repeating the same UUID with the same payload returns the prior result; reusing it with another payload is rejected. Tombstones retain deleted operation IDs so an old operation cannot be replayed. Similar checks apply to set operations where defined by migrations.

## Consequences

- Retries of one logical operation must retain its operation ID.
- Payload, ownership, and tombstone checks must be transactional and enforced by the database.
- New mutation types need an explicit review of retries and late delivery.

## Evidence

Migrations for `workout_entry_operations`, `workout_entry_operation_tombstones`, and `workout_entry_set_tombstones`; related Node/PGlite tests; `src/lib/pending-rpc.ts` and the save caller.
