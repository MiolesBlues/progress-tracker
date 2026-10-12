CREATE TABLE public.program_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  day text NOT NULL CHECK (day IN ('upper1','lower1','upper2','lower2')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_exercises TO authenticated;
GRANT ALL ON public.program_exercises TO service_role;
ALTER TABLE public.program_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.program_exercises FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.program_exercises FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update" ON public.program_exercises FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own delete" ON public.program_exercises FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.program_exercises(user_id, day, position);

CREATE TABLE public.workout_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  exercise_id uuid NOT NULL REFERENCES public.program_exercises(id) ON DELETE CASCADE,
  day text NOT NULL CHECK (day IN ('upper1','lower1','upper2','lower2')),
  performed_on date NOT NULL DEFAULT current_date,
  weight numeric(6,2) NOT NULL CHECK (weight >= 0 AND weight <= 2000),
  reps int[] NOT NULL CHECK (array_length(reps,1) BETWEEN 1 AND 20),
  rir numeric(3,1) CHECK (rir IS NULL OR (rir >= 0 AND rir <= 10)),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_entries TO authenticated;
GRANT ALL ON public.workout_entries TO service_role;
ALTER TABLE public.workout_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.workout_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.workout_entries FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.program_exercises p WHERE p.id = exercise_id AND p.user_id = auth.uid()));
CREATE POLICY "own update" ON public.workout_entries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.program_exercises p WHERE p.id = exercise_id AND p.user_id = auth.uid()));
CREATE POLICY "own delete" ON public.workout_entries FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.workout_entries(user_id, exercise_id, performed_on);

CREATE OR REPLACE FUNCTION public.seed_default_program()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.program_exercises(user_id, day, name, position) VALUES
  (NEW.id,'upper1','Жим штанги лёжа',0),(NEW.id,'upper1','Тяга штанги в наклоне',1),(NEW.id,'upper1','Жим гантелей сидя',2),(NEW.id,'upper1','Подъём на бицепс',3),
  (NEW.id,'lower1','Приседания со штангой',0),(NEW.id,'lower1','Румынская тяга',1),(NEW.id,'lower1','Выпады',2),(NEW.id,'lower1','Подъём на носки',3),
  (NEW.id,'upper2','Жим на наклонной скамье',0),(NEW.id,'upper2','Подтягивания',1),(NEW.id,'upper2','Махи гантелями в стороны',2),(NEW.id,'upper2','Французский жим',3),
  (NEW.id,'lower2','Становая тяга',0),(NEW.id,'lower2','Жим ногами',1),(NEW.id,'lower2','Сгибания ног',2),(NEW.id,'lower2','Разгибания ног',3);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.seed_default_program() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created_seed AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.seed_default_program();