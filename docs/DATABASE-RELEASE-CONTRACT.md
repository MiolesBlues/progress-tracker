# Database schema and release contract

> Hosted Supabase statements in earlier versions of this guide were read-only snapshots and may be stale. This document describes repository release requirements. It does not claim the current hosted schema, ACLs, or applied migrations; verify those separately for a release.

## Migration ownership

- The canonical schema source is the manually maintained SQL in `drizzle/migrations/`, including baseline `0000`–`0004` and feature migrations.
- `drizzle/schema.ts` and Drizzle snapshots are empty/incomplete. Do not use `drizzle-kit push` or generate DDL from them.
- The complete ordered list is `drizzle/canonical-manifest.json` (SHA-256 of UTF-8 SQL after CRLF→LF normalization). `scripts/canonical-migrations.mjs` checks every SQL file, order, checksum, and `_journal.json`; fresh/legacy-upgrade PGlite tests use the same list, including both ACL migrations. Historical subset tests may explicitly omit migrations to model an older state.
- `migrations/meta` is reserved for Drizzle snapshots/journal. Canonical inventory stays outside it because `drizzle-kit check` otherwise tries to parse it as a snapshot.
- The journal includes two previously missing ACL entries with original calendar timestamps. Existing SQL and timestamps were not rewritten. This repairs local inventory; it does not instruct a remote migration.
- Each forward migration needs ordering, owner/ACL/RLS checks, idempotency/rollback analysis, bounded lock/statement timeouts, and a specific compatibility contract. Do not repair legacy rows automatically as a side effect of changing constraints.

## Hosted release controls

Before a hosted operation, identify the target through project metadata/ref and URL; do not rely on local `project_id` alone. Use the current Supabase CLI safeguards and explicitly identify local versus remote. Supabase CLI v3 is local-by-default; hosted operations require explicit remote targeting. Never run `drizzle-kit push`.

Use a least-privilege credential, read-only preflight, approved restorable backup, disposable staging rehearsal, exact migration review/checksum, and post-migration preflight. Hosted schema/config changes and production access require separate explicit authorization. A source SQL file, local PGlite pass, or migration journal entry alone does not prove hosted application. Do not run migrations from ordinary development or CI workflows.

Supabase's current Data API exposure model has changed: newly created tables are not automatically exposed to the Data/GraphQL APIs; existing-project enforcement also changed on 30 October 2026. Confirm explicit grants/API exposure as well as RLS before relying on access. Follow the current [Supabase CLI v3 changelog](https://supabase.com/changelog/supabase-cli-v3) and [Data API table exposure changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) when preparing a release.

## Local schema capability contract

`scripts/schema-capability-contract.json` describes required objects, RPC signatures, and privileges. Compare actual functions, arguments/defaults/returns, RLS, policies, ACLs, composite FKs, indexes, triggers, and migration journal against migration SQL and `src/integrations/supabase/types.ts`. Do not infer compatibility from matching timestamps: compare capability objects and definitions.

`anon` should not receive user-data access or protected RPC execution. `authenticated` receives only the grants required by the client. SECURITY DEFINER functions must validate `auth.uid()`, use a safe `search_path`, and have narrowly scoped EXECUTE grants. Default privileges must be reviewed for every object owner, including inherited/creator roles; table-level REVOKE does not necessarily constrain future objects. Check effective privileges, not only direct ACL rows. Avoid destructive permission probes on production.

Environment guards and local preflight are not database credentials. `RELEASE_DATABASE_URL` is a distinct, approved least-privilege input for a read-only release preflight; it must not be printed, passed to setup/install jobs, or populated with production credentials for routine tests. `supabase/config.toml` intentionally avoids selecting a hosted project by default.

## Workout history integrity gate

`workout_entry_operations.set_snapshot` stores the original create payload; `workout_entry_sets` stores the current editable state. Legacy `workout_entries.weight/reps/rir` preserve the compatible original result and are not recalculated by set-edit RPCs. The release gate therefore does not require current sets to equal the legacy reps array.

Read-only assertions are in `scripts/workout-integrity-preflight.sql`; `scripts/release-integrity-db.test.mjs` runs the same SQL in PGlite. Checks cover:

- Structure, unique IDs, original positions, operation-snapshot agreement with original weight/reps/RIR, and legacy entry fields matching the original ledger.
- One to twenty current sets, owner, consecutive positions, and new-value constraints.
- Unchanged legacy sets (`legacy_snapshot=true`) matched by stable ID and values, without requiring the original position.
- Each original set either remains or has a tombstone for the same owner and entry; deleted IDs are absent from current sets.

Older entries with `day_id=NULL` and no initial ledger are checked against a deterministic legacy snapshot from saved entry fields; the gate does not invent an operation payload. Valid edits/reorders/confirmed deletions pass. Missing sets, ownership/order violations, or corrupted available source evidence block release. Object, RLS, and ACL checks remain separate.

This checks internal contracts; it is not cryptographic proof that history has not changed. Coordinated privileged changes to all sources cannot be detected without an independent backup. Mutable sets are not restored from snapshots automatically, and old rows without a ledger have weaker independent verification of their original fields.

## Legacy workout write contract

Forward migration `20261105020000_legacy_workout_write_contract.sql` prevents `authenticated`/`anon` from directly updating `workout_entries.weight/reps/rir`. Those fields remain the compatible original result; authoritative sets are edited through the revision-checking RPC. No-op metric updates, metadata updates, and older create/retry behavior remain. Owner protection and day snapshot behavior are unchanged.

The gate requires the BEFORE UPDATE guards for set revisions and legacy metrics to be enabled. Presence of SQL does not prove hosted application. The remediation prepared and checked the migration locally; hosted application requires separate authorization and rehearsal. Older clients that edit legacy metrics must move to the per-set API. Privileged PostgreSQL maintenance remains outside the browser trust boundary; this trigger does not protect against an administrator.

Existing backup/restore reports did not establish full recoverability: the backup report was `BACKUP NOT VERIFIED`, the restore report `RESTORE NOT VERIFIED`, and Storage bytes were not checked separately. Local PGlite tests do not replace restore rehearsal.
