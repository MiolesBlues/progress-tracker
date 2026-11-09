# V2 follow-up audit: build, dependencies, and E2E (historical report)

**Date:** 15 October 2026. **Branch:** `fix/v2-build-and-e2e`. **Base:** `cd17afe76f481176f7a8857780b38ea9a14090f0`, completed Stage 1 `fix/v2-data-integrity`. Worktree was clean before branch creation. B03/B04, user-scoped query keys, last-entry cancel/invalidation after save, and isolated B09 SQL tests were checked. See [V2 data integrity](V2-DATA-INTEGRITY.md).

This stage covered B01/B02 from `AUDIT-V2.md` (the original audit file is not included in this repository). App code, schema, RLS, and migrations were unchanged. Production Supabase, real users/data were not used; no push, merge, or deployment. Stage 3 did not start.

## B01: failure and lockfile repair

Commit `44e3da3` aligned `package.json`, Bun 1.4.3, lockfile v3, and targeted override `@esbuild-kit/core-utils → esbuild 0.25.12`. Commit `049ac70` later reverted lockfile to v1, removed that override, and restored nested `esbuild 0.18.20` without changing `package.json`. Git diff confirmed the regression; lockfile generator version was unknown. Existing `node_modules` differed from lockfile and hid it.

In an empty separate directory with the old `package.json`, `bun.lock`, and `bunfig.toml`, `bun install --frozen-lockfile --ignore-scripts` failed with exit 1: `overrides changed since bun.lock was saved`.

The lockfile was regenerated with supported Bun 1.4.3 using `install --lockfile-only --ignore-scripts`. V3 and existing targeted override were restored; `package.json` and `bunfig.toml` were unchanged. See [Bun override documentation](https://bun.com/docs/pm/overrides).

Comparison before/after: all 83 direct dependencies and remaining transitive versions retained their permitted versions. Only nested `@esbuild-kit/core-utils/esbuild@0.18.20` and platform nodes were removed. Legacy loader now resolves existing esbuild 0.25.12; tsx keeps its own 0.28.2. No new override, broad upgrade, or `audit fix --force`; existing `rolldown 1.2.1` override unchanged.

A clean install without old `node_modules` and with a new empty cache installed 546 packages (exit 0). Repeated frozen install passed without lockfile changes. Local install was aligned with that lockfile. SHA-256 of verified `bun.lock`: `9D8B4975D00F226CF6B35ED06AEA17CC01431B84C258A7D967AA8860248B3B3A`.

### Dependency security audit

Original V2 lockfile had one advisory: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), Moderate, esbuild 0.18.20 (fixed from 0.25.0). Path: dev dependency `drizzle-kit 0.31.11 → @esbuild-kit/esm-loader 2.6.5 → @esbuild-kit/core-utils 3.3.2 → esbuild ~0.18.20`. It concerns the development `serve` API; app code does not call it and loader uses transform APIs. No app exploitation was demonstrated. The targeted 0.25.12 override was validated with `transform`, `transformSync`, and loading Drizzle's TypeScript config without DB connection. Toolchain regression test checks manifest/lock/Bun/CI alignment and absence of the old nested node.

Repeat Bun audit: zero vulnerabilities across 596 packages (exit 0). Other original audit groups remained at fixed versions: shell-quote 1.12.0, brace-expansion 1.1.21/5.0.12, js-yaml 4.3.2, nanoid 3.3.20, source-map-js 1.2.2. See [dependency review](docs/DEPENDENCIES.md) for the earlier full advisory history.

Compatibility limitation: Vite 8.1.5 declared optional peer esbuild `^0.27.0 || ^0.28.0` while upper node remained 0.25.12. Main build used Rolldown and passed; legacy APIs were checked. Not every optional Vite/esbuild path was exercised. This was not a new advisory; no global override or broad toolchain upgrade was added.

## B02: current release E2E

The old “Password” locator became ambiguous after confirmation and eye buttons were added. Other scenarios looked for the old “Create account” button, removed inline new-exercise input, and separate “Saved” state. A green build did not mean the full journey still exercised current UI.

Stale locators were replaced with accessible `getByRole`/`getByLabel` locators with exact names where needed. Scenarios performed current user actions and covered:

1. Sign-in/registration, password mismatch/confirmation, visibility, Enter, autocomplete; confirmation was absent from signup payload.
2. Onboarding with 1, 2, 4, and 7 days (touch tests also used 3); long custom day names and no interactive presets.
3. Select/add/rename/reorder days; keyboard/mouse/touch DnD and network-failure rollback.
4. Exercise creation without assigned day or required program weight; editor, sets, and target handling.
5. Current per-set save/retry using same UUID, date preservation, weight 0 and 52.5, and return to saved exercise history.
6. Save confirmation/auto-advance on/off, date-aware behavior, and blank fields for a new exercise.
7. Last-entry freshness, stale cache/refetch, late response during manual input, and pristine draft for next exercise.
8. Non-blocking toast, one notice on next save, ~3-second dismissal, and full toast bounding box above dock.
9. Separate **Records**, today/7/30/all filters, multiple same-day sessions, ascending/descending weight and stable tie ordering.
10. HTTP pagination with artificial server `maxRows=2`, exclude future entries, all three chart metrics, archive history in Records/Progress.
11. A→B→A isolation for program/history/drafts, show only own draft, distinguish network error from empty state, and Retry recovery.

All external requests were intercepted; only fake `workout-e2e.invalid` was allowed and other external URLs blocked. This was E2E of the real UI with mocked backend, not real Supabase Auth/JWT/RLS, SMTP, OAuth, or production transactions.

### Mobile checks

Chromium and Playwright WebKit used 320/375/390/430 px. Checks covered overflow, real date/weight inputs and bounding boxes, production CSS fixture, onboarding, modals, Select/keyboard focus, dock/toast, long names, and DnD.

TouchSensor used synthetic `TouchEvent` via Playwright `dispatchEvent`, hold and frame-by-frame movement; first-to-last day, reload, and network error were covered. This checks app handlers, not trusted native OS gestures, physical iPhone, system keyboard, VoiceOver, or actual device safe-area. Known Playwright limits: [Touchscreen API](https://playwright.dev/docs/api/class-touchscreen), [touch event emulation](https://playwright.dev/docs/touch-events).

Tests waited for animation/sensor activation and prior reorder RPC completion. Known application issue B13 (drag during another save) remained out of scope. UI was not changed for tests. Final full E2E: **28/28 PASS**, Chromium 14/14, WebKit 14/14, zero failed/skipped/flaky, retries 0, 5.2 minutes. All four widths ran in both engines.

## CI and recorded checks

Workflow pinned Node.js 24 and Bun 1.4.3, installed from lockfile in clean checkout, used fake environment, installed Chromium/WebKit through pinned Playwright via `bunx --no-install`, and ran required checks. No `continue-on-error` or exit-code suppression; `forbidOnly` and retries 0. JSON/HTML/trace were saved with `if: always()`. An intentionally failing test outside the repository confirmed `bun run test:e2e` exits 1.

| Check                                            | Result                                   |
| ------------------------------------------------ | ---------------------------------------- |
| Clean frozen install, empty `node_modules`/cache | PASS, 546 packages                       |
| Repeat frozen install                            | PASS, lockfile unchanged                 |
| TypeScript / ESLint / Prettier                   | PASS                                     |
| Unit/component                                   | PASS, 172/172, 16 files                  |
| Isolated PostgreSQL/PGlite SQL                   | PASS, 32/32, including B09 and history   |
| Toolchain                                        | PASS, 3/3                                |
| Production client/SSR/Nitro build                | PASS                                     |
| Dependency audit                                 | PASS, 0/596                              |
| Release E2E Chromium + WebKit                    | PASS, 28/28, 14 each                     |
| E2E failure propagation                          | PASS, deliberate failure returned exit 1 |
| Remote Ubuntu GitHub Actions                     | NOT RUN; no push                         |

All local CI-equivalent commands exited 0 in a separate clean dependency copy. After harness fixes, TypeScript/ESLint/Prettier/E2E were rerun; already-passing unit/SQL/toolchain/build/audit were not rerun without changes to their inputs. Final report changes were separately formatted. Earlier failures caught synthetic touch, animation, and keyboard-drop collision timing; only harness was fixed. No assertions were disabled or automatic retries added.

Logs/version inventory/reproduction/clean copy were under `workout-v2-stage2-2026-10-15/`; artifacts were not committed.

## Changed files

`bun.lock`; `scripts/toolchain.test.mjs`; `.github/workflows/quality.yml`; `playwright.config.ts`; `e2e/release.spec.ts`; `e2e/helpers.ts`; `e2e/day-drag.spec.ts`; `e2e/mock-supabase.ts`; `README.md`; `docs/DEPENDENCIES.md`; `docs/E2E-RELEASE.md`; and this report. Changes covered lockfile/toolchain contract, CI gates, deterministic browser server/touch viewports/no-retries/JSON, current E2E flows, and mock account/latency/reorder-failure controls.

## Remaining issues and release

1. **B09 remained a production risk:** TRUNCATE revocation was prepared/locally checked in Stage 1 but not applied here; broader/default privileges need separate review/approval.
2. **B05–B08, B10–B13** were outside this stage and are not claimed fixed: program-day selection, error behind dialog, NULL-day history, large history DOM, Auth spacing, toast theme, exercise-create TOCTOU, and dragging during busy state.
3. Real Supabase with two JWTs, real redirects/email, transaction concurrency, backup/restore, and physical iPhone require separate staging acceptance per [E2E release](docs/E2E-RELEASE.md).
4. Remote Ubuntu CI was not confirmed; Windows local run is not presented as Linux CI. Prior Vite/esbuild optional-peer mismatch remained a limitation.
5. Bun version used by external editor for `049ac70` was unknown. Regeneration by another tool could reintroduce mismatch; frozen install and toolchain guard must remain required.

B01/B02 fixes and successful build did not mean public-release readiness. Overall verdict remained **NO-GO** pending separate production-grant authorization and critical staging acceptance. No further fixes were made in this stage.
