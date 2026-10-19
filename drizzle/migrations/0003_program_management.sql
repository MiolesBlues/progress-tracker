-- No data rewrite/backfill. NULL day_id and all workout history remain untouched.
-- Serialize program membership/order changes per owner, including other tabs.
CREATE FUNCTION public.lock_program_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
  RETURN NEW;
END $$;
CREATE TRIGGER program_exercises_lock_owner
  BEFORE INSERT OR UPDATE OF day_id, archived_at, position ON public.program_exercises
  FOR EACH ROW EXECUTE FUNCTION public.lock_program_owner();

CREATE FUNCTION public.guard_program_days()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE active_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
  SELECT count(*) INTO active_count FROM public.program_days
    WHERE user_id = NEW.user_id AND archived_at IS NULL;
  IF NEW.archived_at IS NULL AND (TG_OP = 'INSERT' OR OLD.archived_at IS NOT NULL) AND active_count >= 7 THEN
    RAISE EXCEPTION 'Можно иметь не более 7 активных дней' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND active_count <= 1 THEN
    RAISE EXCEPTION 'Нужен хотя бы один активный день' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER program_days_guard
  BEFORE INSERT OR UPDATE OF archived_at, position ON public.program_days
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_days();

-- Reorder the complete active list in one transaction; a stale/foreign list fails.
CREATE FUNCTION public.reorder_program_days(_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  IF _ids IS NULL
    OR cardinality(_ids) <> (SELECT count(*) FROM public.program_days WHERE user_id = uid AND archived_at IS NULL)
    OR cardinality(_ids) <> (SELECT count(DISTINCT id) FROM unnest(_ids) AS t(id))
    OR EXISTS (SELECT 1 FROM unnest(_ids) AS t(id) WHERE NOT EXISTS (
      SELECT 1 FROM public.program_days d WHERE d.id = t.id AND d.user_id = uid AND d.archived_at IS NULL
    )) THEN
    RAISE EXCEPTION 'Список дней изменился. Обновите программу.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.program_days d SET position = t.ordinality::integer - 1
    FROM unnest(_ids) WITH ORDINALITY AS t(id, ordinality)
    WHERE d.id = t.id AND d.user_id = uid;
END $$;

CREATE FUNCTION public.reorder_program_exercises(_day_id uuid, _ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.program_days WHERE id = _day_id AND user_id = uid)
    OR _ids IS NULL
    OR cardinality(_ids) <> (SELECT count(*) FROM public.program_exercises WHERE user_id = uid AND day_id = _day_id AND archived_at IS NULL)
    OR cardinality(_ids) <> (SELECT count(DISTINCT id) FROM unnest(_ids) AS t(id))
    OR EXISTS (SELECT 1 FROM unnest(_ids) AS t(id) WHERE NOT EXISTS (
      SELECT 1 FROM public.program_exercises e WHERE e.id = t.id AND e.user_id = uid AND e.day_id = _day_id AND e.archived_at IS NULL
    )) THEN
    RAISE EXCEPTION 'Список упражнений изменился. Обновите программу.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.program_exercises e SET position = t.ordinality::integer - 1
    FROM unnest(_ids) WITH ORDINALITY AS t(id, ordinality)
    WHERE e.id = t.id AND e.user_id = uid AND e.day_id = _day_id;
END $$;

REVOKE ALL ON FUNCTION public.lock_program_owner(), public.guard_program_days() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_program_days(uuid[]), public.reorder_program_exercises(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_program_days(uuid[]), public.reorder_program_exercises(uuid, uuid[]) TO authenticated;

-- Serialize one-time onboarding before checking for an existing program.
CREATE OR REPLACE FUNCTION public.setup_program(_names text[], _template text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); ids uuid[] := '{}'; did uuid; i int; n text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  IF EXISTS (SELECT 1 FROM public.program_days WHERE user_id = uid) THEN RAISE EXCEPTION 'program already exists'; END IF;
  IF _template = 'upper_lower' THEN
    _names := ARRAY[COALESCE(_names[1],'Upper 1'),COALESCE(_names[2],'Lower 1'),COALESCE(_names[3],'Upper 2'),COALESCE(_names[4],'Lower 2')];
  END IF;
  IF coalesce(array_length(_names,1),0) NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'days must be 1..7'; END IF;
  FOR i IN 1..array_length(_names,1) LOOP
    n := left(coalesce(nullif(btrim(_names[i]),''), 'День ' || i), 60);
    INSERT INTO public.program_days(user_id, name, position) VALUES (uid, n, i) RETURNING id INTO did;
    ids := ids || did;
  END LOOP;
  IF _template = 'upper_lower' THEN
    INSERT INTO public.program_exercises(user_id, day_id, position, name, working_weight, target_sets, example_reps, target_reps)
    SELECT uid, ids[t.d], t.p, t.nm, t.w, t.s, t.r, t.tr FROM (VALUES
    (1,1,'Жим штанги лёжа',50::numeric,4,'{7,7,6,6}'::int[],'6-8'),
    (1,2,'Тяга верхнего блока',39,3,'{10,10,10}','8-10'),
    (1,3,'Тяга горизонтального блока',40,3,'{10,10,10}','8-10'),
    (1,4,'Жим гантелей на наклонной скамье',12.5,3,'{10,10,10}','8-10'),
    (1,5,'Разведения на среднюю дельту',5,3,'{15,15,13}','12-15'),
    (1,6,'Разгибание рук на верхнем блоке',14,3,'{15,13,13}','10-15'),
    (1,7,'Сгибание рук с EZ-грифом',18,3,'{12,12,6}','8-12'),
    (2,1,'Приседания со штангой',50,3,'{8,8,8}','6-10'),
    (2,2,'Жим ногами 45°',105,3,'{10,10,10}','10-12'),
    (2,3,'Сгибание ног',35,3,'{15,12,10}','10-15'),
    (2,4,'Разгибание ног',32,3,'{12,12,12}','12-15'),
    (2,5,'Икры стоя',40,3,'{20,20,20}','12-20'),
    (3,1,'Подтягивания',0,3,'{8,8,8}','6-10'),
    (3,2,'Жим гантелей на наклонной скамье',12.5,3,'{10,10,10}','8-10'),
    (3,3,'Тяга горизонтального блока',40,3,'{10,10,10}','8-12'),
    (3,4,'Жим на плечи в тренажёре',20,3,'{10,10,10}','8-10'),
    (3,5,'Разведения на среднюю дельту',5,3,'{15,13,13}','12-20'),
    (3,6,'Обратная бабочка',15,3,'{13,12,12}','12-15'),
    (3,7,'Молотковые сгибания',7,3,'{12,12,9}','10-15'),
    (3,8,'Разгибание рук из-за головы на канате',NULL,3,'{12,10,10}','10-15'),
    (4,1,'Жим ногами горизонтально',70,3,'{10,10,10}','8-12'),
    (4,2,'Приседания со штангой',50,3,'{8,8,8}','8-12'),
    (4,3,'Сгибание ног',35,3,'{15,15,15}','10-15'),
    (4,4,'Икры стоя',40,3,'{20,20,20}','12-20'),
    (4,5,'Пресс (тренажёр)',50,3,'{12,12,12}','12')
    ) t(d,p,nm,w,s,r,tr);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.setup_program(text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.setup_program(text[], text) TO authenticated;