import type { TablesUpdate } from "@/integrations/supabase/types";
import type { Day, Exercise } from "@/lib/queries";

export function programName(value: string, max: number) {
  const name = value.trim();
  if (!name || name.length > max) throw new Error(`Название: от 1 до ${max} символов`);
  return name;
}

export function exercisePatch(
  values: { name: string; dayId: string; sets: string; reps: string; weight: string },
  days: Day[],
): TablesUpdate<"program_exercises"> {
  const name = programName(values.name, 100);
  const dayId = values.dayId || null;
  if (dayId && !days.some((day) => day.id === dayId)) throw new Error("Выберите существующий день");
  const sets = values.sets.trim() ? Number(values.sets) : null;
  if (sets !== null && (!Number.isInteger(sets) || sets < 1 || sets > 20))
    throw new Error("Число подходов: от 1 до 20");
  const weight = values.weight.trim() ? Number(values.weight.replace(",", ".")) : null;
  if (weight !== null && (!Number.isFinite(weight) || weight < 0))
    throw new Error("Вес должен быть неотрицательным числом");
  const reps = values.reps.trim();
  if (reps) {
    const match = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(reps);
    if (
      !match ||
      Number(match[1]) < 1 ||
      (match[2] !== undefined && Number(match[2]) < Number(match[1])) ||
      reps.length > 30
    ) {
      throw new Error("Повторения: число или диапазон, например 8–12");
    }
  }
  return {
    name,
    day_id: dayId,
    target_sets: sets,
    target_reps: reps || null,
    working_weight: weight,
  };
}

export function nextPosition(rows: { position: number }[]) {
  return Math.max(-1, ...rows.map((row) => row.position)) + 1;
}

export function movedIds(rows: (Day | Exercise)[], index: number, direction: -1 | 1) {
  const ids = rows.map((row) => row.id);
  const other = index + direction;
  if (index < 0 || index >= ids.length || other < 0 || other >= ids.length)
    throw new Error("Невозможно изменить порядок");
  [ids[index], ids[other]] = [ids[other]!, ids[index]!];
  return ids;
}
