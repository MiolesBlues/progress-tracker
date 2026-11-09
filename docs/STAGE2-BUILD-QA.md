# Stage 2: C01, C04, and C05 — Build and QA (historical report)

**Date:** 16 October 2026. **Branch:** `fix/v2-release-hardening`. **Starting HEAD:** `2e24e13940ada4c9fd3f36e58468cad299e20838`.

C02/C03/C06 fixes were retained. SQL migrations, `program-manager.tsx`, `archive-delete-dialog.tsx`, and `archive-deletion.ts` matched the previous commit. The original `AUDIT-V3.md` was preserved separately and not included in this stage's commit. No push, merge, deployment, or production SQL was performed. This is historical local evidence, not current release status.

## C01: cause and fix

Generated/sync commit `2061582` restored `bun.lock` v1 without the parent override declared in the manifest; merge `efb4537` retained the mismatch. Frozen install rejected the lockfile, the toolchain check failed, and vulnerable `esbuild@0.18.20` returned through the legacy Drizzle loader. The existing `node_modules` also contained Lovable preset 2.25.3 instead of declared 2.26.5.

The lockfile was regenerated with pinned Bun 1.4.3 using `bun install --lockfile-only --ignore-scripts`. `rolldown: 1.2.1` and targeted `@esbuild-kit/core-utils → esbuild: 0.25.12` were retained; there is no global esbuild override. [Bun uses lockfile v3 for nested overrides](https://bun.com/docs/pm/overrides).

Module resolution found that Vite 8.1.5 used esbuild 0.25.12 despite optional peer range `^0.27.0 || ^0.28.0`. Direct dev dependency esbuild 0.28.2 was pinned; it was already present through tsx. Vite/tsx resolve 0.28.2, while core-utils/Drizzle use the separate 0.25.12. Toolchain tests check both paths, legacy `transform`/`transformSync`, and Drizzle config loading without a database.

Comparison of allowed versions before/after found no newly added package versions; esbuild 0.18.20 and its platform binaries were removed. No broad upgrade or `audit fix --force` was used.

| Package                                 | Installed version in this review |
| --------------------------------------- | -------------------------------- |
| Bun / Node                              | 1.4.3 / 24.14.0                  |
| Lovable preset                          | 2.26.5                           |
| Vite                                    | 8.1.5                            |
| TanStack Start / Router / Router plugin | 1.168.60 / 1.170.41 / 1.168.42   |
| Drizzle Kit / ORM                       | 0.31.11 / 0.45.4                 |
| esbuild for Vite/tsx                    | 0.28.2                           |
| esbuild for core-utils/Drizzle          | 0.25.12                          |
| rolldown                                | 1.2.1                            |

All 84 direct packages were checked against manifest, lockfile, and installed `package.json` files. Nineteen installed peer constraints and Node engines for preset, Vite, TanStack, and Drizzle had no mismatches. The report linked version/SHA-256 snapshot and peer-check logs under `workout-stage2-2026-10-16/artifacts/`.

The final frozen install ran in a new `workout-stage2-2026-10-16/acceptance` copy without `node_modules`, `.env`, or `.git`, with an empty `final-empty-package-cache`, `--no-cache`, and `--ignore-scripts`. It installed 547 packages in 93.12 seconds (exit 0). Manifest and lockfile SHA-256 values matched the source after installation. The old checkout `node_modules` was preserved in a diagnostic directory; the working checkout was also reinstalled and checked for actual resolution. The existing install was not treated as clean-install evidence.

### Regression guard

- CI runs `check:dependencies` before installation using Node built-ins and pinned Bun. It checks Bun/lockfile versions, overrides, direct specs, esbuild, and pinned preset.
- A fixture without `node_modules` confirms old v1 and a missing parent override fail before installation.
- Frozen install remains enabled; the next CI step requires `git diff --exit-code -- package.json bun.lock`.
- ESLint runs with `--max-warnings 0`. Rules and ignores were not weakened.
- Requirements are recorded in `AGENTS.md` and the dependency guide. No lifecycle hooks or custom merge driver were added. External Lovable sync can still overwrite a file; the guard detects it and fails CI.

## C04: targeted fixes

`previewAuthStorage.ts`, `pending-rpc.ts`, and `save-workout.ts` were formatted with current Prettier; the preview-storage timer was made `const`. `program-manager.tsx` had already been formatted in the prior stage. The remaining C04 and C05 changes addressed focused issues in the affected harness/UI while preserving archive-history, user-name, and independent A/B locale assertions; no assertion was disabled and the settings gear was not restored to public UI.

## Final checks recorded

All checks below ran against the final graph in a clean acceptance copy. Intermediate diagnostics before peer-resolution, locator, and production-CSS fixes are not final results.

| Check                                       | Result                                                       |
| ------------------------------------------- | ------------------------------------------------------------ |
| Clean frozen install, empty directory/cache | PASS, 547 packages; manifest/lock unchanged                  |
| Dependency contract before install          | PASS                                                         |
| Toolchain                                   | PASS, 6 tests                                                |
| Dependency audit                            | PASS, 0 vulnerabilities across 597 packages                  |
| TypeScript                                  | PASS                                                         |
| ESLint                                      | PASS, 0 errors, 0 warnings                                   |
| Prettier, full project under current config | PASS                                                         |
| Unit/component                              | PASS, 220 tests / 20 files                                   |
| SQL/PGlite                                  | PASS, 42 tests                                               |
| Native PostgreSQL 18.6                      | PASS, 10 checks; new synthetic DB, cluster stopped afterward |
| Chromium/WebKit E2E                         | PASS, 66/66 (33 each), no skipped/flaky, retries 0           |
| Production build                            | PASS, client/SSR/Nitro/Cloudflare with fake environment      |

Mobile viewport checks used 320, 375, 390, and 430 px in Chromium and Playwright WebKit. They covered overflow, date/weight layout, modal settings, program, archives, records, progress, and workout flows. No physical iPhone was used.

All local gates in `quality.yml` ran on Windows, Node 24, Bun 1.4.3. Remote Ubuntu GitHub Actions was NOT RUN because push was not authorized for this task. Linux browser system dependencies were not substituted with local Windows binaries. These are local full-suite results only.

## Real Supabase and isolated checks

This stage did not contact or change real Supabase. Hosted JWT A/B, SMTP/email confirmation, Google OAuth, and actual production schema were NOT RUN; the earlier audit was not treated as new PASS evidence.

E2E used the local app and mock HTTP at `workout-e2e.invalid`, blocking other external requests. Signup/login tested the real app UI against mocked Auth API. Unit/component tests used a mock client. SQL/PGlite and native PostgreSQL used synthetic `auth.uid()`/roles and isolated data; they checked RLS/ACL/FK/transactions but did not verify managed Supabase JWT signatures. Native concurrency scenarios reconfirmed C03, UUID tombstones, history preservation, and save/delete serialization on the final dependency graph.

## Remaining limitations

C01/C04/C05 were closed locally. C07 (accessibility/localization) was outside this stage. The deletion migration from the prior stage remained local; the C02 gate remained. Hosted staging acceptance, production environment, backup restore, and a physical iPhone were not checked. A green local pipeline does not close these release gaps. Work was limited to Stage 2; Stage 3 and rollout were not performed.

Logs were linked under `workout-stage2-2026-10-16/artifacts/`, including final clean frozen install, toolchain, unit, SQL, native PostgreSQL, E2E, build, and audit logs.
