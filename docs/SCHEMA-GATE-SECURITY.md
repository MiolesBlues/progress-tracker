# Security of the manual schema gate (historical review)

> Reviewed 5 November 2026. This report records workflow configuration and review evidence from that date; it does not establish current hosted state.

`release-schema-preflight.yml` ran hosted checks only when manually dispatched on ref `main`. PRs, feature refs, pushes, and reusable workflows did not receive the DB URL and did not run the job. Full synthetic regression remained in `quality.yml` without hosted credentials.

Actions were pinned to full SHAs, checked on 5 November 2026 against official GitHub tag refs:

| Action               | Tag    | Commit                                     |
| -------------------- | ------ | ------------------------------------------ |
| `actions/checkout`   | v6.1.0 | `d23441a48e516b6c34aea4fa41551a30e30af803` |
| `actions/setup-node` | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| `oven-sh/setup-bun`  | v2.2.0 | `0c5077e51419868618aeaa5fe8019c62421857d6` |

Each pin was resolved from `https://api.github.com/repos/<owner>/<repo>/git/ref/tags/<tag>`; the tag object type was `commit` and its SHA matched the pin. This records the selected version's origin; reviewing action source is not a complete supply-chain certification.

The GitHub token had only `contents: read`; checkout did not persist credentials. Node, Bun, and runner matched the quality workflow. Installation used frozen lockfile and `--ignore-scripts`. The DB URL was passed only to the read-only preflight step, not setup/install.

Limitations: step-scoping reduces secret exposure but does not isolate a step from an already compromised shared runner. An immutable verified action pin is a separate control. The script's read-only transaction does not turn an administrative credential into a least-privilege role.

Before a separately authorized hosted run, the owner must confirm a least-privilege DB role and protections for main, workflow dispatch, and secrets. Actual privileges of the secret URL and GitHub environment protections were not checked or changed. The schema workflow was not run during remediation; production/staging state remained UNKNOWN.
