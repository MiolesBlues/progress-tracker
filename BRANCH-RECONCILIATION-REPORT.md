# Progress Tracker branch reconciliation report (historical snapshot)

## Result

This read-only reconciliation reviewed branch `integration/canonical-release-candidate`, HEAD `d084b38bbb4e19e78fa8a0b5a608b9b09aa840cb`, on 30 October 2026. No code, branch tips, or hosted infrastructure were changed. No commit, temporary reconciliation branch, deletion, reset, clean, cherry-pick, merge, or push occurred.

## 1. Verified state and preservation

- Repository: `C:\Users\vitvl\Code\progress-tracker`.
- Live remote: `https://github.com/MiolesBlues/progress-tracker`.
- `git fetch origin '+refs/heads/*:refs/remotes/origin/*'` ran without prune; it updated only tracking refs and did not switch/rewrite local historical branches.
- After fetch: 30 local branches and 29 GitHub branches. All refs were checked. `stash@{0}` (`pre-merge-user-work-2026-10-19`) remained. `git worktree list --porcelain` showed 13 registered worktrees; all were already in the primary or external archive location before fetch.
- Snapshot `C:\Users\vitvl\ProgressTracker-Recovery\snapshot-20261030` was available. SHA-256 manifest matched sidecar `PRESERVATION-MANIFEST.sha256`: `4aa9efe5f900bdba2756203446ba991f36f6a1499fb5ace92f086091a112fac6`. Preservation report recorded 339,052/339,052 entries and zero hash failures; bundle contained 72 refs.
- Existing `ALL-BRANCHES-AUDIT.md`, `MAIN-MERGE-REHEARSAL.md`, and `FINAL-MAIN-MERGE-GATE.md` were left unchanged. This reconciliation report was the only created file. `.env.local` was ignored and was not read/changed.
- Initial/final HEAD matched. No commit or temporary reconciliation branch was created. No deletion, reset, clean, cherry-pick, merge, push, or deployment occurred.

## 2. `fix/v2-release-hardening` graph

- Local tip: `15b594585dce2c7e20ab19a5d9f772878f1c2cd1`.
- GitHub tip: `5ba4f3d93bef6d299c2e6ea208b6dc27dc9b29f2`.
- Recomputed merge base: `e644c9c4cf404f4a893747a67601231330857db9`.
- `git rev-list --left-right --count local...origin`: **4 / 9**.
- Each line's merge base with canonical was `c2d41efa81921c3dc8f43618c912bb82f32a489a`; `canonical...local` was **42 / 48**, `canonical...remote` **42 / 53**. Thus 4/9 are commits diverging after the two branch tips' common point; older shared-by-those-branches commits remain unique relative to canonical and are accounted for in the full branch matrix/semantic audit.
- All 13 divergent commit SHAs remained available through local/remote refs and the preservation bundle.
- The earlier `ALL-BRANCHES-AUDIT.md` had used `c2d41ef` as merge base for the two tips; recomputation after fetch produced `e644c9c`, used for this report and later checks.

### Disposition recorded for unique work

Four local-only commits were assessed as already implemented in canonical, with source/test evidence:

| Local-only change                                                                                                                                      | Canonical evidence                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2e24e13940ada4c9fd3f36e58468cad299e20838` — safe permanent deletion of archived objects, preserve history, retry save/delete after ambiguous response | `src/lib/archive-deletion.ts`, `src/components/program-manager.tsx`, migration `20261015202500_archived_object_deletion.sql`, `src/lib/save-workout.ts`; archive deletion E2E/DB/UI and save tests. |
| `53c79d1421762de7dcad800ad4303d09d3576847` — reproducible toolchain, authenticated i18n tests, provider separation, retry helper                       | `package.json`, `bun.lock`, `src/lib/i18n.ts`, tests, `src/lib/pending-rpc.ts`; toolchain/i18n/workout/program checks.                                                                              |
| `9598d2806b63c5d4e5151425f8e5a5f2a892d57e` — RU/EN accessibility, SSR language/error checks, V3 release verification                                   | Accessibility/i18n tests, `src/lib/error-page.ts`, `src/server.ts`, SSR tests, `e2e/accessibility-i18n.spec.ts`.                                                                                    |
| `15b594585dce2c7e20ab19a5d9f772878f1c2cd1` — versioned workout template library and atomic application                                                 | `docs/training-library/strength-templates.v1.json`, migration `20261016150000_training_template_library.sql`, `src/lib/training-library.ts`, onboarding, DB/E2E tests.                              |

No cherry-pick was needed. The remote-only line included removal of generated TS RPC types (a workaround for disagreement); canonical contained current RPC types and capability/error checks. A hard-coded public backend fallback to `jbxbgcqaywkbnsohjzcx` was intentionally excluded as it violated the environment identity/explicit contract; the product goal was addressed through environment configuration. Other remote-only changes were implemented in current form or were stale types, temporary RPC wrapper, formatting, roadmap text, or merge topology. No remote-only SQL migration was found. Canonical contained archive deletion and training library migrations; V4/release contract was present, but production application remained a separate blocked release gate.

The full original table assessed all 13 unique commits with SHA, origin, behavior, canonical equivalent, tests, disposition, and evidence. See this report's recorded branch history alongside the [branch matrix](BRANCH-INTEGRATION-MATRIX.md); no patch was moved by this review.

## 3. Other branches

The audit checked all remaining local/remote refs against canonical ancestry and current implementation/tests. Branch classifications and decisions are in [ALL-BRANCHES-AUDIT.md](ALL-BRANCHES-AUDIT.md) and [BRANCH-INTEGRATION-MATRIX.md](BRANCH-INTEGRATION-MATRIX.md). This did not authorize deleting any historical refs or resolving the divergent line by rewriting history.

## 4. Checks recorded for this stage

| Check                                    | Result recorded                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Git baseline/branch/ref inventory        | PASS; HEAD unchanged                                                                                                          |
| Fetch                                    | Tracking refs updated without prune; local historical refs preserved                                                          |
| Typecheck/lint/format and targeted tests | PASS where run; full command/result details were in the original report                                                       |
| `bun run test:db`                        | PASS, 63 tests including V4, library, archive deletion, privileges, RLS                                                       |
| `bun run preflight:schema-contract`      | PASS, local contract only; not hosted preflight                                                                               |
| Build                                    | PASS with synthetic `test`/`.invalid` values; first staging-env attempt was stopped by guard as intended                      |
| `bun run smoke:runtime`                  | PASS for `/`, `/auth`, manifest using synthetic env                                                                           |
| Full E2E                                 | Prior run on same source HEAD: 157 passed, 5 skipped, 0 failed, Chromium/WebKit; not rerun in this stage                      |
| `bun audit`                              | Not run in this stage; prior final gate on same HEAD had 18 advisories (6 high, 11 moderate, 1 low), with no risk disposition |

Tests created/updated ordinary ignored build artifacts; tracked files were not changed. Hosted Supabase was not contacted.

## 5. Git cleanliness and final refs

- Canonical branch/HEAD remained `integration/canonical-release-candidate` / `d084b38bbb4e19e78fa8a0b5a608b9b09aa840cb`.
- Commits created/transferred: none.
- Reconciliation branch: not created because no ports were needed.
- Historical local tips unchanged. Tracking refs updated by fetch; live GitHub refs unchanged.
- Expected final status contained four untracked preserved reports: `ALL-BRANCHES-AUDIT.md`, `MAIN-MERGE-REHEARSAL.md`, `FINAL-MAIN-MERGE-GATE.md`, and `BRANCH-RECONCILIATION-REPORT.md`. Worktree was not described as clean; stash and external archived worktrees were untouched.

## 6. Limits and conclusion

`INTEGRATED`/`SEMANTICALLY SUPERSEDED` reflected checking canonical source/tests, not transferring Git patches. The remote line's legacy hard-coded backend was intentionally not restored. If that backend is still required, define a new safe environment contract rather than cherry-picking the fallback.

`bun run format:check` remained FAIL because of three previously created untracked reports; their content was not edited. The new reconciliation table was checked/formatted separately. A GO from this task could authorize preparing a local merge rehearsal, not merging to main or deploying. Independent blockers in `FINAL-MAIN-MERGE-GATE.md` remained.

The report concluded branch reconciliation was complete and canonical semantically covered listed branches, permitting a separate isolated merge rehearsal. No main merge, push, or deployment occurred.
