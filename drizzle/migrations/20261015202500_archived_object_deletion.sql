-- Apply only after 0004 and the B09/B12 migrations. No data rewrite on installation.
-- Existing RESTRICT foreign keys remain: both RPCs resolve references first.

BEGIN;

CREATE FUNCTION public.delete_archived_program_day(_day_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE uid uuid := auth.uid(); target public.program_days;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  SELECT * INTO target FROM public.program_days
    WHERE id = _day_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF target.archived_at IS NULL THEN
    RAISE EXCEPTION 'Only archived objects may be deleted' USING ERRCODE = '22023';
  END IF;

  -- Only this SECURITY DEFINER operation may detach historical day references.
  PERFORM pg_catalog.set_config('progress_tracker.detach_day_id', _day_id::text, true);
  UPDATE public.program_exercises SET day_id = NULL
    WHERE user_id = uid AND day_id = _day_id;
  UPDATE public.workout_entries SET day_id = NULL
    WHERE user_id = uid AND day_id = _day_id;
  DELETE FROM public.program_days WHERE id = _day_id AND user_id = uid;
  RETURN true;
END $$;

-- Preserve the original insert validation and immutable history. The single exception
-- changes only day_id to NULL during the owner-checked delete RPC above.
CREATE OR REPLACE FUNCTION public.snapshot_entry_day()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE exercise public.program_exercises; training_day public.program_days;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.day_id IS NOT NULL AND NEW.day_id IS NULL
      AND current_user = (
        SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc p
        WHERE p.oid = 'public.delete_archived_program_day(uuid)'::pg_catalog.regprocedure
      )
      AND pg_catalog.current_setting('progress_tracker.detach_day_id', true) = OLD.day_id::text
      AND auth.uid() = OLD.user_id
      AND EXISTS (SELECT 1 FROM public.program_days d
        WHERE d.id = OLD.day_id AND d.user_id = OLD.user_id AND d.archived_at IS NOT NULL)
      AND (NEW.id, NEW.user_id, NEW.exercise_id, NEW.day_name, NEW.day,
           NEW.created_at, NEW.performed_on, NEW.weight, NEW.reps, NEW.rir, NEW.notes)
        IS NOT DISTINCT FROM
          (OLD.id, OLD.user_id, OLD.exercise_id, OLD.day_name, OLD.day,
           OLD.created_at, OLD.performed_on, OLD.weight, OLD.reps, OLD.rir, OLD.notes)
    THEN RETURN NEW; END IF;
    IF (NEW.id, NEW.user_id, NEW.exercise_id, NEW.day_id, NEW.day_name, NEW.day, NEW.created_at)
      IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.exercise_id, OLD.day_id, OLD.day_name, OLD.day, OLD.created_at) THEN
      RAISE EXCEPTION 'Исторические связи и снимок дня неизменяемы' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF current_user = 'authenticated' AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Нельзя изменить владельца записи' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text, 0));
  SELECT * INTO exercise FROM public.program_exercises
    WHERE id = NEW.exercise_id AND user_id = NEW.user_id FOR SHARE;
  IF NOT FOUND OR exercise.day_id IS NULL OR exercise.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Упражнение недоступно для новой тренировки' USING ERRCODE = '23503';
  END IF;
  IF NEW.day_id IS NOT NULL AND NEW.day_id <> exercise.day_id THEN
    RAISE EXCEPTION 'Упражнение не относится к выбранному дню' USING ERRCODE = '23503';
  END IF;
  SELECT * INTO training_day FROM public.program_days
    WHERE id = exercise.day_id AND user_id = NEW.user_id FOR SHARE;
  IF NOT FOUND OR training_day.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Тренировочный день недоступен' USING ERRCODE = '23503';
  END IF;
  NEW.day_id := training_day.id;
  NEW.day_name := training_day.name;
  NEW.day := '';
  RETURN NEW;
END $$;

CREATE FUNCTION public.delete_archived_program_exercise(_exercise_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE uid uuid := auth.uid(); target public.program_exercises;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  SELECT * INTO target FROM public.program_exercises
    WHERE id = _exercise_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF target.archived_at IS NULL THEN
    RAISE EXCEPTION 'Only archived objects may be deleted' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.workout_entries
    WHERE exercise_id = _exercise_id AND user_id = uid;
  DELETE FROM public.program_exercises
    WHERE id = _exercise_id AND user_id = uid;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.delete_archived_program_day(uuid),
  public.delete_archived_program_exercise(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_archived_program_day(uuid),
  public.delete_archived_program_exercise(uuid) TO authenticated;

COMMIT;
