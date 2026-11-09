# Stage 2 — Workout data integrity (13 October 2026, historical report)

Scope: A04, A05, A06, A07, A09, A10, and A11 drafts. The full restored `../workout-audit-2026-10-12/AUDIT.md` was read; commit `7b518a4` and [Stage 1 security report](SECURITY-FIXES.md) reviewed.

Branch `fix/workout-data-integrity` was created from `fix/security-and-program`, HEAD `58b7271`. Two user commits appeared after Stage 1; their combined diff against `7b518a4` was empty. Before changes, typecheck, 35 app tests, and five Stage 1 SQL tests passed again. Git history was preserved.

## Fixes

**A04 — exact input.** Empty weight is rejected; explicit `0` is valid. Decimal comma is supported for weight/RIR. Validation uses original strings; empty/invalid sets are not silently filtered or coerced. `8-8-7-6` remains in the field until corrected and is rejected with an explanation to use four fields. Actual set count is array length; removal requires an explicit button. A shorter program example is padded with empty sets to target count. Prior workout's actual set count is independent of plan.

Client and new server validation agree: 1–20 sets; integer reps 0–2147483647 (PostgreSQL integer range); weight 0–2000 with two decimals; RIR 0–10 with one decimal; note up to 1,000 characters. Existing calendar date is checked. Non-empty note text preserves spaces. Working-weight bounds also apply to program editor.

**A05 — dirty state.** Form instance is scoped to user/exercise/day. First successful last-entry response fills only untouched weight/sets. Editing any set protects the whole array including length. Date/note/RIR are not changed by response. Later refetch/invalidation does not autofill again. Late previous-exercise response cannot change current form; restored user input remains dirty.

**A06 — idempotency.** UUID is created before request and reused as entry PK; operation UUID and immutable payload are saved in draft. A synchronous flag prevents double submit. New RPC `save_workout_entry` returns same UUID for identical retry; changed payload under same UUID is rejected without overwrite. There is no unique `(exercise_id, date)` constraint. **Log another session** creates a new UUID intentionally.

After ambiguous network result, fields lock; retry uses original UUID/values even after app restart. After definite DB validation failure, input remains editable. Existing-operation conflict requires history review and does not silently create another row. No full offline queue/background sync was added.

**A07 — server constraints.** Migration `0004_workout_data_integrity.sql` checks reps dimensionality/non-emptiness, set count, array lower bound 1, no NULL/negative items; validates optional `example_reps` similarly. Weight range/precision and RIR precision are constrained. Entry numeric columns were widened to `numeric` so original decimal values are checked before typmod rounding; old row values are retained.

New CHECK constraints are `NOT VALID`: they protect future INSERT/UPDATE while retaining existing invalid rows. A separate read-only preflight was run locally before migration. No automatic repair, backfill, or `VALIDATE CONSTRAINT` was performed.

**A09 — relationships and historical day.** On INSERT, server verifies owner, active exercise/day, and selected day/exercise relationship. `day_id/day_name` are derived from owner-visible exercise/day; client-supplied day name is replaced. Historical UUID, owner, relationships, and day snapshot are protected from UPDATE. Program move/archive does not rewrite history. Retry of a saved operation is checked before current activity, so a lost response can be recovered after archiving. Archived exercises cannot be selected for new workouts.

**A10 — read states.** Private layout, workout, last-entry, history, and program distinguish loading/error/empty/data. Errors do not trigger program setup or masquerade as no records. Retry exists; last-entry error permits manual input without losing it. Session-check network failure displays recoverable error. History component was moved out of route file while preserving its separately loaded bundle.

**A11 — drafts.** LocalStorage stores versioned user/exercise draft with raw strings, dirty state, UUID, and pending operation. Last selected exercise is also user-scoped. Successful save removes only the draft with matching UUID; late response cannot remove a newer draft. Account switch hides old form; returning restores that user's input. Same-user token refresh does not reset form. Corrupt data is not silently overwritten; reset requires explicit UI action. If saving UUID to storage fails, network request is blocked.

## Checks

| Check                    | Result                                   |
| ------------------------ | ---------------------------------------- |
| `npm.cmd run typecheck`  | PASS                                     |
| `npm.cmd test`           | PASS, 89 tests (35 existing + 54 new)    |
| `npm.cmd run test:db`    | PASS, 25 scenarios (5 existing + 20 new) |
| `npm.cmd run build`      | PASS, client/SSR/Nitro production build  |
| ESLint on changed TS/TSX | PASS, 0 errors/warnings                  |
| `git diff --check`       | PASS                                     |

All 12 required scenarios had automated coverage: empty weight, explicit zero, decimal comma, empty set, hyphenated input, late response, double submit, committed INSERT with lost response/retry after restart, definite INSERT failure, spoofed owner/exercise/day, draft restore, and archive preserving history. Also checked token refresh, A→B→A, late A save with B form, unavailable/corrupt storage, operation conflict, numeric/array boundaries, anon, nullable examples, and Upper/Lower template compatibility.

SQL tests ran in isolated in-memory PGlite/PostgreSQL without Supabase or environment keys. Pre-migration read-only query found five synthetic invalid rows and two invalid program examples. They were not fixed automatically; query remains in `scripts/workout-preflight.sql`. Production `NOT VALID` semantics were not independently confirmed in this stage. No hosted migration was applied.

## Scope and limitations

- Transactional cross-user protections were locally checked; real hosted Auth/RLS needs real JWT staging acceptance.
- Migration does not delete/repair invalid legacy rows. The recommended release path is read-only preflight, classify/resolve data, then separately authorized migration/rehearsal.
- After server save succeeds but local clear fails, repeating same draft is safe and receives same ID. For unknown operation outcome, retry/verify it before creating a new one.
- A08 and A12–A17 plus full offline sync were out of scope. Comparison against workout, period bounds, pagination, dependencies, and remaining OAuth/docs issues were not declared fixed.
- No merge, push, or deployment. Pre-existing `src/routeTree.gen.ts` line-ending-only change and nested Next.js folder were preserved and excluded from commit.

## Changed files

`src/components/workout-page.tsx`, `workout-form.tsx`, `progress-page.tsx`, `query-feedback.tsx`; authenticated workout/progress/route files; `src/lib/workout-input.ts`, `workout-draft.ts`, `save-workout.ts`, `workout.ts`, `program.ts`; Supabase types; migration `0004_workout_data_integrity.sql` and journal; `scripts/workout-preflight.sql`, `scripts/workout-db.test.mjs`; workout component/input/draft tests; `src/test/supabase-mock.ts`; `package.json`; and this report.
