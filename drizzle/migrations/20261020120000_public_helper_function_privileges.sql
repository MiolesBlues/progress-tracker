-- Restrict internal helpers that inherited Supabase's historical PUBLIC
-- EXECUTE defaults. Trigger invocation and CHECK constraints are exercised
-- by the application contract tests before this migration is considered ready.
BEGIN;

REVOKE ALL ON FUNCTION public.snapshot_entry_day()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.valid_workout_reps(integer[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valid_workout_reps(integer[])
  TO authenticated;

COMMIT;
