<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Do not rewrite published Git history: force-pushing, rebasing, amending, or squashing published commits can disrupt the project's Lovable history.
>
> Commits pushed to the connected branch synchronize with Lovable and appear in its editor. Preserve the branch's working state.

<!-- LOVABLE:END -->

# Required project rules

- The interface supports English and Russian, mobile layouts, and Light, Dark, and System themes.
- User data is isolated. Client requests use Supabase; PostgreSQL RLS and owner checks provide the final access boundary. Do not create shared user workout data.
- Registration does not automatically create a program. During setup, a user may create a personal program with 1–7 days or choose an optional published template. Do not restore the removed automatic-program trigger.
- Authenticated pages are in `src/routes/_authenticated/` and run without SSR; Supabase Auth state is stored in browser storage.
- Keep workout and comparison calculations as pure functions in `src/lib/workout.ts` and cover them with focused tests.
- Days and exercises are archived by default. Separately confirmed permanent deletion is available only for archived objects through owner-checking RPCs. Deleting an exercise deletes its history and leaves tombstones to prevent old operations from being replayed. Entry foreign keys restrict deletion of owned rows. Account deletion is a separate lifecycle and is not implemented by these RPCs.

## Context and code review

Before each development task:

1. Read this `AGENTS.md` and `docs/PROJECT_CONTEXT.md`.
2. Read the relevant sections of `docs/ARCHITECTURE.md` and ADRs in `docs/DECISIONS/`.
3. Inspect the actual affected source before editing.

Documentation helps locate code but does not prove behavior. If it conflicts with source, investigate and report the discrepancy; do not implement blindly from stale text.

Update context and ADRs when product capabilities, domain behavior, architecture boundaries, data model, API, authorization, deployment model, or accepted decisions materially change. Documentation updates are not needed for small CSS/text changes, routine fixes, or refactors that do not change architecture. Update the existing section first; do not duplicate content.

## Git branch policy

- Before edits, check Git status, current branch, task scope, and suitable active branches/worktrees. Use a safe branch named by the user. Continue a suitable active branch for the same task instead of creating a duplicate. Read-only investigation does not need a branch.
- Do not make ordinary changes directly on `main`. For a new task, use current `origin/main` as the base and create one short-lived `<category>/<task>` branch based on the main goal: `frontend/`, `backend/`, `database/`, `testing/`, `infra/`, `security/`, `docs/`, `refactor/`, `hotfix/`, or `ios/`. Use a short lowercase hyphenated slug; avoid names such as `fix1`, `temp-work`, or `final-final`.
- One independent task uses one topic branch. Related cross-layer changes may share a branch when they form one coherent feature; record affected areas. Do not create permanent `frontend`/`backend` branches. Base new branches on `main`, not another feature branch, unless a dependency is explicitly justified.
- Use the primary checkout and `progress-tracker-features` directory. Do not create worktrees for sequential small tasks; use them only for independent parallel tasks. Do not use Recovery as a work directory or modify the archived Git system.
- Do not commit, open PRs, push, merge, delete branches, force-push, or rewrite history without explicit user authorization. Do not change production Supabase or deploy without separate authorization.
- Before implementation, record scope, category, current branch, affected modules, and required checks. For database changes review migrations, contracts, and compatibility; for UI review relevant responsive behavior; for backend review authorization, validation, and idempotency.

## Local testing policy

- Choose the smallest useful checks based on changed files and risk. Check `package.json`, test configuration, and workflow for real scripts and arguments. Do not invent commands or disable checks to get a pass.
- For TypeScript, use typecheck; for changed TS/TSX, targeted ESLint and Prettier where supported; for logic, focused Vitest tests; for database changes, focused SQL/PGlite tests; for CI, YAML/actionlint if available. Run a quick build when changing build configuration, imports, SSR, or runtime.
- By default, do not run all Playwright shards, the full Vitest or SQL/PGlite suite, repeated full production builds, or long regression suites locally. GitHub Actions runs full regression. For bug diagnosis, test-infrastructure changes, unavailable CI, or a direct user request, begin with the smallest useful reproduction.
- Do not change tests just to get a green result, hide failures with `continue-on-error`, increase flaky-test retries without justification, or bypass required checks. Preserve necessary logs and traces for diagnosis.

## GitHub Actions and CI security

- The complete regression source is the existing `.github/workflows/quality.yml`: Code Quality, Unit Tests, Database & Contracts, Build & Security, four Playwright shards for Chromium and WebKit, and the stable aggregate check. Do not change CI architecture without a concrete task need.
- Fast local checks are not CI results. After an authorized push, record the SHA and check GitHub Actions for that version. Account for `scripts/ci-event-router.mjs`: a push run may skip duplicate checks when a PR is open; that is not PASS. Confirm a separate PR run covers the current PR head, wait for required checks, and do not claim PASS from an old SHA.
- On CI failure, inspect the first real error and its logs, fix the cause, and rerun CI on a new SHA. Skipped checks are not successful required checks.
- CI tests use a local mock backend and synthetic Supabase URLs ending in `.invalid`. Do not use production/staging credentials, hosted migrations, seeds, or deployments in CI.
- Do not push without explicit authorization, and push only to the agreed working branch. Never push directly to `main` without a separate direct request. After an authorized push, check the Actions run for that SHA; do not present local checks as hosted CI.

## Agent report

At the end of each task, briefly report branch, scope, changed files, local checks and unverified areas, Git status, whether context/ADRs changed and why, and whether a PR is needed. Include a commit SHA only if a commit was actually created.

See [the approval-gated agent workflow](docs/AGENT_WORKFLOW.md) for planning, approval, and agent-role rules.
