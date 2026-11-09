# V3 acceptance on a separate Supabase project (historical plan)

> This is a plan, not permission to create a paid project, apply SQL, or use production data. Status statements below were recorded on 16 October 2026: only read-only comparison had been performed; real JWT/Auth and deletion through the hosted API were unverified. They are not current hosted status.

## 1. Confirm target and baseline

1. The owner provides a separately authorized staging project with controlled test emails A/B and no real workout data. Record project ref, URL, PostgreSQL version, Git SHA, and email/OAuth redirect settings. Do not identify the target only from `supabase/config.toml`.
2. Check frontend/server Supabase URL and publishable key. Never use service-role in a browser or put passwords/JWTs/keys in Git, reports, or traces. Permission tests use ordinary JWTs A/B.
3. Build a synthetic baseline with migrations 0000–0004 and B09/B12 **only in a new empty staging project**, or restore an authorized baseline. Before continuing, run [`release-schema-preflight.sql`](../scripts/release-schema-preflight.sql) and [`workout-privileges-preflight.sql`](../scripts/workout-privileges-preflight.sql). Compare function bodies/signatures, RLS, ACL, composite FKs, indexes, and triggers with local SQL. Do not use `drizzle-kit push`.
4. The read-only review on 16 October reported remote migrations `20261015162555_revoke_workout_truncate`, `20261015162607_guard_new_exercise_day`, and `20261015162616_restrict_workout_table_grants` already applied to the then-active ProgressTracker. Local counterparts were `20261015112617`, `20261015144732`, and `20261015144758`. Do **not** repeat them on that existing database. An empty Drizzle journal does not imply an empty schema. Remote `EXECUTE` for `authenticated` on two trigger functions differed from clean local baseline; inspect explicitly and do not grant/revoke automatically.
5. Back up staging and prove restoration to a separate empty database. Record all synthetic rows before migration, including UUIDs, `day_id/day_name`, dates, timestamps, weights, reps/RIR/notes. Compare full JSON field data and the second account, not just row counts.

## 2. Rehearse the one missing migration

After separate staging authorization, apply only [`20261015202500_archived_object_deletion.sql`](../drizzle/migrations/20261015202500_archived_object_deletion.sql) in the version containing C03 fix from `2e24e13`. Record file SHA-256. Do not use the earlier audit SQL. First check that same-named ledger/tombstone tables and RPCs do not exist; this file is not for blind reapplication.

The file contains `BEGIN`/`COMMIT`. Through the standard migration process, set `lock_timeout = '5s'` and `statement_timeout = '30s'` on the dedicated connection before running it. On timeout/error, stop, roll back the unfinished transaction, inspect catalogs, do not automatically retry or widen grants. For large synthetic history, separately measure copying original operations into the ledger and required disk space. Existing workout entries are not rewritten; do not guess original `day_id`, date, or payload for legacy NULL-day rows.

Verify:

- `delete_archived_program_day(uuid)` and `delete_archived_program_exercise(uuid)` exist, are SECURITY DEFINER with safe `search_path` and explicit `auth.uid()` checks; PUBLIC/anon EXECUTE is denied and authenticated is allowed.
- `archive_deletion_capabilities()` is read-only SECURITY INVOKER, available to authenticated, and returns true. Before migration or when RPC is missing, UI hides destructive controls even when the preference is enabled.
- `workout_entry_operations` and `workout_entry_operation_tombstones` have RLS/FORCE RLS and owner-scoped SELECT; authenticated cannot directly INSERT/UPDATE/DELETE. `record_workout_entry_operation` is not public RPC.
- Updated `save_workout_entry` and `snapshot_entry_day` match local source. B09/B12, composite RESTRICT FKs, RLS, and required SELECT/INSERT/UPDATE remain. Anon/authenticated have no TRUNCATE or direct DELETE.
- The normal migration journal records exactly this successfully applied missing migration. Rerun both preflights and separately inspect new objects.

## 3. Real Auth/JWT and deletion security

Register A/B through the app. Test empty/mismatched password confirmation before signup, email confirmation, repeated login/reload, logout, Google consent/cancel/error, and redirect allowlist. Password confirmation must not be sent in the API payload. Perform deletion tests only on synthetic staging data.

| Check                                                      | PASS criterion                                                                                             |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Anon/JWT B reads or changes A UUID or calls A's delete RPC | No foreign rows/changes; denied or empty result per contract                                               |
| Delete active day/exercise                                 | Entire operation rejected; history/program unchanged                                                       |
| Delete A's archived day                                    | Only `day_id` links become NULL; exercises, result fields, historical `day_name` preserved; B unchanged    |
| Retry original UUID after day deletion                     | Original UUID returned, one row; changed payload rejected                                                  |
| Delete A's archived exercise                               | Only selected exercise and its history removed; same-name different UUID, other exercises, and B unchanged |
| Repeat deletion / late save of deleted UUID                | Retry safe; tombstone prevents restoring deleted history                                                   |
| Two independent connections: save→delete and delete→save   | Serialized, no orphan/partial rows; rejected save retains local draft                                      |
| Moved exercise and deletion of old day                     | Current exercise `day_id` remains; old results retain original `day_name`                                  |
| Spoof detach GUC or `user_id/day_id/exercise_id`           | Cannot bypass owner/FK/snapshot checks                                                                     |
| Server commits deletion, client loses response/gets 503    | Reload/retry confirms result; only selected cache/drafts cleared; A→B leaves B data intact                 |

For lost-reply tests, use an authorized proxy that drops only the response after a real commit; do not replace the RPC with a `mockSupabase` handler. Record locks and final rows using two independent connections for concurrency. Synthetic SQL `SET ROLE` checks PostgreSQL but does not replace hosted JWT/PostgREST.

## 4. UI, devices, and release decision

Repeat [`E2E-RELEASE.md`](E2E-RELEASE.md) against real staging API: 1–7 days, editing/reorder/archive/restore, unassigned-day, entries/progress, autofill only from past dates, weights/reps/RIR, UUID retry, auto-advance on/off, date persistence, A→B→A, React Query cache, and dirty drafts.

At 320/375/390/430 px, check RU/EN, public routes without settings, Sheet/Dialog close, DnD instructions/announcements/Escape cancel, notifications, old draft (`ru-RU`/`en-GB` for display only), reload, and SSR fallback. Cookie `app_display_language` contains only the current UI hint, not a session or server-side account setting. Also check blocked cookies, two tabs, and account switching; localStorage preferences remain scoped to the account.

Physical iPhone/Safari/VoiceOver acceptance is required for system date picker, keyboard, safe area/dock/toast, modal focus, Select, touch DnD, and PWA install/standalone. Playwright WebKit is not a device substitute. Run remote CI; verify actual hosting environment and deployed SHA, SMTP/OAuth, backup restore, and Security Advisor; make a separate decision on leaked-password protection.

Public GO requires confirmed A/B Auth/JWT, deletion security, server functions, and required staging/device/hosting acceptance. Production application requires new explicit authorization and a separate window with a verified backup. This plan does not perform that work.
