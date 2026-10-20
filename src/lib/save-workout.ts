import { pendingRpc } from "@/lib/pending-rpc";
import { supabase } from "@/integrations/supabase/client";
import type { WorkoutPayload } from "@/lib/workout-input";
import type { PerSetWorkoutPayload } from "@/lib/workout-input";

export class SaveWorkoutError extends Error {
  constructor(
    message: string,
    public readonly rejected: boolean,
  ) {
    super(message);
  }
}

export async function saveWorkout(id: string, payload: WorkoutPayload, signal: AbortSignal) {
  const { data, error } = await pendingRpc("save_workout_entry", {
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
      (result: { data: unknown; error: { message: string; code?: string } | null }) => result,
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
    ].includes(error.code ?? "");
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

export async function saveWorkoutSets(
  id: string,
  payload: PerSetWorkoutPayload,
  signal: AbortSignal,
) {
  const { data, error } = await pendingRpc("save_workout_entry_sets", {
    _id: id,
    _exercise_id: payload.exercise_id,
    _day_id: payload.day_id,
    _performed_on: payload.performed_on,
    _sets: payload.sets,
    _notes: payload.notes,
  })
    .abortSignal(signal)
    .then(
      (result: { data: unknown; error: { message: string; code?: string } | null }) => result,
      () => {
        throw new SaveWorkoutError(
          "Результат сохранения подходов не подтверждён. Повторите попытку с теми же значениями.",
          false,
        );
      },
    );
  if (error) throw saveError(error.code);
  if (data !== id) throw new SaveWorkoutError("Сервер не подтвердил сохранение подходов.", false);
}

type SetMutationRpc =
  | "add_workout_entry_set"
  | "update_workout_entry_set"
  | "delete_workout_entry_set"
  | "reorder_workout_entry_sets";

async function mutateWorkoutSet(
  name: SetMutationRpc,
  args: Record<string, unknown>,
  signal: AbortSignal,
) {
  const { data, error } = await pendingRpc(name, args)
    .abortSignal(signal)
    .then(
      (result: { data: unknown; error: { message: string; code?: string } | null }) => result,
      () => {
        throw new SaveWorkoutError(
          "Результат изменения подходов не подтверждён. Повторите ту же операцию.",
          false,
        );
      },
    );
  if (error) throw saveError(error.code);
  // The update RPC uses false to mean the target set no longer exists. A
  // fulfilled PostgREST request is not sufficient evidence of a mutation.
  if (name === "update_workout_entry_set" && data !== true) {
    throw new SaveWorkoutError(
      "Подход больше недоступен. История обновлена; проверьте запись.",
      true,
    );
  }
  return data;
}

function saveError(code?: string) {
  if (code === "22023")
    return new SaveWorkoutError("Операция конфликтует с уже сохранёнными значениями.", false);
  const rejected = ["23514", "23503", "23502", "42501", "22003", "22P02"].includes(code ?? "");
  return new SaveWorkoutError(
    rejected
      ? "Изменение отклонено. Проверьте значения и доступность записи."
      : "Результат изменения не подтверждён. Повторите ту же операцию.",
    rejected,
  );
}

export function addWorkoutSet(
  entryId: string,
  set: PerSetWorkoutPayload["sets"][number],
  signal: AbortSignal,
) {
  return mutateWorkoutSet(
    "add_workout_entry_set",
    {
      _entry_id: entryId,
      _set_id: set.id,
      _weight: set.weight,
      _reps: set.reps,
      _rir: set.rir,
      _set_type: set.set_type,
      _load_type: set.load_type,
    },
    signal,
  );
}

export function updateWorkoutSet(
  entryId: string,
  set: PerSetWorkoutPayload["sets"][number],
  signal: AbortSignal,
) {
  return mutateWorkoutSet(
    "update_workout_entry_set",
    {
      _entry_id: entryId,
      _set_id: set.id,
      _weight: set.weight,
      _reps: set.reps,
      _rir: set.rir,
      _set_type: set.set_type,
      _load_type: set.load_type,
    },
    signal,
  );
}

export function deleteWorkoutSet(entryId: string, setId: string, signal: AbortSignal) {
  return mutateWorkoutSet(
    "delete_workout_entry_set",
    { _entry_id: entryId, _set_id: setId },
    signal,
  );
}

export function reorderWorkoutSets(entryId: string, ids: string[], signal: AbortSignal) {
  return mutateWorkoutSet("reorder_workout_entry_sets", { _entry_id: entryId, _ids: ids }, signal);
}
