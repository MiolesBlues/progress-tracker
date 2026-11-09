# GitHub CI setup and repository finalization (historical report)

**Review date:** 30 October 2026. This report is a snapshot of setup and CI status then; it is not current CI status.

## 1. Git state

Working directory: `C:\Users\vitvl\Code\progress-tracker`. Starting verified branch: `security/dependency-remediation`, HEAD `e788319ae2b4bbdaf9b19fed09fc05d0888524a7`. Four untracked reports were preserved first. The external preservation snapshot and sidecar manifest passed SHA-256 validation (`4aa9efe5f900bdba2756203446ba991f36f6a1499fb5ace92f086091a112fac6`; 339,052/339,052 objects and zero errors per manifest).

Origin had previously pointed at a placeholder URL; local configuration was corrected to `https://github.com/MiolesBlues/progress-tracker.git` (the old value is intentionally omitted). A read-only check confirmed GitHub `main` at `2bddc62fe82f6672a9ab1b15c671bc196911d90d`.

Branch `ci/github-actions-setup` was created from the verified candidate. Local commits recorded: `b80651a` (preserved four branch/merge reports after common-secret-marker and formatting checks), `586a9d5` (safe GitHub Actions workflow), `d25bda5` (CI contract checks), and `203794a` (restricted push trigger to branches). Workflow implementation HEAD was `203794a0806c6170a9bb4b7d4a8dc6e8a5f9d369`. Later report-only commits were `5a9863f` (PR/hosted result) and `03a8d55` (blocker explanation). At final local check, branch HEAD and `origin/ci/github-actions-setup` both matched `03a8d5554bf895e8c762883a50fca1fb0697450a`; working tree was clean.

Tracked tree had no `.env`, database dumps, or nested project snapshot. Local `.env.local` remained outside Git and was not read. New reports passed targeted common-secret-marker search with no matches; this checked format, not all possible sensitive data.

## 2. Earlier `startup_failure`

GitHub Actions had created run [41070069701](https://github.com/MiolesBlues/progress-tracker/actions/runs/41070069701) for `main` at `2bddc62fe82f6672a9ab1b15c671bc196911d90d`. Available API returned `startup_failure`, workflow path `BuildFailed`, and an empty job list. The workflow had not reached job creation; available evidence did not establish why.

Actions/runners settings, webhook, and deployment endpoints were unavailable in that connection. The failure could not be reasonably attributed to YAML, billing, Actions policy, or runner pool. The owner was asked to inspect Repository Settings → Actions → General, organization limits, hosted-runner availability/quota, and details of that run before retrying.

## 3. Workflow added

Added `.github/workflows/quality.yml` with PRs to `main`, push to branches, and manual `workflow_dispatch`; `permissions: contents: read`; runner `ubuntu-24.04`; Node `24.14.0`, Bun `1.4.3`; and actions pinned by full commit SHA with versions in comments. It cached only the Bun install cache keyed by lockfile and did not save cache for PRs. Quality/build jobs were independent from browser E2E. E2E installed Playwright Chromium/WebKit and uploaded reports on failure. Forbidden local env files and data artifacts were checked before tests.

Workflow environment used only synthetic `.invalid` addresses and test values. Supabase refs/service-role, `RELEASE_DATABASE_URL`, and staging opt-in were blank/disabled. Local schema capability preflight did not connect to hosted services. The workflow did not run migrations, seeds, hosted preflight, Wrangler deploy, publication, or Cloudflare release.

Five workflow contract tests were added to `scripts/ci-workflow.test.mjs` and `test:toolchain` (26 tests total at that snapshot).

## 4. Local validation

Full validation ran in a separate clean detached worktree without `.env.local` on predecessor `d25bda5`. Final commit `203794a` changed only push-trigger restriction and its contract test; that test was rerun on final HEAD.

| Check                               | Recorded result                                                             |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `bun run check:dependencies`        | PASS                                                                        |
| `bun install --frozen-lockfile`     | PASS, 572 packages                                                          |
| `bun audit`                         | PASS, zero advisories across 649 packages                                   |
| `bun run typecheck`                 | PASS                                                                        |
| `bun run lint`                      | PASS                                                                        |
| `bun run format:check`              | PASS                                                                        |
| `bun run test`                      | PASS, 32 files / 312 tests                                                  |
| `bun run test:db`                   | PASS, 63 tests                                                              |
| `bun run test:toolchain`            | PASS, 26 tests                                                              |
| `bun run preflight:schema-contract` | PASS, local contract                                                        |
| `bun run build`                     | PASS with test `.invalid` values only                                       |
| `bun run check:client-bundle`       | PASS, 40 files                                                              |
| `bun run smoke:runtime`             | PASS, `/`, `/auth`, manifest                                                |
| `bun run test:e2e`                  | PASS, 157 passed / 5 skipped, Chromium and WebKit                           |
| Prettier for workflow YAML          | PASS                                                                        |
| `actionlint`                        | SKIPPED, not installed; YAML parser and structural/security tests were used |

All required E2E runs used the local mock backend; five existing conditional skips remained. No errors. Environment values were synthetic; hosted Supabase was not used.

## 5. Hosted GitHub CI

The branch was pushed without force push. Draft PR [#1](https://github.com/MiolesBlues/progress-tracker/pull/1) was opened from `ci/github-actions-setup` to `main`; it was not auto-merged. GitHub reported base SHA `2bddc62fe82f6672a9ab1b15c671bc196911d90d` and opening head SHA `5a9863fbb01375728c4dba21583008c6600f9cc9`.

For that head, run [41135368845](https://github.com/MiolesBlues/progress-tracker/actions/runs/41135368845) ended `startup_failure` with no jobs. PR diagnostics also returned empty `checks`, `statuses`, and `jobs`. Hosted CI was **FAIL/BLOCKED** because required jobs did not run; local results were not hosted PASS. The earlier run for `main` had the same outcome. Evidence did not identify the exact cause. PR diagnostics for final SHA `03a8d5554bf895e8c762883a50fca1fb0697450a` again had empty checks/statuses/jobs; no hosted PASS was confirmed for it.

## 6. External deployment and merge gate

No deployment workflow was found in the repository; an older workflow was build-only. Lovable connector showed the project unpublished but did not reveal linked branches or integration triggers. GitHub webhook/deployment endpoints and Cloudflare settings were not checked. Lovable/Cloudflare external triggers remained **NOT VERIFIED**.

Main merge was **BLOCKED** pending confirmed hosted CI, required-check configuration, and review of external publication triggers. Production deployment was **NO-GO**, requiring separate database release approval, verified restore, and V4 rehearsal.

## 7. Remaining actions recorded

1. Push only `ci/github-actions-setup` and inspect actual GitHub Actions runs.
2. If startup fails again, have the owner inspect Actions and runner/billing/organization policies; the original exact cause remained unknown.
3. Check Lovable branch sync and Cloudflare deployment triggers in their dashboards.
4. After hosted CI passes and deployment safety is confirmed, repeat merge rehearsal from current `origin/main`, then prepare a PR to `main`. This stage did not merge or deploy production.
