# Clean integration validation — 19 October 2026 (historical report)

**Branch:** `integration/clean-merge-20261019`. **Base:** `08801935ef40cce34ef9488abebbacc0b6cc40de`. This was test refresh and regression repair, with no additional merges.

## Requirements and boundaries

- User requirements: new set result fields start empty; Weight/Reps/RIR remain independent; reorder preserves IDs/values; Standard and Focus share a draft.
- `docs/per-set-workout-v4-stage-3.md` states Focus uses the same WorkoutForm, V2 draft, and atomic `saveWorkoutSets`.
- README, `docs/E2E-RELEASE.md`, and `docs/STAGE2-BUILD-QA.md` explicitly promised RU/EN.
- Root `AGENTS.md` at that time prescribed Russian-only and a single dark theme. This was a documentation/integration-scope conflict, not evidence that English was cancelled. Language E2E was retained; missing LanguageProvider/selector/SSR English was treated as an incomplete-integration blocker.
- `system-theme`, `light-blue-palette`, and incompatible hardening portions remained excluded. Tests requiring these features were not made to pass by removing them.
- Mocks/preview used a fake endpoint; these tests did not verify hosted Auth/RLS/database.

## 320 px day-name “truncation” investigation

`programName(name, 60)` trims and validates length; it does not slice. The input event and React state contained 15 characters (`Силовой день с `). Save removed only the trailing space with `trim()` and sent 14 characters in PATCH. React/validation/API did not further truncate. At 320 px, the existing native input was 26 px wide with `maxlength=60`; the original name had 45 characters.

Standalone diagnostic HTML:

```html
<input
  style="width:26px;padding:4px 12px"
  maxlength="60"
  value="Силовой день с произвольным длинным названием"
/>
```

With the tested Playwright/Chromium stack, `fill(longDay + "!")` reproduced the value `"Силовой день с "` (15 chars) in the input. This showed the prior claim of a React editor bug was incorrect: the automation had truncated the input.

Regression `e2e/day-rename.spec.ts` enters `!` with normal key presses and checks full input value, maxlength 60, full PATCH, mock storage, no overflow, and reload at 320/375/390/768 px in Chromium/WebKit. The old E2E `replaceText` helper clears before fill and checks the full value. Editor design, limit 60, and model were unchanged.

## Consolidation of 40 original Vitest failures

Scenarios were not discarded solely because they failed. Lifecycle/security coverage was rewritten for V2; duplicate foundational checks used existing `per-set-workout.test.tsx`. Count reduction came from consolidation, not skips. The 40 cases covered:

- Program day selection/filtering; empty weight; new-set fields remaining empty even with prior weight 50 or 0; target set count without fabricated results; no-history/example reps; date-aware history; explicit weight 0 and 52.5; per-set payload normalization; confirmed save/advance with blank new exercise; auto-advance off; exercise-specific reps/RIR; edited fourth-set identity/latest display; drafts, retries, and history.
- Workout draft recovery, saved history, archive/unassigned days, analytics, pagination, error/loading states, account isolation, and Standard/Focus shared behavior.
- Tests were updated to current per-set behavior: `_sets` with explicit IDs/positions rather than legacy `_weight/_reps`; separate set updates rather than rewriting the whole workout; retry uses the same UUID; comparisons use the selected saved date; tests no longer expected removed “Previous”/“No history” UI summaries.

The report's original table mapped each of 40 names to cause and replacement. No test was converted to skip to force green.

## ESLint and format findings

Lint found 10 reported issues: two `no-explicit-any` findings in tests and eight `react-refresh/only-export-components` findings on legitimate shared exports. Three unused imports were removed. ESLint rules were not disabled, downgraded, or weakened. Remaining false positives were documented for separately approved rule/scope review. Changed files passed Prettier; formatter ignores followed repository policy.

## Playwright and worker results

Initial full Playwright showed 48 passed, 7 failed, 4 skipped. Six failures were expected because RU/EN UI/provider was absent; one asserted a deliberately replaced auth phrase. Failures were kept visible. Current per-set cases were fixed or consolidated; missing RU/EN/system-theme cases remained integration blockers and were not silenced.

The local Cloudflare Worker smoke succeeded for root/auth and manifest. The report recorded:

| Browser  | Result                          |
| -------- | ------------------------------- |
| Chromium | 65 passed, 0 failed             |
| WebKit   | 60 passed, 4 skipped, 0 failed  |
| Total    | 125 passed, 4 skipped, 0 failed |

Four skips preserved engine limits: responsive editor, compact sort, and dedicated theme check were Chromium-only; set-touch DnD retained an existing WebKit limitation. Separating editor/theme added a WebKit skip without reducing prior coverage. Keyboard/mouse/touch automated scenarios existed; physical iPhone and VoiceOver were not checked.

## Readiness

**Ready to merge to main: NO.** Actual regressions and current per-set scenarios were repaired, but RU/EN promises in README/V3 conflicted with then-current `AGENTS.md`, and system theme was excluded. These checks were not disabled. `system-theme`, `light-blue-palette`, and remaining incompatible hardening were not merged. Main and backup were confirmed at `c2d41efa81921c3dc8f43618c912bb82f32a489a`. No push, deployment, or production Supabase action occurred.

This report describes an earlier state; [final integration report](final-integration-20261019.md) superseded it for RU/EN and theme behavior.
