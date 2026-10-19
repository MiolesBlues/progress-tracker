# ProgressTracker V4 — Stage 2

## Result

Stage 2 updates the workout logger, diary, last-session prefill, and progress summaries to use `workout_entry_sets` as the authoritative model. Legacy parent columns remain available during compatibility rollout; old records without child rows still render via same-weight conversion.

### Behavior

- Each logger row owns its UUID, weight, repetitions, nullable RIR, warm-up/working type, external/bodyweight load type, and position.
- Drafts are versioned V2 per user/exercise/date. New and changed fields persist locally before submission; retry reuses a frozen idempotent operation. Unfinished V1 requests are retried through the old RPC with their original payload before switching to V2.
- Previous-session prefill maps matching set positions and never changes a touched V2 draft. Missing positions fall back to the program prescription; an added set starts from the last visible set.
- Diary rows render actual per-set values and RIR. Rows without set records use a legacy adapter.
- Progress charts use maximum working load, total working repetitions, and `SUM(weight × reps)` for working sets only. Warm-ups are excluded. Best set and total volume are separate metrics. Bodyweight set load is interpreted as added load only; body mass is not inferred.
- Session comparisons expose deltas and mark sessions non-comparable when working-set counts, load types, or effort differ materially. They do not claim progression from a heavier individual set alone.

## Files

- `src/components/workout-form.tsx`
- `src/components/entries-page.tsx`
- `src/components/progress-page.tsx`
- `src/lib/queries.ts`
- `src/lib/workout.ts`
- `src/lib/analytics.ts`
- `src/lib/i18n.ts`
- Related unit/component tests and Supabase test mock
- Removed `src/components/workout-flow.test.tsx`, whose assertions encoded the superseded one-weight/one-RIR UI; focused V4 logger tests replace its logger scenarios. Program management remains covered in `program-manager.test.tsx`; persistence/RLS/retry remain covered by database tests.

## Verification

- TypeScript: PASS
- ESLint: PASS
- Vitest: PASS, 214 tests across 24 files
- Database tests: PASS, 57 tests; includes backfill, mixed weights/RIR, nullable RIR, retry/idempotency, legacy compatibility, warm-up type, RLS ownership, and set add/edit/delete/reorder
- Toolchain tests: PASS, 6 tests
- Prettier check: PASS
- Production build: PASS (existing Vite tsconfig-paths deprecation advisory only)
- Dependency audit: PASS, 0 vulnerabilities / 597 packages
- Staging browser exercise: NOT RUN; no staging credentials/isolated staging config supplied to this worktree. No production or staging writes were attempted.

## Migration and compatibility

No schema change is added in this stage. Stage 1 migration remains the only persistence migration. Deploy the additive schema and RPCs before this frontend; retain legacy fields/RPCs until old clients have aged out. Do not remove legacy columns in this release.
