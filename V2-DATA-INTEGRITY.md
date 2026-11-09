# V2 follow-up audit: Stage 1 fixes (historical report)

**Date:** 15 October 2026. **Branch:** `fix/v2-data-integrity`. **Base:** `509a88de1d6ae9b7bab7012106e628aa4f9b42fd`, the `fix/analytics-and-release` HEAD at task start. Worktree was clean and matched the full `AUDIT-V2.md` (the original audit file is not included in this repository) revision. Scope: B03, B04, and B09 TRUNCATE revocation. Other V2 issues were not fixed here. No production SQL, deployment, merge, or push; no real workout rows changed.

## Findings and fixes

| ID  | Original location                                                                         | Cause                                                                                       | Recorded result                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| B03 | `workout-form.tsx:70,93`, `queries.ts:133`                                                | `appliedLastKey` treated stale cached success as final autofill and ignored fresh response. | Exercise/date selection always checked history again. Cached preview did not fill a new form; fresh response/refetch updated untouched fields only. |
| B04 | `workout-form.tsx:49,79`, `workout-page.tsx:106,230`                                      | Old draft overrode session date and sent it back to parent.                                 | Date changed only by explicit user action. Exercise switch/auto-advance preserved session date.                                                     |
| B09 | Original audit `artifacts/production-permissions-preflight.json:55`; SQL grants 0000–0002 | Supabase/default grants gave public roles TRUNCATE, which RLS does not restrict.            | Prepared and isolated-tested revocation for PUBLIC, anon, authenticated on three tables. Production issue remained.                                 |

## Autofill and draft behavior

- Query filters remained `user_id`, `exercise_id`, and `performed_on <= selected date`; order `performed_on DESC, created_at DESC, id DESC`.
- `lastEntryQuery` used `staleTime: 0` and `refetchOnMount: "always"`; invalid/empty date did not trigger a query.
- Form applied a confirmed response only to current context after checking date/session cancellation. Dirty state protected weight, set array, and RIR independently; set count followed full reps array.
- Successful RPC cancelled in-flight last-entry queries and invalidated saved exercise's last-entry/entry keys for that user, including other date bounds. Server remained source of last-entry creation time.
- Returning after saving 8/8/7/7 loaded the new entry, not cached 8/8/7/6. Next exercise also rechecked its own history. Weight zero remained valid. Without history, existing program parameters applied but rep targets did not become completed results.
- Historical notes were not autofilled; new entry note started empty while an edited draft note was retained. UUID/immutable retry payload, double-submit guard, account boundary, and 3,000 ms toast remained. Late save did not reset another form/operation.
- Current session date stored at `workout:date:v1:<userId>` and never restored across accounts. Native input preserved DOM/focus on date changes. Only edited/pending same-date drafts auto-restored; pristine values were reloaded from history. Autofill no longer wrote a new localStorage draft.
- An edited/pending draft from another date required explicit **Open draft for …** action; it did not change current logging date until clicked. Before replacing the last draft with another date, the full object was saved under `workout:draft:v1:<userId>:<exerciseId>:<date>`. Old v1 key remained compatible; no bulk deletion/migration. New date context created a new UUID; restored pending operation retained UUID/date/payload and locked fields for safe retry. Confirmation removed only the saved operation's UUID; drafts for other dates/exercises/users remained. Failed backup did not replace the previous object.

## PostgreSQL permissions and prepared migration

A new read-only catalog query inspected the connected DB without reading user row contents. Metadata was kept outside repository at `../workout-v2-stage1-2026-10-15/permissions-before.json`. It found effective TRUNCATE for `anon` and `authenticated` on `program_days`, `program_exercises`, and `workout_entries` (six confirmed grants). No direct PUBLIC ACL on these tables or role memberships were found. `service_role` retained its own full grants.

Prepared [`20261015112617_revoke_workout_truncate.sql`](drizzle/migrations/20261015112617_revoke_workout_truncate.sql), locally named with Supabase CLI `migration new`, registered as journal index 5. It was one `REVOKE TRUNCATE` on the three explicit tables for PUBLIC, anon, authenticated. It did not change DML, `service_role`, RLS, functions, table structure, or data; it was repeatable. No separate Supabase journal was added.

Having a SQL privilege does not prove exploitability through ordinary PostgREST CRUD. PostgreSQL excludes TRUNCATE from RLS ([official docs](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)). Direct and inherited privilege behavior was checked against [Supabase troubleshooting docs](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c).

### Separate application sequence

1. Confirm target project and migrations 0000–0004; an empty Supabase migration list is not a reason to replay old migrations. Do not run `drizzle-kit push`.
2. Run [`workout-privileges-preflight.sql`](scripts/workout-privileges-preflight.sql) read-only against target. Record ACL/effective grants/membership/defaults; verify table owners and no unexpected inherited TRUNCATE.
3. Test in authorized staging with ordinary JWTs for two test users. Local check: `npm run test:db`.
4. Get separate production approval. An authorized table owner applies only the new SQL in a transaction with bounded `lock_timeout`/`statement_timeout` (example 5/30 seconds). On error, ROLLBACK; do not widen grants automatically. No backfill required.
5. Repeat read-only preflight; effective TRUNCATE must be false for anon/authenticated and PUBLIC probes. Confirm DML, service_role, RLS, and unrelated tables unchanged.

Do not run a destructive TRUNCATE probe on production, even intending to ROLLBACK. Local PGlite tests exercised grants on disposable tables.

## Checks and evidence limits

Component/API mock and PGlite checks covered fresh-history context, edited-field protection, date/draft recovery, retry IDs/payload, account isolation, and RLS/ACL scenarios. A PostgreSQL check covered tie ordering for same dates, `created_at` microseconds, UUID, and excluding future entries. Logs were under `../workout-v2-stage1-2026-10-15/`.

Mocks/PGlite did not replace real JWT/PostgREST or multi-connection concurrency. Playwright, physical iPhone/Safari, and VoiceOver were not checked. Earlier B02 release E2E remained.

## Changed files

`src/components/workout-form.tsx`, `src/components/workout-page.tsx`, `src/lib/queries.ts`, `src/lib/workout-input.ts`, `src/lib/workout-draft.ts`; related component/draft/last-entry tests; `src/test/supabase-mock.ts`; migration `20261015112617_revoke_workout_truncate.sql` and journal; `scripts/workout-privileges-preflight.sql`, `scripts/privileges-db.test.mjs`; `package.json`; `AGENTS.md`; and this report.

## Remaining risks

1. B09 remained in production pending separate approval. This minimal SQL revoked only TRUNCATE; REFERENCES/TRIGGER/MAINTAIN and other excess grants were not normalized.
2. `postgres`/`supabase_admin` default privileges could grant TRUNCATE on future tables. Changing them affects other objects/creators and needs separate review; new tables need explicit ACL normalization.
3. B01 (frozen lockfile/dependency audit), B02 (stale release E2E), and B05–B08/B10–B13 remained outside scope. Overall release verdict stayed NO-GO.
4. Real JWT, staging CRUD, production application, concurrent PostgreSQL connections, and physical iPhone were not verified.
5. localStorage has quota and can be cleared. There is no full sync or cross-tab same-draft conflict resolution. Other-date drafts have no automatic TTL so user input is not silently deleted.

Stage 2 had not started. A commit was to be separate; no push or merge was performed.
