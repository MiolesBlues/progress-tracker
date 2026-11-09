import { supabase } from "@/integrations/supabase/client";
import { SaveWorkoutError } from "./save-workout";
import type { PerSetWorkoutPayload } from "./workout-input";

export type WorkoutSetEdit = {
  operationId: string;
  entryId: string;
  expectedRevision: number;
  set: PerSetWorkoutPayload["sets"][number];
};

export class WorkoutEditConflict extends SaveWorkoutError {
  constructor() {
    super(
      "Подход изменён в другом окне. Ваш ввод сохранён; отмените редактирование и откройте актуальную запись.",
      true,
    );
  }
}

export async function editWorkoutSet(operation: WorkoutSetEdit, signal: AbortSignal) {
  const { data, error } = await supabase
    .rpc("edit_workout_entry_set", {
      _operation_id: operation.operationId,
      _entry_id: operation.entryId,
      _set_id: operation.set.id,
      _expected_revision: operation.expectedRevision,
      _weight: operation.set.weight,
      _reps: operation.set.reps,
      _rir: operation.set.rir,
      _set_type: operation.set.set_type,
      _load_type: operation.set.load_type,
    })
    .abortSignal(signal)
    .then(
      (result) => result,
      () => {
        throw new SaveWorkoutError(
          "Результат изменения не подтверждён. Повторите ту же операцию.",
          false,
        );
      },
    );
  if (error?.code === "40001") throw new WorkoutEditConflict();
  if (error?.code === "P0002")
    throw new SaveWorkoutError(
      "Подход больше недоступен. История обновлена; проверьте запись.",
      true,
    );
  if (error)
    throw new SaveWorkoutError(
      "Изменение отклонено или не подтверждено. Ваш ввод сохранён.",
      ["22023", "42501", "23514", "22P02"].includes(error.code),
    );
  if (!Number.isSafeInteger(data) || data === null || data < 1)
    throw new SaveWorkoutError(
      "Сервер не подтвердил версию подхода. Повторите ту же операцию.",
      false,
    );
  return data;
}
