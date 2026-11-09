# ADR 0003: Per-set records with a compatible historical snapshot

- Status: Accepted
- Recorded: 4 November 2026

## Context

The earlier model stored one aggregated weight/reps/RIR set of fields on each workout entry. Real workouts need multiple typed sets while preserving existing history.

## Decision

Store every set in `workout_entry_sets` with position, `working`/`warmup` type, load type, and optional RIR. Keep legacy entry fields for compatibility and migrate previous values into deterministic legacy snapshot sets. Use the `day_name` snapshot to display the historical training day.

## Consequences

- The schema/server validates set order and position range.
- Metrics must account for legacy and new data without inventing working sets.
- RIR is distinct from RPE; do not assume an RPE field exists.
- After the forward legacy-write migration, browser roles cannot update the original weight/reps/RIR entry fields. Set changes use their separate path; the gate distinguishes current sets from the original snapshot. Metadata updates and create/retry remain compatible. Hosted migration status requires separate verification.

## Evidence

Migrations for `workout_entries` and `workout_entry_sets`; `src/lib/analytics.ts`, `src/lib/workout.ts`, workout editor UI, and PGlite migration tests.
