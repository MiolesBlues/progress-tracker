export const MAX_SETS = 20;
export const MAX_WEIGHT = 2000;
export const MAX_REPS = 2147483647; // PostgreSQL integer, including an explicit zero.

export type WorkoutFields = {
  date: string;
  weight: string;
  reps: string[];
  rir: string;
  notes: string;
};
export type WorkoutPayload = {
  exercise_id: string;
  day_id: string;
  performed_on: string;
  weight: number;
  reps: number[];
  rir: number | null;
  notes: string | null;
};

export type WorkoutSetFields = {
  id: string;
  position: number;
  weight: string;
  reps: string;
  rir: string;
  set_type: "warmup" | "working";
  load_type: "external" | "bodyweight";
};

export type PerSetWorkoutFields = {
  date: string;
  sets: WorkoutSetFields[];
  notes: string;
};

export type PerSetWorkoutPayload = {
  exercise_id: string;
  day_id: string;
  performed_on: string;
  sets: {
    id: string;
    position: number;
    weight: string;
    reps: number;
    rir: string | null;
    set_type: "warmup" | "working";
    load_type: "external" | "bodyweight";
  }[];
  notes: string | null;
};

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Validate a V4 draft without converting PostgreSQL numeric weights to JS floats. */
export function validatePerSetWorkout(
  fields: PerSetWorkoutFields,
  exerciseId: string,
  dayId: string,
): PerSetWorkoutPayload {
  if (!exerciseId || !dayId)
    throw new Error("Выберите активное упражнение и его тренировочный день.");
  if (!isWorkoutDate(fields.date)) throw new Error("Укажите существующую дату тренировки.");
  if (fields.notes.length > 1000) throw new Error("Заметка: не более 1000 символов.");
  if (fields.sets.length < 1 || fields.sets.length > MAX_SETS)
    throw new Error(`Допустимо от 1 до ${MAX_SETS} подходов.`);
  const ids = new Set<string>();
  const sets = fields.sets.map((set, index) => {
    if (!UUID.test(set.id) || ids.has(set.id))
      throw new Error("Идентификаторы подходов должны быть уникальными UUID.");
    ids.add(set.id);
    if (set.position !== index + 1)
      throw new Error("Порядок подходов должен быть последовательным.");
    const weightText = set.weight.trim().replace(",", ".");
    decimal(weightText, `Вес подхода ${index + 1}`, MAX_WEIGHT, 2);
    const repsText = set.reps.trim();
    if (!/^\d+$/.test(repsText))
      throw new Error(`Подход ${index + 1}: укажите целое количество повторений.`);
    const reps = Number(repsText);
    if (!Number.isSafeInteger(reps) || reps > MAX_REPS)
      throw new Error(`Подход ${index + 1}: допустимо от 0 до ${MAX_REPS} повторений.`);
    const rirText = set.rir.trim().replace(",", ".");
    if (rirText) decimal(rirText, `RIR подхода ${index + 1}`, 10, 1);
    const rir = rirText || null;
    if (set.set_type !== "warmup" && set.set_type !== "working")
      throw new Error(`Тип подхода ${index + 1} некорректен.`);
    if (set.load_type !== "external" && set.load_type !== "bodyweight")
      throw new Error(`Тип нагрузки ${index + 1} некорректен.`);
    return {
      id: set.id,
      position: index + 1,
      weight: weightText,
      reps,
      rir,
      set_type: set.set_type,
      load_type: set.load_type,
    };
  });
  return {
    exercise_id: exerciseId,
    day_id: dayId,
    performed_on: fields.date,
    sets,
    notes: fields.notes || null,
  };
}

export function isWorkoutDate(value: string): boolean {
  const date = new Date(`${value}T12:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 1 &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export function decimal(value: string, label: string, max: number, places: number): number {
  const text = value.trim();
  if (!text) throw new Error(`Заполните поле «${label}». Пустое значение не равно нулю.`);
  if (!new RegExp(`^\\d+(?:[.,]\\d{1,${places}})?$`).test(text))
    throw new Error(`${label}: введите число, не более ${places} знаков после запятой.`);
  const result = Number(text.replace(",", "."));
  if (!Number.isFinite(result) || result < 0 || result > max)
    throw new Error(`${label}: допустимо от 0 до ${max}.`);
  return result;
}

export function validateWorkout(
  fields: WorkoutFields,
  exerciseId: string,
  dayId: string,
): WorkoutPayload {
  if (!exerciseId || !dayId)
    throw new Error("Выберите активное упражнение и его тренировочный день.");
  const weight = decimal(fields.weight, "Вес", MAX_WEIGHT, 2);
  if (fields.reps.length < 1 || fields.reps.length > MAX_SETS)
    throw new Error(`Допустимо от 1 до ${MAX_SETS} подходов.`);
  const reps = fields.reps.map((value, index) => {
    const text = value.trim();
    if (!text)
      throw new Error(
        `Заполните подход ${index + 1} или явно уберите его кнопкой «Убрать подход».`,
      );
    if (!/^\d+$/.test(text))
      throw new Error(
        `Подход ${index + 1}: нужно одно целое число. Последовательность 8-8-7-6 вводите в четыре отдельных поля.`,
      );
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number > MAX_REPS)
      throw new Error(`Подход ${index + 1}: допустимо от 0 до ${MAX_REPS} повторений.`);
    return number;
  });
  const rir = fields.rir.trim() ? decimal(fields.rir, "RIR", 10, 1) : null;
  if (!isWorkoutDate(fields.date)) throw new Error("Укажите существующую дату тренировки.");
  if (fields.notes.length > 1000) throw new Error("Заметка: не более 1000 символов.");
  return {
    exercise_id: exerciseId,
    day_id: dayId,
    performed_on: fields.date,
    weight,
    reps,
    rir,
    notes: fields.notes || null,
  };
}
