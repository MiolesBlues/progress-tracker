CREATE TABLE public.program_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  position integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_days_id_user_key UNIQUE (id, user_id)
);
CREATE INDEX program_days_user_idx ON public.program_days(user_id, position);
GRANT SELECT, INSERT, UPDATE ON public.program_days TO authenticated;
GRANT ALL ON public.program_days TO service_role;
ALTER TABLE public.program_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.program_days FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.program_days FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update" ON public.program_days FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- remove hard-coded day ids
ALTER TABLE public.program_exercises DROP CONSTRAINT IF EXISTS program_exercises_day_check;
ALTER TABLE public.workout_entries DROP CONSTRAINT IF EXISTS workout_entries_day_check;
ALTER TABLE public.program_exercises ALTER COLUMN day SET DEFAULT '';
ALTER TABLE public.workout_entries ALTER COLUMN day SET DEFAULT '';
COMMENT ON COLUMN public.program_exercises.day IS 'DEPRECATED: replaced by day_id';
COMMENT ON COLUMN public.workout_entries.day IS 'DEPRECATED: replaced by day_id + day_name snapshot';

ALTER TABLE public.program_exercises ADD COLUMN day_id uuid;
ALTER TABLE public.workout_entries ADD COLUMN day_id uuid, ADD COLUMN day_name text;

-- backfill: one personal day row per legacy day per user
INSERT INTO public.program_days (user_id, name, position)
SELECT u.user_id, m.name, m.pos FROM (
  SELECT user_id, day FROM public.program_exercises
  UNION SELECT user_id, day FROM public.workout_entries
) u JOIN (VALUES ('upper1','Upper 1',1),('lower1','Lower 1',2),('upper2','Upper 2',3),('lower2','Lower 2',4)) m(code,name,pos) ON m.code = u.day;

UPDATE public.program_exercises pe SET day_id = d.id
FROM public.program_days d,
 (VALUES ('upper1','Upper 1'),('lower1','Lower 1'),('upper2','Upper 2'),('lower2','Lower 2')) m(code,name)
WHERE m.code = pe.day AND d.user_id = pe.user_id AND d.name = m.name;

UPDATE public.workout_entries we SET day_id = d.id, day_name = d.name
FROM public.program_days d,
 (VALUES ('upper1','Upper 1'),('lower1','Lower 1'),('upper2','Upper 2'),('lower2','Lower 2')) m(code,name)
WHERE m.code = we.day AND d.user_id = we.user_id AND d.name = m.name;

ALTER TABLE public.program_exercises ADD CONSTRAINT program_exercises_day_owner_fkey
  FOREIGN KEY (day_id, user_id) REFERENCES public.program_days(id, user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.workout_entries ADD CONSTRAINT workout_entries_day_owner_fkey
  FOREIGN KEY (day_id, user_id) REFERENCES public.program_days(id, user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX program_exercises_day_idx ON public.program_exercises(day_id);

-- snapshot day name on each new log
CREATE OR REPLACE FUNCTION public.snapshot_entry_day()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.day_id IS NULL THEN
    SELECT day_id INTO NEW.day_id FROM public.program_exercises WHERE id = NEW.exercise_id;
  END IF;
  IF NEW.day_name IS NULL AND NEW.day_id IS NOT NULL THEN
    SELECT name INTO NEW.day_name FROM public.program_days WHERE id = NEW.day_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workout_entries_snapshot_day BEFORE INSERT ON public.workout_entries
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_entry_day();

-- new accounts no longer get an automatic program
DROP TRIGGER IF EXISTS on_auth_user_created_seed ON auth.users;
COMMENT ON FUNCTION public.seed_default_program() IS 'DEPRECATED: replaced by setup_program onboarding';

-- one-time onboarding (runs as the caller, so RLS applies)
CREATE OR REPLACE FUNCTION public.setup_program(_names text[], _template text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); ids uuid[] := '{}'; did uuid; i int; n text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
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