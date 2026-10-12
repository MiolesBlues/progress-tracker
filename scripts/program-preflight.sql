-- Read-only. Run separately before approving migration 0003; no repair is implied.
BEGIN TRANSACTION READ ONLY;
SELECT user_id, id, name, day, day_id, archived_at
FROM public.program_exercises WHERE day_id IS NULL ORDER BY user_id, created_at;
SELECT user_id, id, exercise_id, day, day_id, day_name, performed_on
FROM public.workout_entries WHERE day_id IS NULL ORDER BY user_id, performed_on;
SELECT user_id, count(*) FILTER (WHERE archived_at IS NULL) AS active_days, count(*) AS total_days
FROM public.program_days GROUP BY user_id
HAVING count(*) FILTER (WHERE archived_at IS NULL) NOT BETWEEN 1 AND 7;
ROLLBACK;
