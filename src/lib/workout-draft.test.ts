import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  draftKey,
  removeExerciseDrafts,
  newDraft,
  readDraft,
  removeSavedDraft,
  writeDraft,
  newPerSetDraft,
  perSetDraftKey,
  readPerSetDraft,
  removeSavedPerSetDraft,
  writePerSetDraft,
} from "@/lib/workout-draft";
import { validatePerSetWorkout, validateWorkout } from "@/lib/workout-input";
const fields = {
  date: "2026-10-13",
  weight: "50,5",
  reps: ["8", ""],
  rir: "",
  notes: "Сырой ввод",
};
const setFields = {
  date: "2026-10-13",
  sets: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      position: 1,
      weight: "50,5",
      reps: "8",
      rir: "2",
      set_type: "working" as const,
      load_type: "external" as const,
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      position: 2,
      weight: "52.50",
      reps: "7",
      rir: "",
      set_type: "working" as const,
      load_type: "external" as const,
    },
  ],
  notes: "Per-set draft",
};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", { randomUUID });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it("round-trips raw unfinished fields and dirty state per user/exercise", () => {
  const draft = newDraft("A", "ex", fields);
  draft.dirty.weight = true;
  draft.dirty.reps = true;
  writeDraft(draft);
  expect(readDraft("A", "ex")).toEqual(draft);
  expect(readDraft("B", "ex")).toBeNull();
  expect(readDraft("A", "other")).toBeNull();
});
it("a late acknowledgement cannot remove a newer draft of the same exercise", () => {
  const old = newDraft("A", "ex", fields),
    next = newDraft("A", "ex", { ...fields, notes: "Новая тренировка" });
  writeDraft(next);
  removeSavedDraft("A", "ex", old.id, old.fields.date);
  expect(readDraft("A", "ex")?.fields.notes).toBe("Новая тренировка");
});
it("isolates V2 drafts by tab and a save acknowledgement cannot erase another tab's edits", () => {
  const first = newPerSetDraft("A", "ex", setFields);
  first.dirty.sets = true;
  first.operation = { id: first.id, payload: validatePerSetWorkout(first.fields, "ex", "day") };
  writePerSetDraft(first);
  const firstTab = sessionStorage.getItem("workout:draft:tab-id");
  sessionStorage.setItem("workout:draft:tab-id", "second-tab");
  const second = newPerSetDraft("A", "ex", { ...setFields, notes: "Вкладка два" });
  second.dirty.notes = true;
  writePerSetDraft(second);

  sessionStorage.setItem("workout:draft:tab-id", firstTab!);
  removeSavedPerSetDraft("A", "ex", first.id, first.fields.date);
  expect(readPerSetDraft("A", "ex")).toBeNull();
  sessionStorage.setItem("workout:draft:tab-id", "second-tab");
  expect(readPerSetDraft("A", "ex")?.id).toBe(second.id);
});
it("forks a mutable legacy V2 draft into independent per-tab entry and set IDs", () => {
  const legacy = newPerSetDraft("A", "ex", setFields);
  legacy.dirty.sets = true;
  localStorage.setItem(perSetDraftKey("A", "ex"), JSON.stringify(legacy));
  sessionStorage.setItem("workout:draft:tab-id", "tab-one");
  const first = readPerSetDraft("A", "ex")!;
  sessionStorage.setItem("workout:draft:tab-id", "tab-two");
  const second = readPerSetDraft("A", "ex")!;
  expect(first.id).not.toBe(legacy.id);
  expect(second.id).not.toBe(first.id);
  expect(first.fields.sets.map((set) => set.id)).not.toEqual(legacy.fields.sets.map((s) => s.id));
  expect(second.fields.sets.map((set) => set.id)).not.toEqual(
    first.fields.sets.map((set) => set.id),
  );
  expect(localStorage.getItem(perSetDraftKey("A", "ex"))).toBe(JSON.stringify(legacy));
});
it("rejects a foreign-owner draft even if it is placed under the current user's key", () => {
  const raw = JSON.stringify(newDraft("B", "ex", fields));
  localStorage.setItem(draftKey("A", "ex"), raw);
  expect(() => readDraft("A", "ex")).toThrow();
  expect(localStorage.getItem(draftKey("A", "ex"))).toBe(raw);
});
it("restores the operation UUID and detects a modified pending payload", () => {
  const draft = newDraft("A", "ex", { ...fields, reps: ["8", "7"] });
  draft.operation = { id: draft.id, payload: validateWorkout(draft.fields, "ex", "day") };
  writeDraft(draft);
  expect(readDraft("A", "ex")?.operation).toEqual(draft.operation);
  draft.operation.payload.weight = 100;
  writeDraft(draft);
  expect(() => readDraft("A", "ex")).toThrow("не совпадают");
});

it("keeps raw drafts of different dates and users without changing pending payloads", () => {
  const old = newDraft("A", "ex", { ...fields, reps: ["8", "7"] });
  old.operation = { id: old.id, payload: validateWorkout(old.fields, "ex", "day") };
  writeDraft(old);
  const next = newDraft("A", "ex", { ...fields, date: "2026-10-15", notes: "Новый ввод" });
  next.dirty.notes = true;
  writeDraft(next);
  expect(readDraft("A", "ex", "2026-10-13")).toEqual(old);
  expect(readDraft("A", "ex", "2026-10-15")).toEqual(next);
  expect(readDraft("B", "ex", "2026-10-13")).toBeNull();
  removeSavedDraft("A", "ex", old.id, old.fields.date);
  expect(readDraft("A", "ex", "2026-10-13")).toBeNull();
  expect(readDraft("A", "ex", "2026-10-15")).toEqual(next);
});

it("does not replace an old draft when preserving it fails", () => {
  const old = newDraft("A", "ex", fields);
  old.dirty.weight = true;
  writeDraft(old);
  vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("quota");
  });
  expect(() => writeDraft(newDraft("A", "ex", { ...fields, date: "2026-10-15" }))).toThrow("quota");
  expect(readDraft("A", "ex")).toEqual(old);
  vi.restoreAllMocks();
});

it("round-trips versioned per-set drafts with distinct weights, nullable RIR and stable IDs", () => {
  const draft = newPerSetDraft("A", "ex", setFields);
  draft.dirty.sets = true;
  draft.operation = {
    id: draft.id,
    payload: validatePerSetWorkout(draft.fields, "ex", "day"),
  };
  writePerSetDraft(draft);
  const restored = readPerSetDraft("A", "ex");
  expect(restored).toEqual(draft);
  expect(restored?.fields.sets.map((set) => set.id)).toEqual(setFields.sets.map((set) => set.id));
  expect(readPerSetDraft("B", "ex")).toBeNull();
  expect(readPerSetDraft("A", "other")).toBeNull();
});

it("preserves per-set drafts for another date and removes only the acknowledged operation", () => {
  const old = newPerSetDraft("A", "ex", setFields);
  old.dirty.sets = true;
  old.operation = { id: old.id, payload: validatePerSetWorkout(old.fields, "ex", "day") };
  writePerSetDraft(old);
  const next = newPerSetDraft("A", "ex", { ...setFields, date: "2026-10-15" });
  next.dirty.notes = true;
  writePerSetDraft(next);
  expect(readPerSetDraft("A", "ex", "2026-10-13")).toEqual(old);
  removeSavedPerSetDraft("A", "ex", old.id, old.fields.date);
  expect(readPerSetDraft("A", "ex", "2026-10-13")).toBeNull();
  expect(readPerSetDraft("A", "ex", "2026-10-15")).toEqual(next);
});

it("rejects a modified frozen per-set payload and a foreign per-set draft", () => {
  const draft = newPerSetDraft("A", "ex", setFields);
  draft.operation = { id: draft.id, payload: validatePerSetWorkout(draft.fields, "ex", "day") };
  writePerSetDraft(draft);
  draft.operation.payload.sets[1]!.weight = "90";
  writePerSetDraft(draft);
  expect(() => readPerSetDraft("A", "ex")).toThrow("не совпадают");

  localStorage.setItem(
    perSetDraftKey("A", "ex"),
    JSON.stringify(newPerSetDraft("B", "ex", setFields)),
  );
  expect(() => readPerSetDraft("A", "ex")).toThrow();
});

it("removes both legacy and per-set draft versions when an exercise is permanently deleted", () => {
  const legacy = newDraft("A", "ex", fields);
  const perSet = newPerSetDraft("A", "ex", setFields);
  writeDraft(legacy);
  writePerSetDraft(perSet);
  localStorage.setItem(draftKey("A", "ex", "2026-10-01"), JSON.stringify(legacy));
  localStorage.setItem(perSetDraftKey("A", "ex", "2026-10-01"), JSON.stringify(perSet));
  removeSavedDraft("A", "ex", legacy.id, legacy.fields.date);
  // removeExerciseDrafts is invoked by permanent program deletion and owns both versions.
  removeExerciseDrafts("A", "ex");
  expect(readDraft("A", "ex")).toBeNull();
  expect(readPerSetDraft("A", "ex")).toBeNull();
  expect(localStorage.getItem(perSetDraftKey("A", "ex", "2026-10-01"))).toBeNull();
});
