# ADR 0004: Short-lived topic branches and SHA-specific CI checks

- Status: Accepted
- Recorded: 4 November 2026

## Context

Application, database, and CI changes need isolated review. A workflow may skip a duplicate push run when a PR is already open, so local tests alone do not replace GitHub Actions evidence.

## Decision

Use one short-lived `<category>/<task>` branch from current `main` for each independent task. Do not commit directly to `main`. Creating commits, PRs, pushing, merging, and deleting branches requires explicit authorization for the task. After an authorized push, verify required PR checks on the exact head SHA; a skipped push workflow is not a passing regression run.

Run the full regression suite in the existing GitHub Actions workflow. Run the smallest relevant local checks; CI uses a local mock backend and synthetic `.invalid` URLs.

## Consequences

- Reports identify the branch, SHA (if a commit exists), local checks, and hosted CI separately.
- Change CI architecture only for a specific, testable reason.
- This policy does not authorize hosted resource changes or sending code without separate authorization.

## Evidence

`AGENTS.md`, `.github/workflows/quality.yml`, `scripts/ci-event-router.mjs`, and `package.json`.
