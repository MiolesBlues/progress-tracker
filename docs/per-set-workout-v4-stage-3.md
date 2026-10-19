# ProgressTracker V4 — Stage 3

## Result

Focus Mode is a presentation and navigation layer over the same `WorkoutForm`, V2 draft, and `saveWorkoutSets` path used by the standard logger. It does not issue per-set writes through a second persistence path.

- Shows the selected day/exercise, previous set results, current set inputs, set progress, and exercise navigation.
- “Record set” confirms the current values in the locally persisted draft and advances; the whole exercise is committed atomically with the existing save operation.
- Previously recorded sets can be revisited and edited. Any set edit clears completion progress to avoid representing stale values as completed.
- Saved diary sets can be edited independently through the owner-scoped `update_workout_entry_set` RPC; weight is retained as a decimal string for the update and history/last-session caches are refreshed.
- Skipping/navigation does not delete or overwrite the skipped exercise draft. Extra sets remain available.
- Focus Mode execution order can be rearranged per user/day and is stored locally; the program's permanent exercise order is unchanged.
- Switching between Focus and standard mode keeps the mounted logger/draft intact. Focus transitions use a 250 ms fade/slide and respect `prefers-reduced-motion`; focused inputs receive focus after set navigation.
- The existing app has no rest timer or auto-advance timer component/settings. Auto-advance between exercises remains the existing preference; no duplicate timer was introduced.

## Tests and constraints

Tests cover switching modes without losing values, persisted per-set progress across remount, navigation/reordering, mixed per-set values, retry payload immutability, and load type selection. The Radix Progress wrapper now forwards `value` to its root so screen readers receive the progress value.

- TypeScript and ESLint: PASS
- Vitest: PASS, 217 tests across 24 files
- Database suite: PASS, 57 tests
- Toolchain suite: PASS, 6 tests
- Prettier check: PASS
- Production build: PASS (existing Vite tsconfig-paths advisory)
- Dependency audit: PASS, 0 vulnerabilities
- Real staging browser E2E and device viewport/theme checks: BLOCKED/not run because this worktree has no staging credentials or safe authenticated staging test account. No production/staging access or writes were attempted.

No production or staging database was used. No new migration is required for Focus Mode. Previous V2 drafts without the optional `recordedSetIds` field restore as an empty completion set.
