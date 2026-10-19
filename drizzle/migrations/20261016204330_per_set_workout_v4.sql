-- V4 phase 1: keep workout_entries as the legacy compatibility record while
-- storing authoritative, independently editable set rows beside it.
-- Backfill preserves each historic row exactly; only new per-set RPCs are additive.
BEGIN;

ALTER TABLE public.workout_entries
  ADD CONSTRAINT workout_entries_id_user_key UNIQUE (id, user_id);

ALTER TABLE public.workout_entry_operations
  ADD COLUMN set_snapshot jsonb;

CREATE FUNCTION public.legacy_workout_set_id(_entry_id uuid, _position integer)
RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT (
    substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-3' || substr(h, 14, 3) ||
    '-a' || substr(h, 18, 3) || '-' || substr(h, 21, 12)
  )::uuid
  FROM (SELECT pg_catalog.md5(_entry_id::text || ':' || _position::text) AS h) digest
$$;
REVOKE ALL ON FUNCTION public.legacy_workout_set_id(uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE TABLE public.workout_entry_sets (
  id uuid PRIMARY KEY,
  workout_entry_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL,
  weight numeric NOT NULL,
  reps integer NOT NULL,
  rir numeric,
  set_type text NOT NULL DEFAULT 'working',
  load_type text NOT NULL DEFAULT 'external',
  legacy_snapshot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workout_entry_sets_entry_owner_fkey
    FOREIGN KEY (workout_entry_id, user_id)
    REFERENCES public.workout_entries(id, user_id) ON DELETE CASCADE,
  CONSTRAINT workout_entry_sets_entry_position_key
    UNIQUE (workout_entry_id, position) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT workout_entry_sets_position_check CHECK (position BETWEEN 1 AND 20),
  CONSTRAINT workout_entry_sets_type_check CHECK (set_type IN ('warmup', 'working')),
  CONSTRAINT workout_entry_sets_load_type_check CHECK (load_type IN ('external', 'bodyweight')),
  -- Old rows may contain values that predate validation. Preserve them exactly;
  -- only the RPCs can create non-legacy rows and they validate before insertion.
  CONSTRAINT workout_entry_sets_values_check CHECK (
    legacy_snapshot OR (
      weight BETWEEN 0 AND 2000 AND weight = pg_catalog.round(weight, 2)
      AND reps >= 0
      AND (rir IS NULL OR (rir BETWEEN 0 AND 10 AND rir = pg_catalog.round(rir, 1)))
    )
  )
);
CREATE INDEX workout_entry_sets_entry_order_idx
  ON public.workout_entry_sets (workout_entry_id, position, id);
ALTER TABLE public.workout_entry_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_entry_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY workout_entry_sets_select_own ON public.workout_entry_sets
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.workout_entry_sets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workout_entry_sets TO authenticated;
GRANT ALL ON public.workout_entry_sets TO service_role;

-- Deleted set IDs remain reserved for this user so an offline retry cannot
-- resurrect a set that was intentionally removed.
CREATE TABLE public.workout_entry_set_tombstones (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_entry_id uuid NOT NULL,
  set_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, set_id)
);
ALTER TABLE public.workout_entry_set_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_entry_set_tombstones FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.workout_entry_set_tombstones FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.workout_entry_set_tombstones TO service_role;

-- Deterministic identity plus (entry, position) conflict handling makes this
-- backfill replay-safe without changing source rows or their snapshots.
INSERT INTO public.workout_entry_sets
  (id, workout_entry_id, user_id, position, weight, reps, rir, set_type, load_type, legacy_snapshot, created_at, updated_at)
SELECT public.legacy_workout_set_id(w.id, s.position::integer), w.id, w.user_id,
       s.position::integer, w.weight, s.reps, w.rir, 'working', 'external', true,
       w.created_at, w.created_at
FROM public.workout_entries AS w
CROSS JOIN LATERAL unnest(w.reps) WITH ORDINALITY AS s(reps, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.workout_entry_sets existing
  WHERE existing.workout_entry_id = w.id AND existing.position = s.position::integer
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.workout_entry_operations AS o
SET set_snapshot = COALESCE(s.snapshot, '[]'::jsonb)
FROM (
  SELECT workout_entry_id, user_id,
         pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'id', id, 'position', position, 'weight', weight, 'reps', reps,
             'rir', rir, 'set_type', set_type, 'load_type', load_type
           ) ORDER BY position
         ) AS snapshot
  FROM public.workout_entry_sets
  GROUP BY workout_entry_id, user_id
) AS s
WHERE o.id = s.workout_entry_id AND o.user_id = s.user_id AND o.set_snapshot IS NULL;

-- Recreate the immutable operation snapshot with legacy-compatible set data.
-- SECURITY DEFINER is required because operation rows are intentionally not
-- directly writable; the function has an empty search_path and fixed table refs.
CREATE OR REPLACE FUNCTION public.record_workout_entry_operation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE legacy_sets jsonb;
BEGIN
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', public.legacy_workout_set_id(NEW.id, s.position::integer),
        'position', s.position::integer,
        'weight', NEW.weight,
        'reps', s.reps,
        'rir', NEW.rir,
        'set_type', 'working',
        'load_type', 'external'
      ) ORDER BY s.position
    ), '[]'::jsonb
  ) INTO legacy_sets
  FROM pg_catalog.unnest(NEW.reps) WITH ORDINALITY AS s(reps, position);

  INSERT INTO public.workout_entry_operations
    (user_id, id, exercise_id, day_id, performed_on, weight, reps, rir, notes, set_snapshot)
  VALUES
    (NEW.user_id, NEW.id, NEW.exercise_id, NEW.day_id, NEW.performed_on,
     NEW.weight, NEW.reps, NEW.rir, NEW.notes, legacy_sets)
  ON CONFLICT (user_id, id) DO NOTHING;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.record_workout_entry_operation() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.materialize_legacy_workout_entry_sets()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.workout_entry_sets
    (id, workout_entry_id, user_id, position, weight, reps, rir, set_type, load_type, legacy_snapshot, created_at, updated_at)
  SELECT public.legacy_workout_set_id(NEW.id, s.position::integer), NEW.id, NEW.user_id,
         s.position::integer, NEW.weight, s.reps, NEW.rir, 'working', 'external', true,
         NEW.created_at, NEW.created_at
  FROM pg_catalog.unnest(NEW.reps) WITH ORDINALITY AS s(reps, position)
  ;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.materialize_legacy_workout_entry_sets() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workout_entries_materialize_legacy_sets
  AFTER INSERT ON public.workout_entries
  FOR EACH ROW EXECUTE FUNCTION public.materialize_legacy_workout_entry_sets();

CREATE FUNCTION public.normalize_workout_entry_sets(_sets jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE item jsonb; item_id uuid; item_position integer; item_weight numeric;
        item_reps integer; item_rir numeric; item_set_type text; item_load_type text;
        ids uuid[] := ARRAY[]::uuid[]; normalized jsonb := '[]'::jsonb;
        weight_text text; reps_text text; rir_text text; position_text text;
        ordinal bigint; set_count integer;
BEGIN
  IF pg_catalog.jsonb_typeof(_sets) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Наборы подходов должны быть массивом' USING ERRCODE = '22023';
  END IF;
  set_count := pg_catalog.jsonb_array_length(_sets);
  IF set_count < 1 OR set_count > 20 THEN
    RAISE EXCEPTION 'Допустимо от 1 до 20 подходов' USING ERRCODE = '22023';
  END IF;

  FOR item, ordinal IN
    SELECT value, ordinality FROM pg_catalog.jsonb_array_elements(_sets) WITH ORDINALITY
  LOOP
    IF pg_catalog.jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(item)) <> 7
       OR NOT (item ?& ARRAY['id','position','weight','reps','rir','set_type','load_type']) THEN
      RAISE EXCEPTION 'Структура подхода некорректна' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_typeof(item->'id') IS DISTINCT FROM 'string'
       OR (item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Идентификатор подхода некорректен' USING ERRCODE = '22023';
    END IF;
    item_id := (item->>'id')::uuid;
    IF item_id = ANY(ids) THEN
      RAISE EXCEPTION 'Идентификаторы подходов должны быть уникальными' USING ERRCODE = '22023';
    END IF;
    ids := pg_catalog.array_append(ids, item_id);

    position_text := item->>'position';
    IF pg_catalog.jsonb_typeof(item->'position') IS DISTINCT FROM 'number'
       OR position_text !~ '^[1-9][0-9]*$' OR position_text::integer <> ordinal THEN
      RAISE EXCEPTION 'Порядок подходов должен быть последовательным' USING ERRCODE = '22023';
    END IF;
    item_position := position_text::integer;

    weight_text := item->>'weight';
    IF pg_catalog.jsonb_typeof(item->'weight') IS DISTINCT FROM 'string'
       OR weight_text !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Вес должен быть десятичной строкой с точностью до 0,01' USING ERRCODE = '22023';
    END IF;
    item_weight := weight_text::numeric;
    IF item_weight < 0 OR item_weight > 2000 THEN
      RAISE EXCEPTION 'Вес должен быть от 0 до 2000 кг' USING ERRCODE = '22023';
    END IF;

    reps_text := item->>'reps';
    IF pg_catalog.jsonb_typeof(item->'reps') IS DISTINCT FROM 'number'
       OR reps_text !~ '^(0|[1-9][0-9]*)$' OR reps_text::numeric > 2147483647 THEN
      RAISE EXCEPTION 'Повторения должны быть целым числом от 0 до 2147483647' USING ERRCODE = '22023';
    END IF;
    item_reps := reps_text::integer;

    rir_text := item->>'rir';
    IF pg_catalog.jsonb_typeof(item->'rir') = 'null' THEN
      item_rir := NULL;
    ELSIF pg_catalog.jsonb_typeof(item->'rir') = 'string'
       AND rir_text ~ '^[0-9]+([.][0-9])?$' THEN
      item_rir := rir_text::numeric;
      IF item_rir < 0 OR item_rir > 10 THEN
        RAISE EXCEPTION 'RIR должен быть от 0 до 10' USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'RIR должен быть десятичной строкой или NULL' USING ERRCODE = '22023';
    END IF;

    item_set_type := item->>'set_type';
    item_load_type := item->>'load_type';
    IF pg_catalog.jsonb_typeof(item->'set_type') IS DISTINCT FROM 'string'
       OR item_set_type NOT IN ('warmup','working') THEN
      RAISE EXCEPTION 'Тип подхода некорректен' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_typeof(item->'load_type') IS DISTINCT FROM 'string'
       OR item_load_type NOT IN ('external','bodyweight') THEN
      RAISE EXCEPTION 'Тип нагрузки некорректен' USING ERRCODE = '22023';
    END IF;

    normalized := normalized || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id', item_id, 'position', item_position, 'weight', item_weight, 'reps', item_reps,
      'rir', item_rir, 'set_type', item_set_type, 'load_type', item_load_type
    ));
  END LOOP;
  RETURN normalized;
END
$$;
REVOKE ALL ON FUNCTION public.normalize_workout_entry_sets(jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.save_workout_entry_sets(
  _id uuid, _exercise_id uuid, _day_id uuid, _performed_on date, _sets jsonb, _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := auth.uid(); normalized jsonb; op public.workout_entry_operations;
        existing public.workout_entries; saved_id uuid; item jsonb;
        legacy_weight numeric; legacy_reps integer[] := ARRAY[]::integer[];
        legacy_rir numeric; first_rir numeric; same_rir boolean := true; first_set boolean := true;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _id IS NULL OR _exercise_id IS NULL OR _day_id IS NULL OR _performed_on IS NULL THEN
    RAISE EXCEPTION 'Не указан идентификатор, упражнение, день или дата' USING ERRCODE = '22023';
  END IF;
  IF _notes IS NOT NULL AND pg_catalog.char_length(_notes) > 1000 THEN
    RAISE EXCEPTION 'Заметка: не более 1000 символов' USING ERRCODE = '22023';
  END IF;
  normalized := public.normalize_workout_entry_sets(_sets);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.workout_entry_operation_tombstones t WHERE t.user_id = uid AND t.id = _id
  ) THEN
    RAISE EXCEPTION 'Операция была окончательно удалена вместе с упражнением' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.workout_entry_set_tombstones t
    JOIN pg_catalog.jsonb_array_elements(normalized) s ON (s->>'id')::uuid = t.set_id
    WHERE t.user_id = uid
  ) THEN
    RAISE EXCEPTION 'Идентификатор удалённого подхода нельзя использовать повторно' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO op FROM public.workout_entry_operations o
  WHERE o.user_id = uid AND o.id = _id FOR UPDATE;
  IF FOUND THEN
    -- A legacy operation has a normalized snapshot too; its one-weight payload
    -- will match only a retry carrying the stable deterministic set IDs.
    IF op.exercise_id IS DISTINCT FROM _exercise_id OR op.day_id IS DISTINCT FROM _day_id
       OR op.performed_on IS DISTINCT FROM _performed_on OR op.notes IS DISTINCT FROM _notes
       OR op.set_snapshot IS DISTINCT FROM normalized THEN
      RAISE EXCEPTION 'UUID операции уже использован с другими подходами' USING ERRCODE = '22023';
    END IF;
    RETURN op.id;
  END IF;
  SELECT * INTO existing FROM public.workout_entries w WHERE w.id = _id AND w.user_id = uid;
  IF FOUND THEN
    RAISE EXCEPTION 'Операция не имеет подтверждённого снимка подходов' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(normalized) LOOP
    IF first_set THEN
      legacy_weight := (item->>'weight')::numeric;
      first_rir := NULLIF(item->>'rir', '')::numeric;
      first_set := false;
    ELSIF first_rir IS DISTINCT FROM NULLIF(item->>'rir', '')::numeric THEN
      same_rir := false;
    END IF;
    legacy_reps := pg_catalog.array_append(legacy_reps, (item->>'reps')::integer);
  END LOOP;
  legacy_rir := CASE WHEN same_rir THEN first_rir ELSE NULL END;

  INSERT INTO public.workout_entries
    (id, user_id, exercise_id, day_id, performed_on, weight, reps, rir, notes)
  VALUES (_id, uid, _exercise_id, _day_id, _performed_on, legacy_weight, legacy_reps, legacy_rir, _notes)
  RETURNING id INTO saved_id;

  -- The legacy insert trigger first creates a compatibility snapshot. Replace
  -- its child rows with the caller's validated, independently editable sets.
  DELETE FROM public.workout_entry_sets s WHERE s.workout_entry_id = saved_id AND s.user_id = uid;
  INSERT INTO public.workout_entry_sets
    (id, workout_entry_id, user_id, position, weight, reps, rir, set_type, load_type, legacy_snapshot)
  SELECT (s->>'id')::uuid, saved_id, uid, (s->>'position')::integer,
         (s->>'weight')::numeric, (s->>'reps')::integer, NULLIF(s->>'rir','')::numeric,
         s->>'set_type', s->>'load_type', false
  FROM pg_catalog.jsonb_array_elements(normalized) s;
  UPDATE public.workout_entry_operations o SET set_snapshot = normalized
  WHERE o.user_id = uid AND o.id = saved_id;
  RETURN saved_id;
END
$$;
REVOKE ALL ON FUNCTION public.save_workout_entry_sets(uuid,uuid,uuid,date,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workout_entry_sets(uuid,uuid,uuid,date,jsonb,text) TO authenticated;

CREATE FUNCTION public.add_workout_entry_set(
  _entry_id uuid, _set_id uuid, _weight text, _reps integer, _rir text,
  _set_type text DEFAULT 'working', _load_type text DEFAULT 'external'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := auth.uid(); entry public.workout_entries; existing public.workout_entry_sets;
        position_next integer; normalized jsonb; item jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  SELECT * INTO entry FROM public.workout_entries w WHERE w.id = _entry_id AND w.user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Запись тренировки недоступна' USING ERRCODE = '42501'; END IF;
  SELECT * INTO existing FROM public.workout_entry_sets s
  WHERE s.id = _set_id AND s.workout_entry_id = _entry_id AND s.user_id = uid;
  IF FOUND THEN
    IF (existing.weight, existing.reps, existing.rir, existing.set_type, existing.load_type)
      IS DISTINCT FROM (_weight::numeric, _reps, _rir::numeric, _set_type, _load_type) THEN
      RAISE EXCEPTION 'UUID подхода уже использован с другими значениями' USING ERRCODE = '22023';
    END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.workout_entry_set_tombstones t WHERE t.user_id = uid AND t.set_id = _set_id) THEN
    RAISE EXCEPTION 'Идентификатор удалённого подхода нельзя использовать повторно' USING ERRCODE = '23503';
  END IF;
  SELECT COALESCE(pg_catalog.max(s.position), 0) + 1 INTO position_next
  FROM public.workout_entry_sets s WHERE s.workout_entry_id = _entry_id AND s.user_id = uid;
  IF position_next > 20 THEN RAISE EXCEPTION 'Допустимо не более 20 подходов' USING ERRCODE = '22023'; END IF;
  normalized := public.normalize_workout_entry_sets(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('id',_set_id,'position',1,'weight',_weight,'reps',_reps,
      'rir',CASE WHEN _rir IS NULL THEN NULL ELSE pg_catalog.to_jsonb(_rir) END,
      'set_type',_set_type,'load_type',_load_type)
  ));
  item := normalized->0;
  INSERT INTO public.workout_entry_sets
    (id, workout_entry_id, user_id, position, weight, reps, rir, set_type, load_type)
  VALUES (_set_id, _entry_id, uid, position_next, (item->>'weight')::numeric,
    (item->>'reps')::integer, NULLIF(item->>'rir','')::numeric,
    item->>'set_type', item->>'load_type');
  RETURN _set_id;
END
$$;
REVOKE ALL ON FUNCTION public.add_workout_entry_set(uuid,uuid,text,integer,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_workout_entry_set(uuid,uuid,text,integer,text,text,text) TO authenticated;

CREATE FUNCTION public.update_workout_entry_set(
  _entry_id uuid, _set_id uuid, _weight text, _reps integer, _rir text,
  _set_type text DEFAULT 'working', _load_type text DEFAULT 'external'
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := auth.uid(); entry public.workout_entries; existing public.workout_entry_sets;
        normalized jsonb; item jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  SELECT * INTO entry FROM public.workout_entries w WHERE w.id = _entry_id AND w.user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Запись тренировки недоступна' USING ERRCODE = '42501'; END IF;
  SELECT * INTO existing FROM public.workout_entry_sets s
  WHERE s.id = _set_id AND s.workout_entry_id = _entry_id AND s.user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  normalized := public.normalize_workout_entry_sets(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('id',_set_id,'position',1,'weight',_weight,'reps',_reps,
      'rir',CASE WHEN _rir IS NULL THEN NULL ELSE pg_catalog.to_jsonb(_rir) END,
      'set_type',_set_type,'load_type',_load_type)
  ));
  item := normalized->0;
  UPDATE public.workout_entry_sets s SET
    weight=(item->>'weight')::numeric, reps=(item->>'reps')::integer,
    rir=NULLIF(item->>'rir','')::numeric, set_type=item->>'set_type',
    load_type=item->>'load_type', legacy_snapshot=false, updated_at=pg_catalog.now()
  WHERE s.id=_set_id AND s.workout_entry_id=_entry_id AND s.user_id=uid;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.update_workout_entry_set(uuid,uuid,text,integer,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_workout_entry_set(uuid,uuid,text,integer,text,text,text) TO authenticated;

CREATE FUNCTION public.delete_workout_entry_set(_entry_id uuid, _set_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := auth.uid(); entry public.workout_entries; set_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.workout_entry_set_tombstones t
    WHERE t.user_id=uid AND t.workout_entry_id=_entry_id AND t.set_id=_set_id) THEN RETURN true; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  IF EXISTS (SELECT 1 FROM public.workout_entry_set_tombstones t
    WHERE t.user_id=uid AND t.workout_entry_id=_entry_id AND t.set_id=_set_id) THEN RETURN true; END IF;
  SELECT * INTO entry FROM public.workout_entries w WHERE w.id=_entry_id AND w.user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Запись тренировки недоступна' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workout_entry_sets s
    WHERE s.id=_set_id AND s.workout_entry_id=_entry_id AND s.user_id=uid) THEN RETURN false; END IF;
  SELECT pg_catalog.count(*)::integer INTO set_count FROM public.workout_entry_sets s
    WHERE s.workout_entry_id=_entry_id AND s.user_id=uid;
  IF set_count <= 1 THEN RAISE EXCEPTION 'Нельзя удалить последний подход' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.workout_entry_set_tombstones(user_id,workout_entry_id,set_id)
    VALUES(uid,_entry_id,_set_id) ON CONFLICT(user_id,set_id) DO NOTHING;
  DELETE FROM public.workout_entry_sets s
    WHERE s.id=_set_id AND s.workout_entry_id=_entry_id AND s.user_id=uid;
  WITH ordered AS (
    SELECT s.id, pg_catalog.row_number() OVER (ORDER BY s.position,s.id)::integer AS n
    FROM public.workout_entry_sets s WHERE s.workout_entry_id=_entry_id AND s.user_id=uid
  )
  UPDATE public.workout_entry_sets s SET position=o.n, updated_at=pg_catalog.now()
    FROM ordered o WHERE s.id=o.id AND s.user_id=uid;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.delete_workout_entry_set(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_workout_entry_set(uuid,uuid) TO authenticated;

CREATE FUNCTION public.reorder_workout_entry_sets(_entry_id uuid, _ids uuid[])
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE uid uuid := auth.uid(); entry public.workout_entries; set_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  SELECT * INTO entry FROM public.workout_entries w WHERE w.id=_entry_id AND w.user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Запись тренировки недоступна' USING ERRCODE = '42501'; END IF;
  SELECT pg_catalog.count(*)::integer INTO set_count FROM public.workout_entry_sets s
    WHERE s.workout_entry_id=_entry_id AND s.user_id=uid;
  IF _ids IS NULL OR pg_catalog.cardinality(_ids) <> set_count
     OR (SELECT pg_catalog.count(DISTINCT x)::integer FROM pg_catalog.unnest(_ids) x) <> set_count
     OR EXISTS (SELECT x FROM pg_catalog.unnest(_ids) x
       EXCEPT SELECT s.id FROM public.workout_entry_sets s WHERE s.workout_entry_id=_entry_id AND s.user_id=uid) THEN
    RAISE EXCEPTION 'Новый порядок должен содержать все подходы ровно один раз' USING ERRCODE = '22023';
  END IF;
  WITH ordered AS (
    SELECT x.id, x.n::integer AS position
    FROM pg_catalog.unnest(_ids) WITH ORDINALITY AS x(id,n)
  )
  UPDATE public.workout_entry_sets s SET position=o.position, updated_at=pg_catalog.now()
    FROM ordered o WHERE s.id=o.id AND s.workout_entry_id=_entry_id AND s.user_id=uid;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION public.reorder_workout_entry_sets(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_workout_entry_sets(uuid,uuid[]) TO authenticated;

COMMIT;
