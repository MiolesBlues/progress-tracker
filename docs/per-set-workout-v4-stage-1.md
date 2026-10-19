# ProgressTracker V4 — Stage 1: database model and persistence

## Source audit

Audited the current integration branch at `9a1b13d` before editing. The source of truth is `drizzle/migrations/` and its Drizzle journal; the Supabase migration directory is not a competing history. The audit covered `workout_entries`, `workout_entry_operations`, `workout_entry_operation_tombstones`, `save_workout_entry`, workout drafts, prefill queries, history queries, analytics, and the current database tests.

Confirmed invariants:

- `workout_entries.id` is both the stable entry UUID and the legacy save-operation UUID.
- `save_workout_entry` and `workout_entry_operations` freeze the original legacy payload; tombstones prevent a deleted exercise's entry UUID from being replayed.
- Entry owner, exercise, day and date snapshots are immutable. Archived-day deletion is the only approved exception for detaching `day_id`.
- Numeric precision is validated in PostgreSQL without storing weight as a floating-point type. Existing rows may predate current checks, so migrations must preserve them rather than rewrite them.
- The application currently reads one `weight`, `rir`, and an ordered `reps` array from `workout_entries`; drafts are user/exercise/date scoped and persist a frozen operation before network I/O.

## Adopted transition model

`public.workout_entry_sets` is the authoritative per-set child table. It stores a stable UUID, owning entry/user, one-based position, exact PostgreSQL `numeric` weight, integer reps, nullable numeric RIR, `working`/`warmup` set type, and `external`/`bodyweight` load mode. Bodyweight entries describe external added load: zero means no added load; legacy zeroes are not reclassified because their intent cannot be inferred.

Historical sets receive deterministic IDs derived from `(workout_entry_id, position)`. Backfill copies source values in array order, including `NULL` RIR and historical rows with a detached day. Parent rows, dates, owner links, and prior operation payload columns are not modified. Legacy rows are marked as snapshots so any pre-existing out-of-range value can be preserved; all new payloads pass strict validation before insertion.

For old clients, `workout_entries.weight/reps/rir` remain a compatibility snapshot and the existing RPC remains unchanged. A trigger converts each old one-weight save into same-weight working sets. New per-set saves write the parent compatibility snapshot, child rows, and immutable operation snapshot in one transaction. The compatibility snapshot uses the first entered set's weight, ordered reps, and a single RIR only when every set has the same RIR; otherwise its legacy RIR is `NULL`. New clients must read the set table for exact values.

Authenticated clients can read only owner-scoped set rows. Table writes are revoked; owner-checked RPCs perform atomic save, add, edit, delete and reorder operations. Per-set retries retain the original JSON snapshot, even after later set edits, so a lost response cannot overwrite newer values. Deleted set IDs are tombstoned, the last set cannot be removed, and order remains contiguous.

Draft format v2 is stored under a versioned key in the existing draft module. Legacy v1 drafts and their pending legacy operation IDs remain readable by the existing code path; exercise deletion cleans both versions. No logger UI was switched in this stage.

## Migration and rollback

Migration: `drizzle/migrations/20261016204330_per_set_workout_v4.sql`, journal index 10. It is additive: new child/tombstone tables, one redundant composite unique key for the ownership FK, one nullable set snapshot column on the existing operation table, a data backfill, triggers and owner-checked RPCs. It does not drop or rewrite legacy columns or user records.

Application rollback to a legacy frontend is safe: the old RPC and compatibility columns remain operational, while per-set data stays in the additive table. Do **not** roll back by dropping the set table or snapshot column after any V4 write; that would destroy information not representable by the legacy columns. A database rollback after V4 writes requires restoring/retaining those set rows and is not currently a destructive-down-migration candidate.

No production or staging connection was used. The migration was applied only to isolated PGlite test databases.

## Verification

The dedicated database tests create a synthetic pre-migration history, apply the existing journal through the training-template migration and then V4, and verify exact preservation, deterministic/idempotent backfill, nullable RIR, variable per-set values, stable retries, legacy RPC compatibility, atomic failures, set add/edit/delete/reorder, and two-user/anon access rules. They are in `scripts/per-set-workout-db.test.mjs` and run through `bun run test:db`.

Results on the isolated integration worktree:

- TypeScript, ESLint, Prettier, production build, dependency contract, and dependency audit: PASS.
- Unit tests: 257 passed across 24 files.
- SQL/database tests: 57 passed, including 7 per-set tests.
- Toolchain tests: 6 passed.
- A separate PostgreSQL 18.6 temporary local cluster (not staging or production) was used for two simultaneous database sessions with the same frozen save operation: both calls succeeded and produced exactly one parent entry and two child sets. The temporary cluster was stopped after the test.
- Staging: not tested in this stage; no staging or production credentials/data were used.

Stage 2 may begin from this commit. No application screen was changed in Stage 1.
