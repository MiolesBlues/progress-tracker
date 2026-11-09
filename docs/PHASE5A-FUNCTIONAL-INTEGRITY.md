# Phase 5A — Functional integrity (historical report)

## PT-07: Creating program items

Each day and exercise received a UUID and immutable payload before its first INSERT. A pending operation was stored in localStorage scoped by user and object type. After an ambiguous response, the UI preserved the form and retried with the same UUID/payload, including after remount. INSERT used the existing UUID primary key. After a duplicate/error, the client read only an object whose `id` and `user_id` matched the current owner and confirmed a retry only on exact payload equality. RLS hid another user's row; an ID conflict never caused UPDATE/overwrite.

No migration was required: tables already had primary keys on `id`, owner RLS, and owner policies for INSERT/SELECT. Hosted ACL/RLS were unchanged. If storage failed, the request was not sent. A new pending snapshot locked its fields until confirmation so a retry could not change the original operation.

## PT-11: Switching accounts during a mutation

The call captured the signal and session generation for account A. SessionStore cancelled the signal and removed the user cache when identity changed. A stale completion did not close the editor, show a success/error toast, or write A's data into B's cache. The server request was created with the original session. A local test captured the owner, entry ID, and already-cancelled signal before the delayed response.

## PT-15: Errors and localization

Known creation operations used `unknown`, `conflict`, `rejected`, and `storage` error codes with messages in both locales. Unknown English errors used a safe generic message to avoid exposing SQL, tokens, or internal details. Known Russian messages for authentication, saves, recovery, mutations, and templates remained in the typed translation catalog.

## PT-16: Performance boundaries

At the time, exact Progress and weight-sorted Records retained full history, complete set data, RIR history, warmup exclusion, archived entries, and prior comparisons. The local benchmark used a deterministic fake Supabase adapter with server page cap 1,000. It measured adapter request count, result rows, and client elapsed time—not network latency or PostgreSQL query plans.

The 100 × 20 fixture returned 2,100 rows (100 parents + 2,000 sets); the 1,200 × 2 fixture returned 3,600 rows. The test printed request counts and elapsed time in verbose mode. Recorded results: 9 requests and 169 ms for 100 × 20; 17 requests and 266 ms for 1,200 × 2. Local weight sorting took 12 and 59 ms, respectively. These are in-process fake-adapter benchmarks; process/timer delay is not network latency or a PostgreSQL benchmark. Numeric metrics were compared with the previous pure reference implementation, covering RIR, warmups, archived days, duplicate timestamps, and isolation of a second user.

Weight sorting and Progress were not moved server-side: selecting an older session and its exact preceding session/week requires an expanded RPC and changes to comparison-list pagination in the UI. Phase 5A added no migration or RPC because use could not be verified against a compatible hosted capability. The app and local schema remained without a new migration gate. The cost is loading all entries and sets, with memory and time increasing with history size. Do not claim these two modes scale before adding the server RPC.

## Checks and limitations

Component tests covered lost responses after commit for both creation types, retry after remount, two submits during a delayed response, one UUID/object, payload conflicts, identical names across users, and account switching. A session integration test covered a late workout-set mutation for A after switching to B.

Recorded final checks: Vitest — 32 files, 304 passed; PGlite/SQL — 61 passed; toolchain — 13 passed; typecheck, lint, format, schema preflight, production build, bundle scan, Wrangler runtime smoke, and dependency checks passed. After a fix, full Playwright reported 157 passed, 5 predeclared skipped, 0 failed (18.8 minutes). An earlier run recorded an old SQL `22023` message; the focused test passed after correction, then the full suite passed on rerun. Four new PT-07 E2E scenarios and B12 on Chromium/WebKit passed in the final run.

New browser tests used mocked Auth/HTTP and did not verify real hosted JWT/RLS. Frozen install did not change the lockfile. Hosted staging/production and production Auth were not changed.
