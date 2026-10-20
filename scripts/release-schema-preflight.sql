-- Supplemental legacy baseline probe only. The canonical capability gate is
-- scripts/release-schema-preflight.mjs, which also checks V4, ACLs and RPCs.
-- Catalogs and non-identifying violation flags only. PostgreSQL 17+.
BEGIN READ ONLY;
SELECT c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('program_days','program_exercises','workout_entries');

SELECT table_name,column_name,udt_name,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public'
AND table_name IN ('program_days','program_exercises','workout_entries') ORDER BY table_name,ordinal_position;

SELECT * FROM pg_policies WHERE schemaname='public'
AND tablename IN ('program_days','program_exercises','workout_entries') ORDER BY tablename,policyname;

SELECT conrelid::regclass AS table_name,conname,convalidated,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid IN ('public.program_days'::regclass,'public.program_exercises'::regclass,'public.workout_entries'::regclass)
ORDER BY conrelid,conname;

SELECT * FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('program_days','program_exercises','workout_entries') ORDER BY tablename,indexname;

SELECT tgrelid::regclass AS table_name,tgname,pg_get_triggerdef(oid) AS definition FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid IN ('public.program_days'::regclass,'public.program_exercises'::regclass,'public.workout_entries'::regclass);

SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.proargnames,
  p.prorettype::regtype AS result_type,p.pronargdefaults,p.prosecdef,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
AND p.proname IN ('setup_program','reorder_program_days','reorder_program_exercises','save_workout_entry','lock_program_owner','guard_program_days','snapshot_entry_day','valid_workout_reps');

SELECT to_regclass('supabase_migrations.schema_migrations') AS supabase_journal,
  to_regclass('drizzle.__drizzle_migrations') AS drizzle_journal;

SELECT
  EXISTS(SELECT 1 FROM public.program_exercises WHERE day_id IS NULL) AS legacy_null_day_exists,
  EXISTS(SELECT 1 FROM public.workout_entries WHERE NOT public.valid_workout_reps(reps)) AS invalid_reps_exists,
  EXISTS(SELECT 1 FROM public.program_exercises WHERE example_reps IS NOT NULL AND NOT public.valid_workout_reps(example_reps)) AS invalid_examples_exist,
  EXISTS(SELECT 1 FROM public.program_exercises e WHERE e.day_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.program_days d WHERE d.id=e.day_id AND d.user_id=e.user_id)) AS invalid_exercise_day_exists,
  EXISTS(SELECT 1 FROM public.workout_entries w WHERE NOT EXISTS(SELECT 1 FROM public.program_exercises e WHERE e.id=w.exercise_id AND e.user_id=w.user_id)) AS invalid_entry_exercise_exists,
  EXISTS(SELECT 1 FROM public.workout_entries w WHERE w.day_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.program_days d WHERE d.id=w.day_id AND d.user_id=w.user_id)) AS invalid_entry_day_exists,
  EXISTS(SELECT 1 FROM public.workout_entries WHERE NOT (weight BETWEEN 0 AND 2000 AND weight=round(weight,2))) AS invalid_weight_exists,
  EXISTS(SELECT 1 FROM public.workout_entries WHERE rir IS NOT NULL AND NOT (rir BETWEEN 0 AND 10 AND rir=round(rir,1))) AS invalid_rir_exists,
  EXISTS(SELECT 1 FROM public.program_exercises WHERE working_weight IS NOT NULL AND NOT (working_weight BETWEEN 0 AND 2000 AND working_weight=round(working_weight,2))) AS invalid_program_weight_exists;
COMMIT;
