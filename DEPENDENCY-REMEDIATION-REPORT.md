# Progress Tracker dependency security remediation (historical report)

**Date:** 30 October 2026. **Branch:** `security/dependency-remediation`. Scope was local dependencies only; main, production/staging, and deployment were unchanged.

## Result

Initial `bun audit` on canonical HEAD `d084b38bbb4e19e78fa8a0b5a608b9b09aa840cb` found 18 advisories: six High, 11 Moderate, one Low. After remediation, audit reported no vulnerabilities across 649 packages. All High/Moderate/Low findings were addressed. Full Playwright completed with 157 passed, 5 skipped, 0 failed on Chromium/WebKit.

## 1. Git and baseline

- Working directory: `C:\Users\vitvl\Code\progress-tracker`.
- Starting branch/HEAD: `integration/canonical-release-candidate` / `d084b38bbb4e19e78fa8a0b5a608b9b09aa840cb`, a descendant of `2bddc62fe82f6672a9ab1b15c671bc196911d90d` with prior phases retained.
- Created `security/dependency-remediation` from canonical.
- Four existing untracked reports were preserved and excluded from dependency commit.
- Bun 1.4.3, lockfile v3; manifest and lockfile initially agreed.
- Tracked dependency changes: `package.json`, `bun.lock`, `scripts/check-dependency-contract.mjs`, `scripts/toolchain.test.mjs`.
- App source, environment files, migrations, project refs, and Supabase were not changed.

## 2. Package updates

| Package                   | Before                         | After           | Reason/compatibility recorded                                                                                                                         |
| ------------------------- | ------------------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite                      | 8.1.5                          | 8.1.6           | Minimum fixed Vite 8 patch; resolves Vite middleware and bundled launch-editor advisories.                                                            |
| Vitest / `@vitest/mocker` | 4.1.11 / 4.1.11                | 4.1.12 / 4.1.12 | Fixed Vitest 4 patch.                                                                                                                                 |
| `seroval`                 | 1.6.9                          | 1.6.11          | Compatible patch override; TanStack requires `^1.6.7`.                                                                                                |
| `undici`                  | 7.29.1                         | 7.30.1          | Override scoped to `undici@^7`; Miniflare uses 7.x; other major lines unchanged.                                                                      |
| Zod                       | 3.25.76 (graph also had 4.6.7) | 4.6.7           | No fix for Zod 3; High advisory fixed in 4.6.6+. No direct Zod import found under `src`; resolvers allow 3/4 and router-generator already requires 4. |
| `launch-editor`           | 2.14.2                         | 2.14.2          | Package itself was fixed; advisory also arrived through Vite 8.1.5, updated to fixed Vite.                                                            |

React 19, TanStack Start/Router/Query, Nitro, Cloudflare Worker configuration, and Supabase integration were unchanged. No advisory was suppressed. Bun serialized the version-scoped `undici@^7` override as `{ ".": "7.30.1" }`; a contract test normalizes that form and asserts exact scope/version.

The original advisory matrix used the package paths from `bun audit`, included CVEs where listed, preserved all 18 GHSA/CVE findings and severities, and marked all fixed; exploitability/reachability was not used to suppress findings. Several findings were in test/development servers or Windows mock redirects; `seroval` paths included TanStack Router/Start runtime/SSR, without a separate claim of app exploitability.

## 3. Regression controls

The dependency contract test checks exact manifest/lockfile alignment and override scope. No app runtime/config changes, mass upgrade, or `audit fix --force` were made. The change was constrained to four tracked dependency/contract files plus this report.

## 4. Validation

| Check                                | Recorded result                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| Dependency audit                     | PASS; no findings across 649 packages                                                   |
| `bun run typecheck` / `bun run lint` | PASS                                                                                    |
| `bun run format:check`               | FAIL due to three previously created untracked reports; report content was unchanged    |
| `bun run test`                       | PASS, 32 files / 312 tests                                                              |
| `bun run test:db`                    | PASS, 63 tests                                                                          |
| `bun run test:toolchain`             | PASS, 21 tests                                                                          |
| `bun run preflight:schema-contract`  | PASS, local contract only                                                               |
| `bun run build`                      | PASS with safe synthetic `test` / `.invalid` values, no `.env`                          |
| `bun run check:client-bundle`        | PASS, 40 files                                                                          |
| `bun run smoke:runtime`              | PASS, `/`, `/auth`, manifest                                                            |
| `bun run test:e2e`                   | PASS, 157 passed, 5 skipped, 0 failed of 162; Chromium/WebKit, one worker, 21.7 minutes |

Hosted Supabase and external services were not contacted. Playwright used the local mock backend.

## 5. Diff and commit

Dependency changes were committed as `0c08fef2ae9850ebab82716fa9a08ce4c42b768b` on canonical HEAD. The report describes the check results and links to that dependency commit. The five E2E skips were pre-existing browser-test configuration and were not counted as passes. The four prior untracked reports were not included. No push or merge occurred.

## 6. Remaining risk and status

- Dependency audit: **GO for the manifest/lockfile checked at that time**.
- Remediation and regression checks completed; shared `bun run format:check` remained FAIL because of three unchanged untracked reports.
- New advisories may appear; rerun `bun audit` for releases.
- This commit did not authorize main merge or production deployment.
