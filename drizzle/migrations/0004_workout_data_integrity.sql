-- Run scripts/workout-preflight.sql read-only first. No backfill or historical repair.
-- NOT VALID constraints protect every future write without rejecting/replacing old rows.
CREATE FUNCTION public.valid_workout_reps(_reps integer[])
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT coalesce(array_ndims(_reps) = 1 AND array_lower(_reps, 1) = 1
    AND cardinality(_reps) BETWEEN 1 AND 20
    AND NOT EXISTS (SELECT 1 FROM unnest(_reps) AS t(r) WHERE r IS NULL OR r < 0), false)
$$;

-- Remove numeric typmods that silently round BEFORE triggers/CHECKs see input.
-- Existing numeric values are retained; precision is now checked, never rounded.
ALTER TABLE public.workout_entries ALTER COLUMN weight TYPE numeric;
ALTER TABLE public.workout_entries ALTER COLUMN rir TYPE numeric;
ALTER TABLE public.workout_entries ADD CONSTRAINT workout_entries_reps_valid
  CHECK (public.valid_workout_reps(reps)) NOT VALID;
ALTER TABLE public.workout_entries ADD CONSTRAINT workout_entries_weight_precision
  CHECK (weight BETWEEN 0 AND 2000 AND weight = round(weight, 2)) NOT VALID;
ALTER TABLE public.workout_entries ADD CONSTRAINT workout_entries_rir_precision
  CHECK (rir IS NULL OR (rir BETWEEN 0 AND 10 AND rir = round(rir, 1))) NOT VALID;
ALTER TABLE public.program_exercises ADD CONSTRAINT program_exercises_weight_valid
  CHECK (working_weight IS NULL OR (working_weight BETWEEN 0 AND 2000 AND working_weight = round(working_weight, 2))) NOT VALID;
ALTER TABLE public.program_exercises ADD CONSTRAINT program_exercises_example_reps_valid
  CHECK (example_reps IS NULL OR public.valid_workout_reps(example_reps)) NOT VALID;

CREATE OR REPLACE FUNCTION public.snapshot_entry_day()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE exercise public.program_exercises; training_day public.program_days;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.user_id, NEW.exercise_id, NEW.day_id, NEW.day_name, NEW.day, NEW.created_at)
      IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.exercise_id, OLD.day_id, OLD.day_name, OLD.day, OLD.created_at) THEN
      RAISE EXCEPTION 'Исторические связи и снимок дня неизменяемы' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF current_user = 'authenticated' AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Нельзя изменить владельца записи' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
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
  NEW.day_name := training_day.name; -- Never trust the client's day_name, even if non-null.
  NEW.day := ''; -- Deprecated field is not an authority for new entries.
  RETURN NEW;
END $$;
DROP TRIGGER workout_entries_snapshot_day ON public.workout_entries;
CREATE TRIGGER workout_entries_snapshot_day BEFORE INSERT OR UPDATE ON public.workout_entries
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_entry_day();

-- The entry PK is the stable operation UUID; same exercise/date may have many UUIDs.
CREATE FUNCTION public.save_workout_entry(
  _id uuid, _exercise_id uuid, _day_id uuid, _performed_on date,
  _weight numeric, _reps integer[], _rir numeric DEFAULT NULL, _notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); existing public.workout_entries; saved_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _id IS NULL OR _day_id IS NULL OR _performed_on IS NULL THEN
    RAISE EXCEPTION 'Не указан идентификатор, день или дата' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  -- A retry is resolved BEFORE checking today's exercise/day activity or names.
  SELECT * INTO existing FROM public.workout_entries WHERE id = _id AND user_id = uid;
  IF FOUND THEN
    IF (existing.exercise_id, existing.day_id, existing.performed_on, existing.weight, existing.reps, existing.rir, existing.notes)
      IS DISTINCT FROM (_exercise_id, _day_id, _performed_on, _weight, _reps, _rir, _notes) THEN
      RAISE EXCEPTION 'UUID операции уже использован с другими значениями' USING ERRCODE = '22023';
    END IF;
    RETURN existing.id;
  END IF;
  INSERT INTO public.workout_entries(id, user_id, exercise_id, day_id, performed_on, weight, reps, rir, notes)
    VALUES (_id, uid, _exercise_id, _day_id, _performed_on, _weight, _reps, _rir, _notes)
    ON CONFLICT (id) DO NOTHING RETURNING id INTO saved_id;
  IF saved_id IS NULL THEN
    RAISE EXCEPTION 'Операция недоступна' USING ERRCODE = '42501';
  END IF;
  RETURN saved_id;
END $$;
REVOKE ALL ON FUNCTION public.save_workout_entry(uuid,uuid,uuid,date,numeric,integer[],numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_workout_entry(uuid,uuid,uuid,date,numeric,integer[],numeric,text) TO authenticated;
