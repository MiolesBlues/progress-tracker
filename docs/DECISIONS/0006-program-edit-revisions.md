# ADR 0006: Compare-and-swap for program edits

- Status: Accepted in source; hosted rollout not confirmed
- Recorded: 5 November 2026

## Context

Ordinary PATCH requests for days and exercises had no freshness indicator. Row locking serialized changes but still allowed a stale form to overwrite a newer edit. ADR 0005 remains a separate decision for workout sets.

## Decision and consequences

Forward migration `20261105030000_program_edit_revisions.sql` adds revisions to days and exercises. Browser PATCH sends `revision=base+1`, filters on the base revision, and checks confirmed IDs/revisions. A trigger compares the proposed revision with the current row and rejects semantic updates without CAS (SQLSTATE 40001), preventing an old direct PATCH from bypassing the client predicate. All updates increment the revision. Position-only reorder remains available through the older invoker RPC and also increments revisions; trusted definer maintenance operations continue to work. RLS and owner constraints are unchanged.

Editors capture the revision when opened and preserve input on conflict/refetch; they do not automatically substitute the new revision. Moving an exercise in another window does not remount the editor. A day-rename draft is keyed by ID even if the day is archived. To review a newer version, explicitly close/cancel and reopen the editor. Drafts exist only in the mounted component and are not restored after leaving the page.

Program PATCH does not use a new operation ledger: it is a conditional replacement, not a composite creation. If the response is lost, retrying with the original base revision safely produces a conflict or zero updated rows and cannot change a newer version. That does not prove the outcome of the earlier request; inspect the updated row. There is no automatic rebase/retry. Workout operation-ledger and create-retry behavior is unchanged.

A coordinated hosted schema/client update is required. Older program clients without revisions lose semantic updates while reads, creation, and reorder remain. This incompatibility closes an unsafe write path. Until the migration is installed, the new client must not use a fallback. Account deletion remains a separate product decision.

## Evidence

`20261105030000_program_edit_revisions.sql`, `src/components/program-manager.tsx`, `src/lib/queries.ts`, `scripts/release-integrity-db.test.mjs`, `scripts/postgres-concurrency.test.mjs`, and `src/components/program-manager.test.tsx`.
