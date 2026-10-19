-- B09: table-wide TRUNCATE bypasses RLS. Keep existing DML/RPC and service_role grants.
-- Apply only after separate approval for the target database; no user rows are changed.
REVOKE TRUNCATE ON TABLE
  public.program_days,
  public.program_exercises,
  public.workout_entries
FROM PUBLIC, anon, authenticated;
