import { describe, expect, it } from "vitest";
import { resolveProgressSelection } from "./progress-selection";
import type { Day, Exercise } from "./queries";

const days: Day[] = [
  { revision: 0, id: "day-1", name: "Push", position: 0, archived_at: null },
  {
    revision: 0,
    id: "day-2",
    name: "Длинное название личного тренировочного дня",
    position: 1,
    archived_at: null,
  },
  { revision: 0, id: "day-3", name: "Old", position: 2, archived_at: "2026-01-01" },
];
const exercise = (
  id: string,
  day_id: string | null,
  archived_at: string | null = null,
): Exercise => ({
  revision: 0,
  id,
  day_id,
  archived_at,
  name: id,
  position: 0,
  target_sets: null,
  target_reps: null,
  target_rir_min: null,
  target_rir_max: null,
  working_weight: null,
  example_reps: null,
});
const exercises = [
  exercise("a", "day-1"),
  exercise("b", "day-2"),
  exercise("old", "day-3"),
  exercise("archived", "day-1", "2026-01-01"),
  exercise("legacy", null),
];

describe("progress day and exercise selection", () => {
  it("starts at the first active day and its first active exercise", () => {
    expect(resolveProgressSelection(days, exercises, "active", "", "")).toMatchObject({
      dayId: "day-1",
      exerciseId: "a",
      dayExercises: [exercises[0]],
    });
  });
  it("filters exercises by day and rejects a stale exercise selection", () => {
    expect(resolveProgressSelection(days, exercises, "active", "day-2", "a")).toMatchObject({
      dayId: "day-2",
      exerciseId: "b",
      dayExercises: [exercises[1]],
    });
  });
  it("keeps archived exercises, days and legacy unassigned exercises in a separate mode", () => {
    expect(resolveProgressSelection(days, exercises, "archive", "day-1", "")).toMatchObject({
      exerciseId: "archived",
      dayExercises: [exercises[3]],
    });
    expect(resolveProgressSelection(days, exercises, "archive", "day-3", "")).toMatchObject({
      exerciseId: "old",
      dayExercises: [exercises[2]],
    });
    expect(
      resolveProgressSelection(days, exercises, "archive", "__unassigned_history__", ""),
    ).toMatchObject({
      exerciseId: "legacy",
      dayExercises: [exercises[4]],
    });
  });
  it("falls back when the selected day is archived or its exercise moved", () => {
    expect(resolveProgressSelection(days, exercises, "active", "day-3", "old").dayId).toBe("day-1");
    expect(resolveProgressSelection(days, exercises, "active", "day-1", "b").exerciseId).toBe("a");
  });
  it("supports an empty program", () => {
    expect(resolveProgressSelection([], [], "active", "", "")).toMatchObject({
      dayId: "",
      exerciseId: "",
      dayExercises: [],
    });
  });
});
