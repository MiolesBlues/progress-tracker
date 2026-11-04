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

- UI supports Russian and English, is mobile-first, and supports Light, Dark, and System appearance modes across iPhone and desktop.
- Data access goes through the browser client with strict per-user RLS (`auth.uid() = user_id`); no shared/global training data — users must be fully isolated.
- Signup does not create a program. Onboarding lets each user start with an empty 1–7 day program or choose an optional published template; do not restore the deprecated signup trigger.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate) — session is in localStorage.
- Metric/week-comparison math lives in `src/lib/workout.ts` with tests — keep it pure and tested.
- Program days and exercises are archived by default. Separately confirmed permanent deletion is available only for archived objects through owner-checked RPCs; exercise deletion removes its own history and records tombstones. Workout-entry ownership FKs are RESTRICT, including composite owner references. Account deletion is a separate lifecycle decision and is not implemented by these archive RPCs.

## CI and verification

- For each change, run the fastest relevant local checks first, then commit the verified change.
- Push only when the task explicitly authorizes pushing and only to the approved working branch. Never push directly to `main` unless explicitly requested.
- After an authorized push, verify the GitHub Actions run for the exact pushed SHA. Do not describe local checks as hosted CI results.
- Treat the GitHub Actions Playwright job as the default full E2E executor after an authorized push. Run the full local Playwright suite only for targeted debugging or when GitHub Actions cannot run.
- If hosted E2E fails, inspect the failing job logs, fix the underlying issue, and rerun CI before reporting completion.
- CI tests must use the local mock backend and synthetic `.invalid` Supabase URLs. Never use production or staging credentials, hosted migrations, seeds, or deployment steps in CI.
