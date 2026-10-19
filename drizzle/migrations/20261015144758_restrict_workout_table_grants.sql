-- B09: normalize only the three application tables, including previously granted
-- TRUNCATE / REFERENCES / TRIGGER / MAINTAIN and unneeded DELETE.
-- App operations and SECURITY INVOKER RPCs need SELECT, INSERT and UPDATE.
-- service_role, RLS, other tables, functions and creator-wide defaults are untouched.
REVOKE ALL PRIVILEGES ON TABLE
  public.program_days, public.program_exercises, public.workout_entries
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.program_days, public.program_exercises, public.workout_entries
  TO authenticated;
