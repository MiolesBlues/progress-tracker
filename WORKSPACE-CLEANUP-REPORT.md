# Progress Tracker — workspace consolidation report (historical snapshot)

**Date:** 30 October 2026.

## Summary

Primary working directory selected: `C:\Users\vitvl\Code\progress-tracker`, a linked worktree in a shared Git repository, not a separate clone. It contained the canonical integration branch. Nine clean linked worktrees were moved by Git into an external protected archive. Files and branches were preserved; no directories were deleted.

Consolidation was partial and conservative. Other working copies and 11 ordinary audit/artifact folders remained. Their contents/purpose were not proven redundant, so they stayed in place. Therefore, “all unnecessary copies archived” was not established.

## Primary working copy

| Property                               | Recorded value                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Directory                              | `C:\Users\vitvl\Code\progress-tracker`                                                                                   |
| Branch                                 | `integration/canonical-release-candidate`                                                                                |
| HEAD before this stage's local changes | `8b63da5fc3c9680a64e163267ce341ac69b6dc87`                                                                               |
| Shared Git store                       | `C:\Users\vitvl\Code\project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574\.git`                                                  |
| Origin                                 | Old repository name redirected to `MiolesBlues/progress-tracker.git`; old URL omitted here.                              |
| Local config                           | `.env.local` ignored by Git; development selected; both sides pointed to staging ref; explicit `ALLOW_STAGING_DEV=true`. |
| Git status                             | Clean after local commits; `.env.local` remained ignored/outside Git.                                                    |

The report said `.env.local` contained publishable keys only and no service-role key was found; values were not printed. A historical tracked `.env` in old main clone contained non-empty backend URL/ref and publishable key for an unknown legacy project; no service-role key was found. Its validity/project state was unknown, not evidence of privileged-secret exposure. The old file was unchanged. The owner was asked to determine whether the legacy backend was needed and rotate the public key if appropriate.

## Inventory and worktree moves

Before the work, 25 linked directories were recorded: 12 Git worktrees, 11 `workout-*` folders without Git metadata, and two unknown nested folders. After selecting the separate primary directory, total accounted locations were 26. New primary did not replace an existing copy.

Nine clean worktrees were moved with `git worktree move` to `C:\Users\vitvl\ProgressTracker-Recovery\archived-workspaces-20261030`:

| Archived directory                                                      | Branch                             | HEAD                                       |
| ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| `progress-tracker-integration-phase1-phase2-release`                    | `fix/dev-staging-opt-in`           | `db07b889b55d42501872ae303fcb70bbb735c7d0` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-centered-day-dialog`      | `feature/centered-day-dialog`      | `e746ab2b57c27c9eefa9b52b85ccec9c35bf0d67` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-centered-exercise-dialog` | `feature/centered-exercise-dialog` | `697bef19c530039811915659460eb5fe9531e71c` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-clean-merge-20261019`     | `integration/clean-merge-20261019` | `274c7d27565a2504246427b9b74bce779146e3e3` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-compact-record-sort`      | `feature/compact-record-sort`      | `9a86941dec8d3b44785bfe2f570e361c9e207404` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-integration-ui-updates`   | `integration/ui-updates`           | `9a1b13d60356d606a8cfcdf96104725cc82dfc38` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-light-blue-palette`       | `feature/light-blue-palette`       | `fba39fc2bd2f724aa168c3b4e14ee8fc8c840ed6` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-per-set-workout-v4`       | `feature/per-set-workout-v4`       | `42bbe3009e942049437308ba905c259b5a579c01` |
| `worktree-compact-workout-logs`                                         | `feature/compact-workout-logs`     | `e6008ca5147577d179305a6f636fefab3d6331ab` |

All nine were clean before moving; process/Windows Restart Manager checks found no process using them. Their 2,464 files first matched the snapshot by SHA-256. After `git worktree move`, branch, HEAD, clean status, and file hashes were checked again; file differences were zero. Only Git's worktree pointer changed. No deletion occurred.

## Locations left in place

### Active Git worktrees under `C:\Users\vitvl\Code`

- `progress-tracker` — primary clean copy after this stage's commits.
- `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574` — old clone on `main`, HEAD `2bddc62`; modified `.env` and untracked nested folder preserved, not changed.
- `progress-tracker-final-main-merge-20261019` — `fix/pt-01-06-08-13`, HEAD `2bddc62`; staged/unstaged/untracked work preserved, not changed.
- `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-system-theme` — `feature/system-theme`, HEAD `f0b0ed0`; untracked nested folder of unknown provenance preserved, not changed.

After consolidation, `git worktree list` showed 13 worktrees: four under `Code`, nine in external archive. Git reported 30 local branches. No branch refs were deleted.

### `workout-*` folders without Git metadata

Left in place: `workout-audit-2026-10-12`, `workout-audit-v2-2026-10-15`, `workout-audit-v3-2026-10-15`, `workout-release-acceptance-20261016`, `workout-security-2026-10-13`, `workout-stage2-2026-10-16`, `workout-stage3-2026-10-16`, `workout-template-validation`, `workout-v2-stage1-2026-10-15`, `workout-v2-stage2-2026-10-15`, `workout-v2-stage3-2026-10-15`. Snapshot preserved their contents. `pgdata` existed under `workout-audit-v3-2026-10-15` and `workout-v2-stage3-2026-10-15`; PostgreSQL data directories were not moved. The purpose/uniqueness of other artifacts did not establish they were duplicates.

Two unknown nested folders also stayed in place. Non-Git directories remain candidates for separate classification, not declared unnecessary.

## Snapshot and data protection

Snapshot used: `C:\Users\vitvl\ProgressTracker-Recovery\snapshot-20261030`. Current `PRESERVATION-MANIFEST.json` and sidecar checksum were checked; snapshot report showed 339,052/339,052 verified and zero hash failures. Git bundle was complete and contained 72 refs. This confirmed local files/Git history preservation, not hosted Supabase backup.

Snapshot also had older `manifest-metadata-final.json` with intermediate counts 339,019 / 338,421 / 598 failures and `.wrangler` exclusion. It predates the current manifest and disagrees with final report; it was not deleted. Use current `PRESERVATION-MANIFEST.json`, `manifest-hash-summary.json`, and `PRESERVATION-REPORT.md` as source of truth for future checks.

Recovery root ACL limited access to owner and SYSTEM. Disk encryption was not confirmed. Snapshot was not an off-device backup. Secrets were not included in this report.

## Checks

### Primary copy and app

- `bun install --frozen-lockfile` — PASS, 579 installed / 717 checked; lockfile unchanged.
- `bun run typecheck` — PASS.
- `bun run lint` — PASS.
- `bun run format:check` — PASS.
- `bun run test` — PASS, 32 files / 312 tests.
- `bun run test:db` — PASS, 63 SQL/PGlite tests.
- `bun run test:toolchain` — PASS, 21 tests.
- `bun run preflight:schema-contract` — PASS, local library/V4/ACL contract.
- `bun run build` — PASS with explicit safe test-only Supabase values.
- `bun run check:client-bundle` — PASS, 40 files.
- `bun run smoke:runtime` — PASS locally for `/`, `/auth`, manifest through Wrangler; no hosted deployment.
- `bun run test:e2e` — PASS: 157 passed, 5 skipped, 0 failed, Chromium/WebKit, 19.8 minutes. Skips were existing Playwright conditions.
- `bun audit` — FAIL: 18 advisories (6 high, 11 moderate, 1 low), a prior release blocker unrelated to consolidation.

Two test adjustments were required because new local `.env.local` legitimately contained staging settings. Release-contract test now sets `ALLOW_STAGING_DEV=false` for its scenario; preflight contract test sets deliberately unknown refs and checks fail-closed behavior. The actual `.env.local` and hosted config were not changed.

### Safe local staging-config startup

PowerShell commands recorded for starting local Vite with the already configured ignored `.env.local`:

```powershell
Set-Location 'C:\Users\vitvl\Code\progress-tracker'
$env:ALLOW_STAGING_DEV = 'true'
$env:SUPABASE_ENVIRONMENT = 'development'
$env:VITE_SUPABASE_ENVIRONMENT = 'development'
bun run dev -- --host 127.0.0.1
```

Browser/server staging-ref checks and schema preflight remained enabled. Local Vite started and `GET /` returned HTTP 200. No database write request was made; E2E used `.invalid` and local mocks.

## Git commits and reversibility

Local primary-worktree commits created in that stage:

- `test: isolate environment contract checks from local dotenv` — protect tests from local dotenv.
- `docs: record safe workspace consolidation` — this report.

Exact SHAs were given in the final Git state. No push, merge, or deployment. Origin used the old repository name that redirects to current GitHub URL; shared clone config was not changed.

Each of the nine worktrees can be returned with `git worktree move` only if original destination is free. Example:

```powershell
$repo = 'C:\Users\vitvl\Code\project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574'
$archive = 'C:\Users\vitvl\ProgressTracker-Recovery\archived-workspaces-20261030'
git -C $repo worktree move "$archive\<worktree-name>" 'C:\Users\vitvl\Code\<original-worktree-name>'
```

Before each move, verify destination is absent, worktree is clean, and archived copy matches manifest. Do not use `--force` or delete the archive. Before returning primary copy, create a separate branch/plan and confirm `.env.local` remains outside Git; do not automatically substitute staging/production configuration.

## Remaining actions

1. Preserve this report with local commit.
2. Separately classify the 11 `workout-*` folders and two unknown nested folders; do not move them before classification.
3. Keep old clone and dirty worktrees untouched until their local changes and `.env` are reviewed.
4. Consider resolving 18 dependency advisories before release.
5. If needed, separately review/rename origin URL, which is shared by linked worktrees.

Hosted Supabase, staging, and production were unchanged. No hosted database data was exported.
