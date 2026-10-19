import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { draftKey, newDraft, readDraft, removeSavedDraft, writeDraft } from "@/lib/workout-draft";
import { validateWorkout } from "@/lib/workout-input";
const fields = {
  date: "2026-10-13",
  weight: "50,5",
  reps: ["8", ""],
  rir: "",
  notes: "Сырой ввод",
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
