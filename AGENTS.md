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
- Each new user gets a default Upper/Lower program via a trigger on signup; the program template lives in that DB function — keeps seeding atomic with account creation.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate) — session is in localStorage.
- Metric/week-comparison math lives in `src/lib/workout.ts` with tests — keep it pure and tested.
- Program exercises are soft-deleted via `archived_at` (no DELETE grant/policy); workout_entries FKs are RESTRICT, incl. composite (exercise_id, user_id) — history must never be lost or cross-linked.
