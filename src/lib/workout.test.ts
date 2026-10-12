import { describe, expect, it } from "vitest";
import { aggregate, weekComparison, weekRange } from "./workout";

const e = (d: string, w: number, reps: number[]) => ({ performed_on: d, weight: w, reps });

describe("workout metrics", () => {
  it("volume = weight × total reps", () => {
    expect(aggregate([e("2026-10-12", 100, [5, 5, 5])], "volume")).toBe(1500);
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
    const r = weekComparison([e("2026-10-13", 100, [5]), e("2026-10-05", 90, [5])], "weight", new Date(2026, 9, 14));
    expect(r.delta).toBe(10);
  });
});
