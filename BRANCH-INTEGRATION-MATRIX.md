# Progress Tracker branch decision matrix (historical snapshot)

> This matrix records a review of repository refs at the time of the canonical integration. It is not a current branch inventory.

The canonical base was `db07b889b55d42501872ae303fcb70bbb735c7d0`; the selected code result was `integration/canonical-release-candidate` (`760252d`), followed only by documentation commits. Decisions used ancestry, code comparison, and then-current regression tests, not branch names/dates alone. Original refs remained available.

## Local branches

| Branch / original HEAD                                | Decision                                                 | Basis recorded in review                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `backup/main-pre-merge-20261019` / `c2d41ef`          | Preserve as historical checkpoint                        | Ancestor of integration; does not contain later phases.                                                 |
| `feature/centered-day-dialog` / `e746ab2`             | Behavior included                                        | Current `e2e/centered-day-dialog.spec.ts` is in Chromium/WebKit suite.                                  |
| `feature/centered-exercise-dialog` / `697bef1`        | Behavior included                                        | Current E2E spec checks dimensions and theme.                                                           |
| `feature/compact-record-sort` / `9a86941`             | Included and extended                                    | Compact sorter, server pagination, exact sorting covered by entries-page and E2E.                       |
| `feature/compact-workout-logs` / `e6008ca`            | Final tip reverted accordion variant                     | `e6008ca` restored compact row instead of `7d3615e` table; final behavior matches compact log.          |
| `feature/light-blue-palette` / `fba39fc`              | Not transferred; preserve as visual option               | Phase 4 had validated current palette/contrast; branch changes shared tokens and many pages.            |
| `feature/per-set-workout-v4` / `42bbe30`              | Logic included; early UI changes superseded              | Per-set V4 exists in canonical code; replaying old WorkoutForm risks UUID/retry invariants.             |
| `feature/system-theme` / `f0b0ed0`                    | Included and strengthened                                | Current system/light/dark, prepaint, and `e2e/theme.spec.ts`.                                           |
| `fix/analytics-and-release` / `509a88d`               | Behavior included                                        | Auth UX and release checks were already in code/contracts; old full tree not transferred.               |
| `fix/dev-staging-opt-in` / `db07b88`                  | Canonical base                                           | Includes Phase 1–5B.1 and Track A; snapshot removed by the next commit.                                 |
| `fix/pt-01-06-08-13` / `2bddc62`                      | Superseded; preserve dirty copy                          | Phase fixes are in canonical ancestry; unique dirty state preserved in external snapshot.               |
| `fix/pt-02-04-integrity` / `2bddc62`                  | Superseded                                               | PT-02/03/04 entered Phase 1–2; tip matches main.                                                        |
| `fix/security-and-program` / `58b7271`                | Correctness superseded; exclude nested project           | Account switching/program retry covered by Phase 4/5A; later work superseded behavior.                  |
| `fix/v2-release-hardening`                            | Preserve both sides; do not blindly cherry-pick          | Local and remote histories diverged; see the detailed decision below.                                   |
| `fix/workout-data-integrity` / `85c3067`              | Superseded                                               | Idempotent save/draft lifecycle covered by Phase 1–2 and later E2E.                                     |
| `integration/canonical-release-candidate` / `760252d` | Candidate at review time                                 | Forward commit from the verified integration.                                                           |
| `integration/clean-merge-20261019` / `274c7d2`        | Preserve as historical integration                       | Code line was ancestor/source of later merges; phase requirements cover its current fixes.              |
| `integration/final-main-merge-20261019` / `2bddc62`   | Superseded                                               | Matches protected main; lacks later phases.                                                             |
| `integration/merge-all-branches-20261019` / `d7442f3` | Preserve historical merge                                | Security/data changes superseded by a later verified phase sequence.                                    |
| `integration/phase1-phase2-release` / `cb122e3`       | Included as ancestor                                     | Phase 1–2 changes retained in history.                                                                  |
| `integration/ui-updates` / `9a1b13d`                  | Needed behavior included; do not cherry-pick old commits | Dialogs, theme, compact sorting, and E2E exist; copying full old components would undo integrity fixes. |
| `main` / `2bddc62`                                    | Protected; not merged in this review                     | Left unchanged.                                                                                         |
| `phase3/runtime-ci-acceptance` / `96d8d7a`            | Included as ancestor                                     | Runtime/CI acceptance exists in canonical history.                                                      |
| `phase4/product-hardening` / `2978591`                | Included as ancestor                                     | PT-09/11/12/14–20 implemented or explicitly documented in that phase.                                   |
| `phase5a/functional-integrity` / `fecbef5`            | Included as ancestor                                     | PT-07/11/15/16 and regressions retained.                                                                |
| `phase5b/database-recovery` / `cee802d`               | Included as ancestor                                     | Recovery contract retained.                                                                             |
| `phase5b1/recovery-acl-remediation` / `15cad66`       | Included as ancestor                                     | ACL/preflight remediation retained.                                                                     |
| `track-a/recovery-infrastructure` / `a98b069`         | Included as ancestor                                     | Synthetic recovery tooling and limits retained.                                                         |

## Divergent `fix/v2-release-hardening`

Local-only commits: `2e24e13`, `53c79d1`, `9598d28`, `15b5945`. Remote-only commits: `884cb3b`, `fadb567`, `b5b3349`, `66cd2d5`, `a38df43`, `7fd66ae`, `33cf9cb`, `a541ec6`, `5ba4f3d`. Neither side was deleted; no force push/rebase was used.

The training-library migration, `src/lib/training-library.ts`, and onboarding in the local template commit matched the canonical base. Later code added safe program creation, fail-closed environment contract, release schema checks, and network/account tests. Remote-only Vite changes hard-coded the public backend; ProgramManager changes simplified pending operations. They were not transferred because they conflict with current environment and retry-safety requirements.

## Unresolved unique UX option

The `feature/light-blue-palette` palette was not transferred: current contrast/themes had been validated, and changing the shared visual language needed a product decision. The branch and commits were preserved; transfer to main was not recommended before UX review.
