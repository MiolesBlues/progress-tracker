-- Read-only account-data orphan inventory. Run only against an explicitly
-- selected database; this script contains SELECT statements and never deletes.
SELECT 'program_days' AS table_name, count(*) AS orphan_rows
FROM public.program_days p LEFT JOIN auth.users u ON u.id = p.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'program_exercises', count(*)
FROM public.program_exercises p LEFT JOIN auth.users u ON u.id = p.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'workout_entries', count(*)
FROM public.workout_entries e LEFT JOIN auth.users u ON u.id = e.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'workout_entry_sets', count(*)
FROM public.workout_entry_sets s
LEFT JOIN public.workout_entries e ON e.id = s.workout_entry_id AND e.user_id = s.user_id
WHERE e.id IS NULL
UNION ALL
SELECT 'workout_entry_operations', count(*)
FROM public.workout_entry_operations o LEFT JOIN auth.users u ON u.id = o.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'workout_entry_operation_tombstones', count(*)
FROM public.workout_entry_operation_tombstones t LEFT JOIN auth.users u ON u.id = t.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'workout_entry_set_tombstones', count(*)
FROM public.workout_entry_set_tombstones t LEFT JOIN auth.users u ON u.id = t.user_id WHERE u.id IS NULL
UNION ALL
SELECT 'training_template_applications', count(*)
FROM public.training_template_applications a LEFT JOIN auth.users u ON u.id = a.user_id WHERE u.id IS NULL
ORDER BY table_name;
