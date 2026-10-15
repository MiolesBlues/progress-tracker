<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

# Project rules

- UI is Russian-only, mobile-first, dark single theme — target audience is iPhone users.
- Data access goes through the browser client with strict per-user RLS (`auth.uid() = user_id`); no shared/global training data — users must be fully isolated.
- The user creates 1–7 personal active days via `setup_program` after signup. Days use `program_days.id`, exercises use `day_id`. Upper/Lower is an optional four-day template, never a fixed domain model; there is no automatic signup seed trigger after migration 0002.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate) — session is in localStorage.
- Program day management uses a controlled Sheet separate from the exercise list, sharing the existing user-scoped mutations and query invalidation so editing never introduces a second storage path.
- The program selector remembers only an active day per user; archived days/exercises remain in management and history. The entries diary includes legacy NULL-day exercises and renders at most 20 cards per UI page over the complete history.
- Disable sortable activators during program mutations. Exercise editor errors belong inside its Sheet. New exercises with a day must pass the owner-locked active-day INSERT guard; editing existing archive rows does not rewrite history.
- Pure metric math lives in `src/lib/workout.ts`; session-relative comparisons and date bounds live in `src/lib/analytics.ts`. Compare only the selected user's exercise and earlier `(performed_on, created_at, id)` records. Volume is not a guaranteed measure of strength.
- Program exercises are soft-deleted via `archived_at` (no DELETE grant/policy); workout_entries FKs are RESTRICT, incl. composite (exercise_id, user_id) — history must never be lost or cross-linked.
- Personal query keys start with `['user', userId]`; use AbortSignal and the account boundary. Token refresh for the same identity must preserve drafts. Drafts and stable save-operation UUIDs are scoped to user/exercise.
- SQL in `drizzle/migrations/` is the source of truth; the journal includes the timestamped B09 privilege migration. Never run `drizzle-kit push` against an existing database: the declarative schema/snapshots are placeholders. No production migration or legacy-data repair without explicit user confirmation; run read-only preflight and isolated SQL tests first.
- Before committing, run typecheck, lint, unit tests, SQL tests, toolchain tests, production build and dependency audit. Browser tests intercept every external request and do not prove production JWT/RLS correctness. Follow `docs/E2E-RELEASE-RU.md` on isolated staging before release.
- Use LF per `.gitattributes` and Prettier. Keep bulk formatting in its own commit. Do not edit or scan the unrelated nested project directory. Never deploy or merge automatically.
- Public backend URL/publishable key are also set as fallbacks in `vite.config.ts`, because the root `.env` is git-ignored and hosted builds otherwise ship without them (blank screen).
