# V2 acceptance against real Supabase (historical plan)

> This plan does not authorize production writes. A read-only review on 16 October 2026 reported B09/B12 already applied; do not repeat the listed protection migrations against that existing project. The later plan for pending deletion SQL is [STAGING-V3.md](STAGING-V3.md). Only read-only hosted checks had been performed at the time. Local PGlite/PostgreSQL and mocked HTTP are not substitutes for the checks below.

## 1. Record environment and baseline

1. The owner provides a separate test project with no real workout data and explicitly confirms its purpose. Record project ref, URL, PostgreSQL version, Git SHA, browser, and time. Do not identify the target from local CLI `project_id` alone.
2. Verify frontend/server URL and publishable key match. Secret/service-role keys are allowed only in trusted server environments, never `VITE`, browser, trace, or Git. Do not put test-user JWTs/passwords in reports.
3. Run [`release-schema-preflight.sql`](../scripts/release-schema-preflight.sql) and [`workout-privileges-preflight.sql`](../scripts/workout-privileges-preflight.sql) as READ ONLY transactions. They return catalogs and violation flags without exporting workout rows.
4. Compare columns/nullability, CHECKs, owner FKs, indexes, RLS/policies, triggers, and four RPC arguments/defaults/returns with SQL and `src/integrations/supabase/types.ts`. RPCs should be SECURITY INVOKER; anon EXECUTE denied, authenticated allowed. Confirm no old signup auto-seed trigger.
5. Compare `drizzle/migrations/meta/_journal.json` with actual catalogs and the target DB journal. An empty Supabase migration list does not mean an empty schema. Do **not** rerun 0002 or use `drizzle-kit push`. The review reported eight function bodies in the then-current remote baseline matching 0000–0004; that did not prove the three newer files were applied.

## 2. Rehearse prepared migrations

On approved staging, first take a backup and prove restoration into another empty project/database. Apply only verified missing files, in journal order:

- `20261015112617_revoke_workout_truncate.sql` — Stage 1, revoke TRUNCATE.
- `20261015144732_guard_new_exercise_day.sql` — Stage 3, atomically require an active day when creating an exercise.
- `20261015144758_restrict_workout_table_grants.sql` — Stage 3, allow authenticated SELECT/INSERT/UPDATE on three tables only; deny PUBLIC/anon; leave `service_role` unchanged.

Apply each file transactionally with bounded `lock_timeout`/`statement_timeout` (for example 5/30 seconds). On error, ROLLBACK and investigate; do not automatically grant extra permissions. Compare history, RLS, `service_role`, and required operations before/after. These files do not rewrite rows and are repeatable. Do not automatically repair existing NULL `day_id` or `NOT VALID` CHECK violations.

Repeat both preflights. PUBLIC/anon/authenticated should not have TRUNCATE/REFERENCES/TRIGGER/MAINTAIN; authenticated has SELECT/INSERT/UPDATE, not DELETE. Test direct SQL under each role, including PUBLIC via a role probe; TRUNCATE must produce permission denied **only on synthetic staging tables**. Never run destructive production probes even if intending to ROLLBACK.

Separately assess owner default privileges for `postgres`/`supabase_admin`, inheritance, and service integrations. Prepared SQL deliberately limits changes to three existing tables; creator-wide defaults could affect other objects. Normalize ACL and enable RLS explicitly for new tables. TRUNCATE permission alone does not prove an ordinary PostgREST HTTP CRUD exploit; see [PostgreSQL row-security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## 3. Real Auth and two-user JWT checks

Register A/B with separate controlled addresses, confirm emails, sign in, reload, and sign out. Check redirects, error/loading/empty states, and recovery. Use ordinary JWTs, never service-role in the browser. Verify cross-user SELECT/INSERT/UPDATE/RPC isolation, owner spoofing rejection, access of anon, signup without automatic program creation, and expected behavior of each of four RPCs. Error codes can vary by SDK/PostgREST layer; PASS requires no foreign/partial changes, expected SQLSTATE where exposed, and useful UI errors. A successful HTTP response with an empty read is not proof that UPDATE succeeded.

For save idempotency: same UUID/same payload returns the same UUID and one row; same UUID/different payload or JWT B is rejected without changing the original; a new UUID for the same exercise/date is a separate session; anon cannot access data or the four RPCs.

## 4. User flows and concurrent connections

- Registration → confirmation → onboarding → personal days; signing in again does not recreate a program.
- Create/rename/reorder/archive/restore days/exercises. Selected UUID is isolated by account and changes when selecting an archived day. Empty/long inputs remain after errors.
- Workout example: 50 kg, 8/8/7/6, RIR 2; change last set to 7, save, expect ~3-second toast, then the next exercise's history; return to first and see 8/8/7/7. Date persists, future entry is not autofilled, and late response does not overwrite dirty fields.
- Lose response after commit → retry/reload → one UUID/row. INSERT error retains all values.
- Records: day/exercise, archive and unassigned day, today/7/30/all, tied weights, multiple sessions per day; UI pages 20 rows and server pagination remains complete with `maxRows` below page size.
- Progress: selected session, independent prior session and calendar week, weight/reps/volume, zero baseline, RIR/sets, both date bounds, and no future records.
- Two authenticated SQL connections: archive-day owner lock makes INSERT wait then fail; INSERT lock makes archive wait for create commit; simultaneous retry of one UUID yields one row; setup/eighth-day/reorder has no partial result. Use the staging PostgreSQL version, not only local 18.6.

## 5. Backup, restore, and release

The owner checks managed backup/PITR availability and age, plan/retention, encryption, and access restrictions. Restore into a **separate empty test project** and compare row counts/hashes for three tables, FK/CHECK, RLS/ACL, functions/triggers, indexes, and journal. Verify the supported Supabase Auth restore procedure and test-account login separately. A local synthetic `pg_dump` is not equivalent. See [Supabase backup docs](https://supabase.com/docs/guides/platform/backups).

On a physical iPhone, check Safari/VoiceOver, keyboard, safe area, PWA, long names, and native date input. Playwright Chromium/WebKit at 320/375/390/430 px is additional evidence, not a device substitute. Repeat R1 observation with a slow API and weight before/after reload.

Before publication, separately verify hosting runtime/environment, HTTPS/headers, redirects, and that the selected Supabase project is unchanged. The recorded Security Advisor warned that leaked password protection was disabled; assess/approve the setting using [Supabase Auth documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No configuration change is automatic.

Acceptance records SHA, migration versions, anonymized PASS/FAIL/NOT RUN results, and artifact links. Without critical real JWT checks, backup restore, and separate authorization for production grants/B12, the recorded decision was NO-GO. Production changes, merge, push, and deployment require separate owner action.
