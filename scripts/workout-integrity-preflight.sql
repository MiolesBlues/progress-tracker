-- Read-only release assertions. The operation snapshot is the original save;
-- current sets may have been edited, reordered, added or tombstoned since then.
WITH sources AS (
  SELECT w.id, w.user_id, w.day_id, o.id AS operation_id,
    CASE WHEN o.id IS NULL THEN w.weight ELSE o.weight END AS original_weight,
    CASE WHEN o.id IS NULL THEN w.reps ELSE o.reps END AS original_reps,
    CASE WHEN o.id IS NULL THEN w.rir ELSE o.rir END AS original_rir,
    o.id IS NOT NULL AND (w.weight, w.reps, w.rir, w.exercise_id)
      IS DISTINCT FROM (o.weight, o.reps, o.rir, o.exercise_id) AS legacy_fields_changed,
    -- Pre-ledger entries with NULL day_id were intentionally not backfilled into
    -- the ledger. Reconstruct only their original deterministic legacy sets.
    CASE WHEN o.id IS NOT NULL THEN o.set_snapshot ELSE (
      SELECT jsonb_agg(jsonb_build_object(
        'id', substr(h,1,8) || '-' || substr(h,9,4) || '-3' || substr(h,14,3) ||
          '-a' || substr(h,18,3) || '-' || substr(h,21,12),
        'position', position, 'weight', w.weight, 'reps', reps, 'rir', w.rir,
        'set_type', 'working', 'load_type', 'external'
      ) ORDER BY position)
      FROM (
        SELECT reps, position, md5(w.id::text || ':' || position::text) AS h
        FROM unnest(w.reps) WITH ORDINALITY AS legacy(reps, position)
      ) legacy
    ) END AS snapshot
  FROM public.workout_entries w
  LEFT JOIN public.workout_entry_operations o ON o.id = w.id AND o.user_id = w.user_id
), original_sets AS (
  SELECT source.id AS entry_id, source.user_id, item, ordinal
  FROM sources source
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(source.snapshot) = 'array' THEN source.snapshot ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS original(item, ordinal)
), snapshot_checks AS (
  SELECT source.id,
    jsonb_typeof(source.snapshot) = 'array'
    AND count(original.ordinal) BETWEEN 1 AND 20
    AND count(DISTINCT original.item->>'id') = count(original.ordinal)
    AND bool_and(
      jsonb_typeof(original.item) = 'object'
      AND original.item ?& ARRAY['id','position','weight','reps','rir','set_type','load_type']
      AND (SELECT count(*) FROM jsonb_object_keys(
        CASE WHEN jsonb_typeof(original.item) = 'object' THEN original.item ELSE '{}'::jsonb END
      )) = 7
      AND jsonb_typeof(original.item->'id') = 'string'
      AND (original.item->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND original.item->'position' = to_jsonb(original.ordinal::integer)
      AND jsonb_typeof(original.item->'weight') = 'number'
      AND jsonb_typeof(original.item->'reps') = 'number'
      AND (original.item->>'reps') ~ '^-?[0-9]+$'
      AND jsonb_typeof(original.item->'rir') IN ('number', 'null')
      AND original.item->>'set_type' IN ('warmup', 'working')
      AND original.item->>'load_type' IN ('external', 'bodyweight')
    )
    AND source.snapshot->0->'weight' = to_jsonb(source.original_weight)
    AND jsonb_agg(original.item->'reps' ORDER BY original.ordinal) = to_jsonb(source.original_reps)
    AND (CASE WHEN bool_and(original.item->'rir' IS NOT DISTINCT FROM source.snapshot->0->'rir')
      THEN source.snapshot->0->'rir' ELSE 'null'::jsonb END)
      = COALESCE(to_jsonb(source.original_rir), 'null'::jsonb) AS valid
  FROM sources source
  LEFT JOIN original_sets original ON original.entry_id = source.id AND original.user_id = source.user_id
  GROUP BY source.id, source.snapshot, source.original_weight, source.original_reps, source.original_rir
), current_checks AS (
  SELECT source.id,
    count(s.id) BETWEEN 1 AND 20
    AND min(s.position) = 1 AND max(s.position) = count(s.id)
    AND count(DISTINCT s.position) = count(s.id)
    AND bool_and(s.user_id = source.user_id
      AND s.set_type IN ('warmup', 'working') AND s.load_type IN ('external', 'bodyweight')
      AND (s.legacy_snapshot OR (
        s.weight BETWEEN 0 AND 2000 AND s.weight = round(s.weight, 2) AND s.reps >= 0
        AND (s.rir IS NULL OR (s.rir BETWEEN 0 AND 10 AND s.rir = round(s.rir, 1)))
      ))) AS valid
  FROM sources source
  LEFT JOIN public.workout_entry_sets s ON s.workout_entry_id = source.id
  GROUP BY source.id
)
SELECT
  (SELECT count(*)::int FROM sources WHERE
    (operation_id IS NOT NULL AND snapshot IS NULL)
    OR (operation_id IS NULL AND day_id IS NOT NULL)) AS missing_operation_snapshot,
  (SELECT count(*)::int FROM snapshot_checks WHERE valid IS NOT TRUE) AS invalid_operation_snapshot,
  (SELECT count(*)::int FROM sources WHERE legacy_fields_changed) AS legacy_fields_mismatch,
  (SELECT count(*)::int FROM current_checks WHERE valid IS NOT TRUE) AS invalid_current_sets,
  (SELECT count(*)::int FROM public.workout_entry_sets s
    LEFT JOIN original_sets original ON original.entry_id = s.workout_entry_id
      AND original.user_id = s.user_id AND original.item->>'id' = s.id::text
    WHERE s.legacy_snapshot AND (
      original.item IS NULL
      OR original.item->'weight' IS DISTINCT FROM to_jsonb(s.weight)
      OR original.item->'reps' IS DISTINCT FROM to_jsonb(s.reps)
      OR original.item->'rir' IS DISTINCT FROM COALESCE(to_jsonb(s.rir), 'null'::jsonb)
      OR original.item->>'set_type' IS DISTINCT FROM s.set_type
      OR original.item->>'load_type' IS DISTINCT FROM s.load_type
    )) AS legacy_value_mismatch,
  -- A missing original set is intentional only with the owner's delete tombstone.
  (SELECT count(*)::int FROM original_sets original
    WHERE NOT EXISTS (SELECT 1 FROM public.workout_entry_sets s
      WHERE s.workout_entry_id = original.entry_id AND s.user_id = original.user_id
        AND s.id::text = original.item->>'id')
    AND NOT EXISTS (SELECT 1 FROM public.workout_entry_set_tombstones t
      WHERE t.workout_entry_id = original.entry_id AND t.user_id = original.user_id
        AND t.set_id::text = original.item->>'id')) AS missing_original_sets,
  (SELECT count(*)::int FROM public.workout_entry_sets s
    JOIN public.workout_entry_set_tombstones t ON t.user_id = s.user_id AND t.set_id = s.id)
    AS tombstone_conflicts;
