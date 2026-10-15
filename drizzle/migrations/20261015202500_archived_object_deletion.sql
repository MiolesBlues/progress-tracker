-- Apply only after 0004 and the B09/B12 migrations. No data rewrite on installation.
-- Existing RESTRICT foreign keys remain: both RPCs resolve references first.

BEGIN;

-- Immutable confirmation for save_workout_entry retries. workout_entries.day_id
-- is intentionally detached when a day is deleted, so it cannot be the retry key.
CREATE TABLE public.workout_entry_operations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  exercise_id uuid NOT NULL,
  day_id uuid NOT NULL,
  performed_on date NOT NULL,
  weight numeric NOT NULL,
  reps integer[] NOT NULL,
  rir numeric,
  notes text,
  PRIMARY KEY (user_id, id)
);
ALTER TABLE public.workout_entry_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_entry_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY workout_entry_operations_select_own ON public.workout_entry_operations
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.workout_entry_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workout_entry_operations TO authenticated;

-- Retain only opaque operation IDs after permanent exercise deletion so a late
-- retry cannot recreate a deleted entry or reuse its UUID with another payload.
CREATE TABLE public.workout_entry_operation_tombstones (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  PRIMARY KEY (user_id, id)
);
ALTER TABLE public.workout_entry_operation_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_entry_operation_tombstones FORCE ROW LEVEL SECURITY;
CREATE POLICY workout_entry_operation_tombstones_select_own
  ON public.workout_entry_operation_tombstones FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.workout_entry_operation_tombstones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workout_entry_operation_tombstones TO authenticated;

-- Existing entries with a known day can be used as exact retry evidence.
-- NULL legacy day_ids have no reliable original value and are not guessed.
INSERT INTO public.workout_entry_operations
  (user_id,id,exercise_id,day_id,performed_on,weight,reps,rir,notes)
SELECT user_id,id,exercise_id,day_id,performed_on,weight,reps,rir,notes
FROM public.workout_entries WHERE day_id IS NOT NULL
ON CONFLICT (user_id,id) DO NOTHING;

CREATE FUNCTION public.record_workout_entry_operation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO public.workout_entry_operations
    (user_id,id,exercise_id,day_id,performed_on,weight,reps,rir,notes)
  VALUES (NEW.user_id,NEW.id,NEW.exercise_id,NEW.day_id,NEW.performed_on,NEW.weight,NEW.reps,NEW.rir,NEW.notes)
  ON CONFLICT (user_id,id) DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_workout_entry_operation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workout_entries_record_operation AFTER INSERT ON public.workout_entries
  FOR EACH ROW EXECUTE FUNCTION public.record_workout_entry_operation();

CREATE OR REPLACE FUNCTION public.save_workout_entry(
  _id uuid, _exercise_id uuid, _day_id uuid, _performed_on date,
  _weight numeric, _reps integer[], _rir numeric DEFAULT NULL, _notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); operation public.workout_entry_operations; existing public.workout_entries; saved_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _id IS NULL OR _day_id IS NULL OR _performed_on IS NULL THEN
    RAISE EXCEPTION 'Не указан идентификатор, день или дата' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.workout_entry_operation_tombstones WHERE user_id = uid AND id = _id
  ) THEN
    RAISE EXCEPTION 'Операция была окончательно удалена вместе с упражнением' USING ERRCODE = '23503';
  END IF;
  SELECT * INTO operation FROM public.workout_entry_operations WHERE id = _id AND user_id = uid;
  IF FOUND THEN
    IF (operation.exercise_id, operation.day_id, operation.performed_on, operation.weight,
        operation.reps, operation.rir, operation.notes)
      IS DISTINCT FROM (_exercise_id, _day_id, _performed_on, _weight, _reps, _rir, _notes) THEN
      RAISE EXCEPTION 'UUID операции уже использован с другими значениями' USING ERRCODE = '22023';
    END IF;
    RETURN operation.id;
  END IF;
  SELECT * INTO existing FROM public.workout_entries WHERE id = _id AND user_id = uid;
  IF FOUND THEN
    RAISE EXCEPTION 'Операция не имеет подтверждённого исходного payload' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.workout_entries(id, user_id, exercise_id, day_id, performed_on, weight, reps, rir, notes)
    VALUES (_id, uid, _exercise_id, _day_id, _performed_on, _weight, _reps, _rir, _notes)
    ON CONFLICT (id) DO NOTHING RETURNING id INTO saved_id;
  IF saved_id IS NULL THEN RAISE EXCEPTION 'Операция недоступна' USING ERRCODE = '42501'; END IF;
  RETURN saved_id;
END $$;
REVOKE ALL ON FUNCTION public.save_workout_entry(uuid,uuid,uuid,date,numeric,integer[],numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workout_entry(uuid,uuid,uuid,date,numeric,integer[],numeric,text) TO authenticated;

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
  INSERT INTO public.workout_entry_operation_tombstones (user_id, id)
  SELECT uid, id FROM public.workout_entries WHERE user_id = uid AND exercise_id = _exercise_id
  UNION
  SELECT uid, id FROM public.workout_entry_operations WHERE user_id = uid AND exercise_id = _exercise_id
  ON CONFLICT (user_id, id) DO NOTHING;
  DELETE FROM public.workout_entry_operations WHERE user_id = uid AND exercise_id = _exercise_id;
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

-- A harmless read-only capability probe. The client never infers support by
-- sending a destructive request. Missing RPC on older deployments fails closed.
CREATE FUNCTION public.archive_deletion_capabilities()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT pg_catalog.to_regprocedure('public.delete_archived_program_day(uuid)') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.delete_archived_program_exercise(uuid)') IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.archive_deletion_capabilities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_deletion_capabilities() TO authenticated;

COMMIT;
