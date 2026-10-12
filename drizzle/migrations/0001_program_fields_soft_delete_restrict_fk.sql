ALTER TABLE public.program_exercises
  ADD COLUMN IF NOT EXISTS target_sets integer CHECK (target_sets IS NULL OR target_sets BETWEEN 1 AND 20),
  ADD COLUMN IF NOT EXISTS target_reps text CHECK (target_reps IS NULL OR length(target_reps) <= 30),
  ADD COLUMN IF NOT EXISTS working_weight numeric CHECK (working_weight IS NULL OR working_weight >= 0),
  ADD COLUMN IF NOT EXISTS example_reps integer[],
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.program_exercises ADD CONSTRAINT program_exercises_id_user_key UNIQUE (id, user_id);

ALTER TABLE public.workout_entries DROP CONSTRAINT workout_entries_exercise_id_fkey;
ALTER TABLE public.workout_entries ADD CONSTRAINT workout_entries_exercise_id_fkey
  FOREIGN KEY (exercise_id) REFERENCES public.program_exercises(id) ON DELETE RESTRICT;
ALTER TABLE public.workout_entries ADD CONSTRAINT workout_entries_exercise_owner_fkey
  FOREIGN KEY (exercise_id, user_id) REFERENCES public.program_exercises(id, user_id) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- soft delete only: no hard deletes of program exercises from the app
DROP POLICY IF EXISTS "own delete" ON public.program_exercises;
REVOKE DELETE ON public.program_exercises FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.seed_default_program()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.program_exercises(user_id, day, position, name, working_weight, target_sets, example_reps, target_reps) VALUES
  (NEW.id,'upper1',1,'Жим штанги лёжа',50,4,'{7,7,6,6}','6-8'),
  (NEW.id,'upper1',2,'Тяга верхнего блока',39,3,'{10,10,10}','8-10'),
  (NEW.id,'upper1',3,'Тяга горизонтального блока',40,3,'{10,10,10}','8-10'),
  (NEW.id,'upper1',4,'Жим гантелей на наклонной скамье',12.5,3,'{10,10,10}','8-10'),
  (NEW.id,'upper1',5,'Разведения на среднюю дельту',5,3,'{15,15,13}','12-15'),
  (NEW.id,'upper1',6,'Разгибание рук на верхнем блоке',14,3,'{15,13,13}','10-15'),
  (NEW.id,'upper1',7,'Сгибание рук с EZ-грифом',18,3,'{12,12,6}','8-12'),
  (NEW.id,'lower1',1,'Приседания со штангой',50,3,'{8,8,8}','6-10'),
  (NEW.id,'lower1',2,'Жим ногами 45°',105,3,'{10,10,10}','10-12'),
  (NEW.id,'lower1',3,'Сгибание ног',35,3,'{15,12,10}','10-15'),
  (NEW.id,'lower1',4,'Разгибание ног',32,3,'{12,12,12}','12-15'),
  (NEW.id,'lower1',5,'Икры стоя',40,3,'{20,20,20}','12-20'),
  (NEW.id,'upper2',1,'Подтягивания',0,3,'{8,8,8}','6-10'),
  (NEW.id,'upper2',2,'Жим гантелей на наклонной скамье',12.5,3,'{10,10,10}','8-10'),
  (NEW.id,'upper2',3,'Тяга горизонтального блока',40,3,'{10,10,10}','8-12'),
  (NEW.id,'upper2',4,'Жим на плечи в тренажёре',20,3,'{10,10,10}','8-10'),
  (NEW.id,'upper2',5,'Разведения на среднюю дельту',5,3,'{15,13,13}','12-20'),
  (NEW.id,'upper2',6,'Обратная бабочка',15,3,'{13,12,12}','12-15'),
  (NEW.id,'upper2',7,'Молотковые сгибания',7,3,'{12,12,9}','10-15'),
  (NEW.id,'upper2',8,'Разгибание рук из-за головы на канате',NULL,3,'{12,10,10}','10-15'),
  (NEW.id,'lower2',1,'Жим ногами горизонтально',70,3,'{10,10,10}','8-12'),
  (NEW.id,'lower2',2,'Приседания со штангой',50,3,'{8,8,8}','8-12'),
  (NEW.id,'lower2',3,'Сгибание ног',35,3,'{15,15,15}','10-15'),
  (NEW.id,'lower2',4,'Икры стоя',40,3,'{20,20,20}','12-20'),
  (NEW.id,'lower2',5,'Пресс (тренажёр)',50,3,'{12,12,12}','12');
  RETURN NEW;
END $function$;