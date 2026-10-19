import { describe, expect, it } from "vitest";
import { aggregate, weekComparison, weekRange, workoutMetrics } from "./workout";

const e = (d: string, w: number, reps: number[]) => ({ performed_on: d, weight: w, reps });

describe("workout metrics", () => {
  it("volume = weight × total reps", () => {
    expect(aggregate([e("2026-10-12", 100, [5, 5, 5])], "volume")).toBe(1500);
  });
  it("keeps per-set loads and excludes warm-ups from working metrics", () => {
    const entry = {
      ...e("2026-10-12", 99, [99]),
      sets: [
        {
          position: 1,
          weight: 20,
          reps: 10,
          rir: 4,
          set_type: "warmup" as const,
          load_type: "external" as const,
        },
        {
          position: 2,
          weight: 40,
          reps: 8,
          rir: 2,
          set_type: "working" as const,
          load_type: "external" as const,
        },
        {
          position: 3,
          weight: 42.5,
          reps: 6,
          rir: null,
          set_type: "working" as const,
          load_type: "external" as const,
        },
      ],
    };
    expect(aggregate([entry], "volume")).toBe(575);
    expect(workoutMetrics(entry)).toMatchObject({
      maxWorkingWeight: 42.5,
      workingSets: 2,
      workingReps: 14,
      workingVolume: 575,
      rirHistory: [2, null],
    });
    expect(workoutMetrics(entry).bestWorkingSet).toMatchObject({ position: 2, volume: 320 });
  });
  it("weight aggregates as max", () => {
    expect(aggregate([e("a", 80, [5]), e("b", 90, [3])], "weight")).toBe(90);
  });
  it("week starts Monday", () => {
    expect(weekRange(new Date(2026, 9, 14))).toEqual(["2026-10-12", "2026-10-18"]);
  });
  it("comparison is empty without previous-week records", () => {
    const r = weekComparison([e("2026-10-13", 100, [5])], "weight", new Date(2026, 9, 14));
    expect(r.previous).toBeNull();
    expect(r.delta).toBeNull();
  });
  it("compares with previous calendar week", () => {
    const r = weekComparison(
      [e("2026-10-13", 100, [5]), e("2026-10-05", 90, [5])],
      "weight",
      new Date(2026, 9, 14),
    );
    expect(r.delta).toBe(10);
  });
});

import { prefillFor } from "./workout";
describe("prefillFor", () => {
  it("uses last session when present", () => {
    expect(
      prefillFor(
        { working_weight: 50, example_reps: [7, 7, 6, 6], target_sets: 4 },
        { weight: "52.5", reps: [8, 8] },
      ),
    ).toEqual({ weight: "52.5", reps: ["8", "8"] });
  });
  it("falls back to program starting weight and example reps", () => {
    expect(
      prefillFor({ working_weight: 12.5, example_reps: [10, 10, 10], target_sets: 3 }, null),
    ).toEqual({ weight: "12.5", reps: ["10", "10", "10"] });
  });
  it("null weight stays empty, sets from target", () => {
    expect(prefillFor({ working_weight: null, example_reps: null, target_sets: 4 }, null)).toEqual({
      weight: "",
      reps: ["", "", "", ""],
    });
  });
});

import { defaultDayNames, needsOnboarding } from "./workout";
describe("onboarding", () => {
  it("only for accounts without any days", () => {
    expect(needsOnboarding([])).toBe(true);
    expect(needsOnboarding([{ id: "x" }])).toBe(false);
  });
  it("default names clamp to 1..7", () => {
    expect(defaultDayNames(3)).toEqual(["День A", "День B", "День C"]);
    expect(defaultDayNames(9)).toHaveLength(7);
    expect(defaultDayNames(0)).toEqual(["День A"]);
  });
});
