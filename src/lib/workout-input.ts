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
  const date = new Date(`${fields.date}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.date) ||
    Number(fields.date.slice(0, 4)) < 1 ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== fields.date
  )
    throw new Error("Укажите существующую дату тренировки.");
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
