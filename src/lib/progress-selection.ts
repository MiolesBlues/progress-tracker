import type { Day, Exercise } from "./queries";

export const UNASSIGNED_HISTORY_DAY = "__unassigned_history__";
export type ProgressMode = "active" | "archive";

export function progressOptions(days: Day[], exercises: Exercise[], mode: ProgressMode) {
  if (mode === "active") {
    return {
      days: days.filter((day) => !day.archived_at),
      exercisesFor: (dayId: string) =>
        exercises.filter((exercise) => exercise.day_id === dayId && !exercise.archived_at),
    };
  }
  const archiveDays = days.filter((day) =>
    exercises.some(
      (exercise) =>
        exercise.day_id === day.id && (Boolean(day.archived_at) || Boolean(exercise.archived_at)),
    ),
  );
  const unassigned = exercises.some((exercise) => exercise.day_id === null);
  return {
    days: archiveDays,
    hasUnassigned: unassigned,
    exercisesFor: (dayId: string) =>
      exercises.filter((exercise) => {
        if (dayId === UNASSIGNED_HISTORY_DAY) return exercise.day_id === null;
        if (exercise.day_id !== dayId) return false;
        return Boolean(days.find((day) => day.id === dayId)?.archived_at || exercise.archived_at);
      }),
  };
}

export function resolveProgressSelection(
  days: Day[],
  exercises: Exercise[],
  mode: ProgressMode,
  chosenDay: string,
  chosenExercise: string,
) {
  const options = progressOptions(days, exercises, mode);
  const dayIds = options.days.map((day) => day.id);
  if ("hasUnassigned" in options && options.hasUnassigned) dayIds.push(UNASSIGNED_HISTORY_DAY);
  const dayId = dayIds.includes(chosenDay) ? chosenDay : (dayIds[0] ?? "");
  const dayExercises = options.exercisesFor(dayId);
  const exerciseId = dayExercises.some((exercise) => exercise.id === chosenExercise)
    ? chosenExercise
    : (dayExercises[0]?.id ?? "");
  return { dayId, dayExercises, exerciseId, dayOptions: options.days };
}
