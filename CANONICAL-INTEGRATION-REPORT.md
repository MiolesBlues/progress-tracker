# Progress Tracker canonical integration report (historical snapshot)

**Date:** 30 October 2026. This was a local candidate for later review; it was not merged to `main` or pushed to GitHub.

## A. Git state

- Working branch: `integration/canonical-release-candidate`.
- Code result: cleanup commit `760252d`, `chore: remove committed nested project snapshot`; later commits added reports only.
- Cleanup commit parent was verified integration `db07b889b55d42501872ae303fcb70bbb735c7d0` (`fix/dev-staging-opt-in`).
- All Phase 1–5B.1/Track A commits were ancestors of the new HEAD.
- New worktree: `C:\Users\vitvl\Code\progress-tracker`.
- Original 12 worktrees, 29 original local branch refs, stash, and remote refs were preserved. Dirty original copies were not cleaned.
- `main` remained at `2bddc62`; no merge or push occurred.
- Candidate tracked tree had no `.env` or `progress-tracker-final-main-merge-20261019/` directory.

## B. Topology and base selection

`db07b88` followed `b6bb699` (explicit staging opt-in). All phase commits through Track A preceded it. Comparing root trees at `b6bb699` and `db07b88`, excluding the added nested path, showed no other changes. That nested path contained 175 files and 24,642 added lines: 140 files matched root files, 34 copied older code, and `src/lib/error-capture.ts` contained an older unsafe process-global correlator. The current root implementation had replaced request-error handling with a generic request-local approach. A search for env/secret-like filenames in the snapshot found none; file values were not printed.

The nested copy was removed in ordinary follow-up commit `760252d`. Historical `db07b88` and all original refs were retained; history was not rewritten. A path-only check found no `.env`/env-like files or known credential-token formats in the snapshot; this heuristic is not proof that no secrets of any kind exist.

The 29 original local branches and corresponding remote refs were checked; per-branch decisions are in the [integration matrix](BRANCH-INTEGRATION-MATRIX.md). Known divergence in `fix/v2-release-hardening` remained unmerged: local `15b5945` was +4/−9 relative to GitHub `5ba4f3d`. Both lines were available through original refs, separate recovery-fetch namespace, and preservation bundle. The candidate did not include them as ancestors.

## C. Functional integration

The candidate retained these behavior fixes:

- PT-02/03/04: UUID lifecycle, complete set pagination, and multi-tab draft handling.
- PT-07/11/15/16: retry-safe program creation, account-switch guards, localization, exact analytics, and weight sorting.
- PT-01/06/08/13: V4, environment identity, ACL contracts, and schema release preflight.
- PT-05/09/17/20: Wrangler runtime, accessibility, early theme initialization, and SSR error isolation.
- Track A: synthetic recovery and fail-closed restore guards.

UI branches were not cherry-picked wholesale because the required scenarios were already covered in the current tree. The final `compact-workout-logs` tip itself reverted its earlier accordion/table treatment of the previous workout; that experiment was not transferred.

## D. Preservation and source data

Verified snapshot: `C:\Users\vitvl\ProgressTracker-Recovery\snapshot-20261030`, with 339,052 SHA-256-verified files, zero hash failures, and a complete Git bundle of 72 refs. A previous sample restore recovered a dirty copy with matching HEAD and exact Git status (36 lines). Snapshot was outside the repository, with ACL access limited to owner and SYSTEM. Disk encryption was not confirmed.

The primary clone remained dirty (`.env` modified and nested folder untracked); worktree `fix/pt-01-06-08-13` also remained dirty. Their state was included in the preservation snapshot and was not changed here. Other original copies remained in place. No user files were moved or deleted.

## E. Checks

New checks ran in the canonical worktree after `bun install --frozen-lockfile` (Bun 1.4.3):

| Check                               | Recorded result                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`     | PASS, 573 packages                                                           |
| `bun run typecheck`                 | PASS                                                                         |
| `bun run lint`                      | PASS                                                                         |
| `bun run format:check`              | PASS after formatting reports                                                |
| `bun run test`                      | PASS, 32 files / 312 tests                                                   |
| `bun run test:db`                   | PASS, 63 tests                                                               |
| `bun run test:toolchain`            | PASS, 21 tests                                                               |
| `bun run preflight:schema-contract` | PASS, local contract                                                         |
| `bun run check:dependencies`        | PASS                                                                         |
| `bun run audit`                     | FAIL: 18 advisory findings (6 high, 11 moderate, 1 low); see limitations     |
| `bun run build`                     | PASS with safe test project refs/URLs, no `.env`                             |
| `bun run check:client-bundle`       | PASS, 40 files                                                               |
| `bun run smoke:runtime`             | PASS: `/`, `/auth`, manifest through local Wrangler                          |
| `bun run test:e2e`                  | PASS, 157/162; 5 expected skips, 0 failures, Chromium + WebKit, 20.1 minutes |

Hosted schema preflight was intentionally not run because it checks a real endpoint and was unnecessary for local consolidation. Hosted DB, staging, production, and Auth were unchanged.

## F. Remaining risks and release gate

`bun audit` reported 18 findings: high advisories in `undici` and `zod`, and moderate/high advisories in `@vitest/mocker`, `vite`, and other transitives. Dependency versions in the frozen lockfile were intentionally not changed in this integration task. The candidate should not be treated as production-ready until dependencies are updated and the suite rerun.

`fix/v2-release-hardening` diverged, but its unique template-library implementation matched candidate code. Remote changes that hard-coded a backend and simplified pending-operation handling conflict with current protections. Original history was preserved. `feature/light-blue-palette` remained a visual option; its palette was not transferred.

## G. Outcome

The Git candidate was **PASS for consolidating the phase integration and preserving history**: full E2E completed with 157 PASS / 5 expected SKIP / 0 failures. It was **NO-GO for merge to main/production release on the available evidence**: dependency advisories needed resolution, the suite needed rerunning after updates, and the unique palette needed separate review. No hosted actions were performed for this candidate.
