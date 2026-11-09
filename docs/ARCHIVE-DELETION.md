# Deleting archived days and exercises (historical release guidance)

> The deployment statements below come from a read-only review on 16 October 2026. They are historical and do not establish the current hosted schema or release state. Verify hosted state separately before relying on them.

At the time, migration `drizzle/migrations/20261015202500_archived_object_deletion.sql` was prepared but had not been applied to production. The 16 October read-only review found no deletion RPC, capability probe, or ledger/tombstone tables. Delete buttons were available only when the server capability probe succeeded and the user enabled **Allow permanent deletion**; a missing function or failed probe hid them. A separate setting controlled whether archived days and exercises appeared in **Records**. Both settings were account-local and initially off; neither replaced server-side ownership checks. The report then identified [STAGING-V3.md](STAGING-V3.md) as the acceptance plan and one remaining migration.

Deleting an archived day detaches its exercises and workout entries (`day_id = NULL`) while preserving exercises, all results, and historical `day_name`. Exercises without a day are available in **Program** for manual assignment to an active day and, when archive display is enabled, in **Records**. Permanently deleting an archived exercise irreversibly deletes only its own workout entries. The RPCs reject active or foreign objects. Both RPCs run in one PostgreSQL transaction and hold an owner lock shared with workout saves.

## Checklist recorded for separate migration approval

1. Identify staging and production databases; verify migrations `0004`, B09, and B12 against the database catalog. Check `day_id` types, composite foreign keys, and `snapshot_entry_day`.
2. Create and verify a restorable backup. Perform a read-only inventory of archived days/exercises, related exercises and entries, and rows with `NULL day_id`. Do not repair these rows automatically.
3. Apply the migration first to a separate PostgreSQL copy or staging environment with test accounts. Check `pg_proc.prosecdef`, `proconfig`, `has_function_privilege` for `PUBLIC`, `anon`, and `authenticated`, plus table `DELETE` grants. Confirm `service_role` and RLS are unchanged.
4. With real test JWTs, verify rejection of foreign/active IDs; deletion of an archived day while preserving all history fields, `day_name`, and exercises; deletion of an archived exercise with only its own entries; repeated calls; and a concurrent save/delete. Then verify **Records** and **Progress** reads.
5. Only after separate production authorization, schedule a window, apply SQL through the standard migration process, and repeat a read-only review of functions, grants, and counts. Do not run `drizzle-kit push` or blindly replay old migrations.

Local checks used PGlite, isolated native PostgreSQL, and Playwright HTTP mocks. They did not verify real JWT/PostgREST behavior, backup restoration, or hosted staging transaction concurrency. If deletion RPCs are unavailable, the capability gate hides deletion; that is a compatibility guard, not proof that production deletion is ready.
