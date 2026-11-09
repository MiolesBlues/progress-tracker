# Progress Tracker Git branch topology (historical snapshot)

**Snapshot date:** 30 October 2026. **Repository:** `https://github.com/MiolesBlues/progress-tracker.git`.

This report records the branch topology observed on that date. It does not describe current branches.

## Canonical line

| Role                                      | Branch / SHA                                                          | Relationship                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Protected main                            | `main` — `2bddc62fe82f6672a9ab1b15c671bc196911d90d`                   | Common ancestor of early branches; unchanged in this review.                                   |
| Full Phase 1–5B.1 and Track A integration | `fix/dev-staging-opt-in` — `db07b889b55d42501872ae303fcb70bbb735c7d0` | Descended from Track A `a98b069`; all listed phases were ancestors.                            |
| Canonical candidate                       | `integration/canonical-release-candidate` — then-current HEAD         | Based on `db07b88`; `760252d` removed a nested snapshot, later commits contained reports only. |

A new linked worktree was created at `C:\Users\vitvl\Code\progress-tracker`, alongside existing copies. It did not replace them. All original worktrees remained registered, and local `main` and existing `origin/*` refs were not switched. The ancestry of `phase4/product-hardening` (`2978591`), `phase5a/functional-integrity` (`fecbef5`), `phase5b1/recovery-acl-remediation` (`15cad66`), `track-a/recovery-infrastructure` (`a98b069`), and `fix/dev-staging-opt-in` (`db07b88`) was checked; each was an ancestor of the candidate.

## GitHub and divergence

A read-only fetch of the current remote used the separate `refs/remotes/recovery-20261030/*` namespace; existing remote refs were not overwritten. The canonical GitHub URL was checked. Before the fetch, the known integrated tip `db07b88` matched GitHub's `fix/dev-staging-opt-in`.

At the time, the shared object store had 30 local branches (29 original plus the candidate), 29 original `origin` branches, and 29 fresh `recovery-20261030` branches. Divergence in `fix/v2-release-hardening` was confirmed: local tip `15b5945`, GitHub tip `5ba4f3d`; the local line was four commits ahead and nine behind.

Both sides were preserved: the original local branch, `refs/remotes/origin/fix/v2-release-hardening`, and the fresh remote tip at `refs/remotes/recovery-20261030/fix/v2-release-hardening`. No merge, rebase, force push, or history rewrite was performed.

## History preservation

- The original 29 local branch refs were not removed or moved.
- The remote metadata fetch added a separate refs namespace.
- Snapshot `C:\Users\vitvl\ProgressTracker-Recovery\snapshot-20261030` contains `all-refs.bundle`. Its manifest/report record 339,052 SHA-verified files and zero errors. Restoring a sample worktree from the bundle produced an exact match of 36 Git status lines.
- `git fsck --no-reflogs --unreachable` found no unreachable commit objects; only unused tree/blob objects were present.
- The `refs/stash` stash was preserved. Its restoration from the bundle had previously been checked by a separate fetch.

## Working-tree state

The original main clone at `C:\Users\vitvl\Code\project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574` was left unchanged, including a modified `.env` and an untracked nested directory. Dirty worktrees were not modified. In the new worktree, `.env` was not tracked; source integration branch `db07b88` contained only tracked application files and no root `.env`.
