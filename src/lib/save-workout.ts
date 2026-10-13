import { supabase } from "@/integrations/supabase/client";
import type { WorkoutPayload } from "@/lib/workout-input";

export class SaveWorkoutError extends Error {
  constructor(
    message: string,
    public readonly rejected: boolean,
  ) {
    super(message);
  }
}

export async function saveWorkout(id: string, payload: WorkoutPayload, signal: AbortSignal) {
  const { data, error } = await supabase
    .rpc("save_workout_entry", {
      _id: id,
      _exercise_id: payload.exercise_id,
      _day_id: payload.day_id,
      _performed_on: payload.performed_on,
      _weight: payload.weight,
      _reps: payload.reps,
      _rir: payload.rir,
      _notes: payload.notes,
    })
    .abortSignal(signal)
    .then(
      (result) => result,
      () => {
        throw new SaveWorkoutError(
          "Результат сохранения не подтверждён. Повторите попытку: повтор не создаст вторую запись.",
          false,
        );
      },
    );
  if (error) {
    if (error.code === "22023")
      throw new SaveWorkoutError(
        "Эта операция уже сохранена с другими значениями. Проверьте историю; запись не перезаписана.",
        false,
      );
    const rejected = [
      "23514",
      "23503",
      "23502",
      "42501",
      "22003",
      "22007",
      "22008",
      "22P02",
    ].includes(error.code);
    throw new SaveWorkoutError(
      rejected
        ? "Запись отклонена. Проверьте значения, активность упражнения и выбранный день."
        : "Результат сохранения не подтверждён. Повторите попытку: повтор не создаст вторую запись.",
      rejected,
    );
  }
  if (data !== id)
    throw new SaveWorkoutError(
      "Сервер не подтвердил сохранение. Повторите попытку с теми же данными.",
      false,
    );
}
