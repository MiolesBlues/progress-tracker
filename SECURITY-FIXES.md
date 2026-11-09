# A01–A03 security and program fixes — 13 October 2026 (historical report)

The full `../workout-audit-2026-10-12/AUDIT.md` was reviewed. Starting HEAD was `c2d41efa81921c3dc8f43618c912bb82f32a489a`; all three findings were confirmed against that audit revision. Fixes were made on separate branch `fix/security-and-program`.

## What changed

**A01 — account/session isolation.** Every React Query personal key is prefixed `['user', userId]`; queries are owner-filtered and receive an `AbortSignal`. A separate session store synchronously reports identity changes to React, cancels requests, and clears personal cache. Private UI stays hidden until route-verified user matches current session. Session-generation changes remount forms. Late cancelled requests/old saves cannot update the new session. Sign-out hides forms until request completion. Repeated same-user events, including `TOKEN_REFRESHED`, do not clear cache/draft or trigger invalidation.

**A02 — personal program days.** Program screen was replaced by personal training-day UI. Legacy `DAYS`, `DayId`, and `Exercise.day` were not reintroduced; code uses `program_days.id` and `program_exercises.day_id`. Empty-program onboarding omits optional `_template`. Strict TypeScript settings remained enabled.

**A03 — program management.** Added/renamed/archived/restored/reordered days with limit of 1–7 active days. Exercises can be created, renamed, archived/restored, moved to an active day, reordered, and have working weight, target sets, and rep range edited. Ownership is enforced through RLS and explicit client `user_id` filters.

Reordering uses atomic RPCs validating the full list, owner, and uniqueness. A migration serializes day membership/order changes and initial setup per user. Server trigger rejects an eighth active day, over-limit restore, and archiving the final active day. Applying the migration alone does not alter existing rows.

Archiving updates only `archived_at`; moving updates the exercise by UUID. Existing `workout_entries`, day relationship, and name snapshot are unchanged. Exercises with `NULL day_id` appear separately and can be assigned only by explicit selection/save. Analytics can select those exercises, including archived ones.

## Checks recorded

| Command/check            | Result                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| `npm.cmd run typecheck`  | PASS, 0 errors                                                           |
| `npm.cmd test`           | PASS, 35/35 (11 existing + 24 new)                                       |
| `npm.cmd run test:db`    | PASS, 5/5 SQL integration scenarios in in-memory PGlite/PostgreSQL       |
| `npm.cmd run build`      | PASS, client, SSR, and Cloudflare/Nitro production artifact in `.output` |
| ESLint on changed TS/TSX | 0 errors; two Fast Refresh warnings from combined exports                |

## Limitations

The report included a read-only preflight for existing exercise history and active-day counts; review its output before approving a migration. No automatic backfill was added. Full all-owner inventory requires operator access; normal users see only their rows under RLS.

Auth tests used substituted events/network responses; SQL ran on local PostgreSQL in a single connection. Real JWTs for two accounts, multiple tabs, multi-connection concurrent transactions, and Safari/iPhone require staging verification. Production RLS/grants and applied migration status were not confirmed.

A04–A17 were outside this stage. Remaining original issues included autofill after ordinary refetch, workout-entry validation/idempotency, pagination, and dependencies. Passing build does not mean ready for public launch. No merge, push, deployment, or production data change occurred. A newly appeared nested standalone Next.js folder was preserved and excluded from commit.

## Files changed

- `src/lib/session.tsx` — identity change, request cancellation, private-session boundary.
- `src/lib/queries.ts` — user-scoped keys/filters, cancellation, stable program order.
- `src/routes/__root.tsx` — session provider.
- `src/routes/_authenticated/route.tsx` — identity match and safe sign-out.
- `src/routes/_authenticated/workout.tsx` — user-scoped queries/saves and stale-response protection.
- `src/routes/_authenticated/progress.tsx` — user-scoped queries and exercises without a day.
- `src/routes/_authenticated/onboarding.tsx` — optional RPC argument and session protection.
- `src/routes/_authenticated/program.tsx` — new program screen route.
- `src/components/program-manager.tsx`, `src/lib/program.ts` — day/exercise management and validation.
- `drizzle/migrations/0003_program_management.sql`, `drizzle/migrations/meta/_journal.json` — atomic RPCs, constraints, serialization, migration registration.
- `src/integrations/supabase/types.ts` — new RPC types.
- `src/lib/session.test.tsx` (8 session-isolation scenarios), `src/components/program-manager.test.tsx` (7 UI scenarios), `src/lib/program.test.ts` (9 goal-validation checks), `src/test/supabase-mock.ts` (controlled Auth/network responses).
- `scripts/program-db.test.mjs` (5 local SQL scenarios), `scripts/program-preflight.sql` (read-only data diagnostics), `package.json`, `bun.lock`, and this report.
