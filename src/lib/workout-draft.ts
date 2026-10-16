import {
  validateWorkout,
  MAX_SETS,
  type WorkoutFields,
  type WorkoutPayload,
  type PerSetWorkoutFields,
  type PerSetWorkoutPayload,
  validatePerSetWorkout,
} from "@/lib/workout-input";

export type DirtyFields = Record<keyof WorkoutFields, boolean>;
export type WorkoutDraft = {
  version: 1;
  userId: string;
  exerciseId: string;
  id: string;
  fields: WorkoutFields;
  dirty: DirtyFields;
  operation: { id: string; payload: WorkoutPayload } | null;
};
export type PerSetWorkoutDraft = {
  version: 2;
  userId: string;
  exerciseId: string;
  id: string;
  fields: PerSetWorkoutFields;
  /** Set IDs confirmed in Focus Mode; optional when reading existing V2 drafts. */
  recordedSetIds: string[];
  dirty: { date: boolean; sets: boolean; notes: boolean };
  operation: { id: string; payload: PerSetWorkoutPayload } | null;
};
export const draftKey = (userId: string, exerciseId: string, date?: string) =>
  `workout:draft:v1:${userId}:${exerciseId}${date === undefined ? "" : `:${date}`}`;
export const perSetDraftKey = (userId: string, exerciseId: string, date?: string) =>
  `workout:draft:v2:${userId}:${exerciseId}${date === undefined ? "" : `:${date}`}`;
export function removeExerciseDrafts(userId: string, exerciseId: string) {
  const bases = [draftKey(userId, exerciseId), perSetDraftKey(userId, exerciseId)];
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key && bases.some((base) => key === base || key.startsWith(`${base}:`)))
      localStorage.removeItem(key);
  }
}
export const hasDraftInput = (draft: WorkoutDraft) =>
  !!draft.operation || Object.values(draft.dirty).some(Boolean);
export const hasPerSetDraftInput = (draft: PerSetWorkoutDraft) =>
  !!draft.operation || draft.recordedSetIds.length > 0 || Object.values(draft.dirty).some(Boolean);
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function newDraft(userId: string, exerciseId: string, fields: WorkoutFields): WorkoutDraft {
  return {
    version: 1,
    userId,
    exerciseId,
    id: crypto.randomUUID(),
    fields,
    dirty: { date: false, weight: false, reps: false, rir: false, notes: false },
    operation: null,
  };
}

export function newPerSetDraft(
  userId: string,
  exerciseId: string,
  fields: PerSetWorkoutFields,
): PerSetWorkoutDraft {
  return {
    version: 2,
    userId,
    exerciseId,
    id: crypto.randomUUID(),
    fields,
    recordedSetIds: [],
    dirty: { date: false, sets: false, notes: false },
    operation: null,
  };
}

export function readDraft(userId: string, exerciseId: string, date?: string): WorkoutDraft | null {
  const raw = localStorage.getItem(draftKey(userId, exerciseId));
  if (date !== undefined) {
    const latest = raw ? parseDraft(raw, userId, exerciseId) : null;
    if (latest?.fields.date === date) return latest;
    const archived = localStorage.getItem(draftKey(userId, exerciseId, date));
    if (!archived) return null;
    const restored = parseDraft(archived, userId, exerciseId);
    if (restored.fields.date !== date) throw new Error("Дата черновика не совпадает.");
    return restored;
  }
  return raw ? parseDraft(raw, userId, exerciseId) : null;
}

export function readPerSetDraft(
  userId: string,
  exerciseId: string,
  date?: string,
): PerSetWorkoutDraft | null {
  const raw = localStorage.getItem(perSetDraftKey(userId, exerciseId));
  if (date !== undefined) {
    const latest = raw ? parsePerSetDraft(raw, userId, exerciseId) : null;
    if (latest?.fields.date === date) return latest;
    const archived = localStorage.getItem(perSetDraftKey(userId, exerciseId, date));
    if (!archived) return null;
    const restored = parsePerSetDraft(archived, userId, exerciseId);
    if (restored.fields.date !== date) throw new Error("Дата черновика не совпадает.");
    return restored;
  }
  return raw ? parsePerSetDraft(raw, userId, exerciseId) : null;
}

function parseDraft(raw: string, userId: string, exerciseId: string): WorkoutDraft {
  const draft: unknown = JSON.parse(raw);
  if (
    !isRecord(draft) ||
    draft["version"] !== 1 ||
    draft["userId"] !== userId ||
    draft["exerciseId"] !== exerciseId ||
    typeof draft["id"] !== "string" ||
    !uuid.test(draft["id"])
  )
    throw new Error("Не удалось восстановить черновик. Сохранённые данные не изменены.");
  const fields = draft["fields"],
    dirty = draft["dirty"],
    operation = draft["operation"];
  if (
    !isRecord(fields) ||
    !isRecord(dirty) ||
    !["date", "weight", "rir", "notes"].every((key) => typeof fields[key] === "string") ||
    !Array.isArray(fields["reps"]) ||
    fields["reps"].length < 1 ||
    fields["reps"].length > MAX_SETS ||
    !fields["reps"].every((value) => typeof value === "string") ||
    !["date", "weight", "reps", "rir", "notes"].every((key) => typeof dirty[key] === "boolean")
  )
    throw new Error("Не удалось восстановить черновик. Сохранённые данные не изменены.");
  if (operation !== null) {
    if (!isRecord(operation) || operation["id"] !== draft["id"] || !isRecord(operation["payload"]))
      throw new Error("Повреждена сохранённая операция. Данные не изменены.");
    const payload = operation["payload"];
    if (payload["exercise_id"] !== exerciseId || typeof payload["day_id"] !== "string")
      throw new Error("Операция относится к другому упражнению.");
    const expected = validateWorkout(fields as WorkoutFields, exerciseId, payload["day_id"]);
    if (JSON.stringify(expected) !== JSON.stringify(payload))
      throw new Error("Данные операции не совпадают с черновиком.");
  }
  return draft as WorkoutDraft;
}

/** Always persist the operation before network I/O. A storage failure must stop submission. */
export function writeDraft(draft: WorkoutDraft) {
  const previous = readDraft(draft.userId, draft.exerciseId);
  if (previous && previous.fields.date !== draft.fields.date && hasDraftInput(previous)) {
    // Preserve the other session BEFORE replacing the latest-draft pointer, including frozen retries.
    localStorage.setItem(
      draftKey(previous.userId, previous.exerciseId, previous.fields.date),
      JSON.stringify(previous),
    );
  }
  localStorage.setItem(draftKey(draft.userId, draft.exerciseId), JSON.stringify(draft));
}

export function writePerSetDraft(draft: PerSetWorkoutDraft) {
  const previous = readPerSetDraft(draft.userId, draft.exerciseId);
  if (previous && previous.fields.date !== draft.fields.date && hasPerSetDraftInput(previous)) {
    localStorage.setItem(
      perSetDraftKey(previous.userId, previous.exerciseId, previous.fields.date),
      JSON.stringify(previous),
    );
  }
  localStorage.setItem(perSetDraftKey(draft.userId, draft.exerciseId), JSON.stringify(draft));
}

export function removeSavedDraft(
  userId: string,
  exerciseId: string,
  operationId: string,
  date: string,
) {
  for (const key of [draftKey(userId, exerciseId), draftKey(userId, exerciseId, date)]) {
    const raw = localStorage.getItem(key);
    if (raw && parseDraft(raw, userId, exerciseId).id === operationId) localStorage.removeItem(key);
  }
}

export function removeSavedPerSetDraft(
  userId: string,
  exerciseId: string,
  operationId: string,
  date: string,
) {
  for (const key of [
    perSetDraftKey(userId, exerciseId),
    perSetDraftKey(userId, exerciseId, date),
  ]) {
    const raw = localStorage.getItem(key);
    if (raw && parsePerSetDraft(raw, userId, exerciseId).id === operationId)
      localStorage.removeItem(key);
  }
}

function parsePerSetDraft(raw: string, userId: string, exerciseId: string): PerSetWorkoutDraft {
  const draft: unknown = JSON.parse(raw);
  if (
    !isRecord(draft) ||
    draft["version"] !== 2 ||
    draft["userId"] !== userId ||
    draft["exerciseId"] !== exerciseId ||
    typeof draft["id"] !== "string" ||
    !uuid.test(draft["id"])
  )
    throw new Error("Не удалось восстановить черновик подходов. Данные не изменены.");
  const fields = draft["fields"],
    dirty = draft["dirty"],
    operation = draft["operation"];
  if (
    !isRecord(fields) ||
    typeof fields["date"] !== "string" ||
    typeof fields["notes"] !== "string" ||
    !Array.isArray(fields["sets"]) ||
    fields["sets"].length < 1 ||
    fields["sets"].length > MAX_SETS ||
    !isRecord(dirty) ||
    !["date", "sets", "notes"].every((key) => typeof dirty[key] === "boolean")
  )
    throw new Error("Не удалось восстановить черновик подходов. Данные не изменены.");
  if (operation !== null) {
    if (!isRecord(operation) || operation["id"] !== draft["id"] || !isRecord(operation["payload"]))
      throw new Error("Повреждена сохранённая операция подходов. Данные не изменены.");
    const payload = operation["payload"];
    if (payload["exercise_id"] !== exerciseId || typeof payload["day_id"] !== "string")
      throw new Error("Операция подходов относится к другому упражнению.");
    const expected = validatePerSetWorkout(
      fields as unknown as PerSetWorkoutFields,
      exerciseId,
      payload["day_id"],
    );
    if (JSON.stringify(expected) !== JSON.stringify(payload))
      throw new Error("Данные операции подходов не совпадают с черновиком.");
  } else {
    // Validate identifiers and raw field shapes without normalizing user input.
    const sets = fields["sets"] as unknown[];
    for (const [index, item] of sets.entries()) {
      if (
        !isRecord(item) ||
        typeof item["id"] !== "string" ||
        !uuid.test(item["id"]) ||
        item["position"] !== index + 1 ||
        typeof item["weight"] !== "string" ||
        typeof item["reps"] !== "string" ||
        typeof item["rir"] !== "string" ||
        (item["set_type"] !== "warmup" && item["set_type"] !== "working") ||
        (item["load_type"] !== "external" && item["load_type"] !== "bodyweight")
      )
        throw new Error("Повреждён один из подходов черновика. Данные не изменены.");
    }
  }
  const ids = (fields["sets"] as unknown[])
    .filter(isRecord)
    .map((set) => set["id"])
    .filter((id): id is string => typeof id === "string");
  const recorded = draft["recordedSetIds"] === undefined ? [] : draft["recordedSetIds"];
  if (
    !Array.isArray(recorded) ||
    !recorded.every((id) => typeof id === "string" && uuid.test(id) && ids.includes(id)) ||
    new Set(recorded).size !== recorded.length
  )
    throw new Error("В черновике Focus Mode поврежден список подтверждённых подходов.");
  return { ...draft, recordedSetIds: recorded } as unknown as PerSetWorkoutDraft;
}
