# Release acceptance: two separate users (historical plan)

> This is an acceptance plan and dated evidence, not a current release report. The V3 report recorded RU/EN accessibility, SSR fallback, and reruns of C01–C07; see [Release Readiness V3](../RELEASE-READINESS-V3.md). Real JWT/Auth and deletion still required separate hosted acceptance at that time. It reported B09/B12 installed in the then-active Supabase. Use [STAGING-V3.md](STAGING-V3.md) and verify current schema before any operation; do not blindly repeat an old migration list.

## Automated UI checks

`bun run test:e2e` runs the app locally with fake Supabase URL `workout-e2e.invalid`, Chromium/WebKit, and interception of all external requests. It does not call real Auth/API. Scenarios cover password confirmation; adding an exercise without day/weight; editor without weight; continuous logging with toast; separate **Records** screen; onboarding; drafts; lost response/retry with one UUID; archive/history; charts; A→B→A; and load Retry. Later additions covered last-entry freshness, next-exercise date, log filters, and stable sorting for tied weights.

At viewport widths 320/375/390/430 px in both engines, checks cover overflow, date/weight form, production CSS fixture, Select, modals, dock/toast, and keyboard/mouse drag. TouchSensor is exercised with synthetic DOM touch arrays, hold, and frame-by-frame movement, including first-to-last day, reload, and network failure. Windows WebKit does not expose the Touch constructor and Playwright's public Touchscreen API supports only tap. These scenarios exercise application handlers, not trusted native OS gestures. They are not physical iPhone, system keyboard, or VoiceOver tests. Before another drag, the test waits for the prior save; a hardening case checks that the activator is unavailable during a delayed rename and enabled after response.

V2 included 38 browser checks: saved/fallback day selection, scoped editor errors, archive/restore, NULL-day history, log pages, separated Auth copy, dark toast, and rejecting exercise creation when the server reports an inactive day conflict. See [V2 readiness](../RELEASE-READINESS-V2.md) for recorded results and evidence limits; real acceptance and prepared migrations were in [STAGING-V2.md](STAGING-V2.md).

The recorded setup required Node.js 24, Bun 1.4.3, `bun install --frozen-lockfile --ignore-scripts`, `bun run build` (production artifact required for CSS fixture), then `bunx --no-install playwright install --with-deps chromium webkit`. Screenshots/traces/JSON were under `test-results/`; HTML under `playwright-report/`; these are not committed. CI forbids `.only`, does not automatically retry failures, propagates nonzero exit codes, and preserves reports on failure.

These E2E tests use a substituted backend. They do not verify JWT, RLS, SMTP, OAuth redirects, or real database transaction concurrency. SQL checks run separately on PGlite. A public release requires a separate staging run against real Supabase.

## Staging prerequisites

Use a separate Supabase project without production user data, with agreed migrations 0000–0004 and the separately approved V2 B09 migration; two test emails A/B; verified email confirmation delivery; and allowlisted redirects. Confirm the URL is not production. Record commit SHA, schema version, browser, viewport, time, and each scenario result. Never put passwords, JWTs, real user email, or service-role keys in reports/traces. Permission checks use ordinary JWTs A/B; never use service-role in a browser.

| #   | Action                                                                                                   | PASS criterion                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Register A/B independently; confirm email; password login; Google OAuth                                  | Correct account/onboarding; SDK/Google refusal errors in Russian; controls recover                                            |
| 2   | On fresh accounts create programs with 1–7 days and arbitrary names                                      | Exactly selected day UUIDs; no required Upper/Lower; 0/8 rejected by client and server                                        |
| 3   | Add/rename/reorder day; archive and restore                                                              | Count/order persist after reload; cannot archive last or restore an eighth day                                                |
| 4   | Create/rename/reorder/move exercises and edit goals; confirm program editor has no weight                | Correct day/owner; NULL day is not auto-fixed; errors preserve input                                                          |
| 5   | Try empty weight, 0, 52.5, empty set, `8-8-7-6`, 20/21 sets, RIR/boundaries                              | Invalid fields rejected; 0/52.5 and sets persist exactly; direct invalid API values fail CHECK                                |
| 6   | Draft in A, delay last-entry, edit fields/change exercise/date, switch to B before response              | Late response does not change input/B form; A `TOKEN_REFRESHED` does not clear draft                                          |
| 7   | B JWT reads/updates A data; spoof IDs; check SELECT/INSERT/UPDATE/DELETE/RPC and anon                    | Other user's data unavailable; invalid relationship inserts rejected; anon denied; owner unchanged                            |
| 8   | Archive day/exercise with history, then rename/move/restore                                              | Archives not offered for new workouts; old records/snapshots/UUID/weight/reps preserved                                       |
| 9   | Retry a previously saved operation after archiving                                                       | Same ID returned, no second row; archived exercise cannot receive a new log                                                   |
| 10  | Entries before/after selected date, several same day, previous Mon–Sun week, other week, varied RIR/sets | Selected entry changes both comparisons; same exercise/owner; absent prior week is empty; percentages/deltas/warnings correct |
| 11  | 7/30/90/365/all-time, metrics, archived exercise, future dates, >1,000 entries, `maxRows` below page     | Boundaries honored, no future chart data, pagination complete/stable, page error blocks analytics                             |
| 12  | Network failure or 401/403/500 loading program/history/Auth                                              | Loading/error/empty/success distinct; Retry restores screen; failure does not suggest duplicate program creation              |
| 13  | Double-click, INSERT failure, committed save with lost response, app reload and retry                    | One UUID/row for retry, fields retained; deliberate extra session gets a new ID                                               |
| 14  | A/B create separate drafts for same exercise; logout/login/reload; save one                              | Each sees own draft; only confirmed matching draft deleted; other draft remains                                               |
| 15  | Two concurrent connections: setup/eighth day/reorder/save same ID                                        | Locks/constraints preserve invariants; no partial reorder/duplicates; clear errors                                            |
| 16  | Repeat flows on physical iPhone/Safari                                                                   | No overflow at 320/375/390/430 px; keyboard access, date input/safe area/nav, large text, VoiceOver, install manifest checked |

Also test global sign-out with server `signOut` failure when local session is cleared and when it remains; the messages must distinguish these. Verify re-login and absence of previous account cache.

## Release blockers

Do not set GO until real JWT/RLS for two users, staging/production schema match, read-only legacy-data diagnosis, backup restore, and critical scenarios above are verified. Mark missing checks **NOT RUN**, never PASS. Production migrations, app publication, and merge to `main` are separate user-confirmed actions.
