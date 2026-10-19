-- READ ONLY, compatible with schema 0003; run and review before migration 0004.
BEGIN TRANSACTION READ ONLY;
SELECT id, user_id, exercise_id, performed_on,
  to_json(reps) AS reps, weight, rir,
  (coalesce(array_ndims(reps) = 1 AND array_lower(reps,1) = 1 AND cardinality(reps) BETWEEN 1 AND 20, false)
    AND NOT EXISTS (SELECT 1 FROM unnest(reps) AS t(r) WHERE r IS NULL OR r < 0)) AS reps_valid
FROM public.workout_entries
WHERE NOT coalesce(array_ndims(reps) = 1 AND array_lower(reps,1) = 1 AND cardinality(reps) BETWEEN 1 AND 20, false)
  OR EXISTS (SELECT 1 FROM unnest(reps) AS t(r) WHERE r IS NULL OR r < 0)
  OR NOT (weight BETWEEN 0 AND 2000 AND weight = round(weight,2))
  OR (rir IS NOT NULL AND NOT (rir BETWEEN 0 AND 10 AND rir = round(rir,1)));
SELECT id, user_id, name, target_sets, to_json(example_reps) AS example_reps, working_weight
FROM public.program_exercises
WHERE (example_reps IS NOT NULL AND (
    NOT coalesce(array_ndims(example_reps) = 1 AND array_lower(example_reps,1) = 1 AND cardinality(example_reps) BETWEEN 1 AND 20, false)
    OR EXISTS (SELECT 1 FROM unnest(example_reps) AS t(r) WHERE r IS NULL OR r < 0)))
  OR (working_weight IS NOT NULL AND NOT (working_weight BETWEEN 0 AND 2000 AND working_weight = round(working_weight,2)));
SELECT id, user_id, name, day_id FROM public.program_exercises WHERE day_id IS NULL;
-- These may be legitimate historical snapshots from before a move/rename; do not backfill them.
SELECT w.id, w.user_id, w.exercise_id, w.day_id, w.day_name, e.day_id AS current_exercise_day
FROM public.workout_entries w LEFT JOIN public.program_exercises e ON e.id = w.exercise_id AND e.user_id = w.user_id
WHERE w.day_id IS NULL OR w.day_id IS DISTINCT FROM e.day_id OR e.id IS NULL;
ROLLBACK;
