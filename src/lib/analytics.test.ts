import { describe, expect, it } from "vitest";
import {
  chartRange,
  chartSeries,
  compareSessions,
  previousSessions,
  type HistoryEntry,
} from "./analytics";
const row = (id: string, date: string, props: Partial<HistoryEntry> = {}): HistoryEntry => ({
  day_id: null,
  id,
  performed_on: date,
  created_at: `${date}T10:00:00Z`,
  user_id: "A",
  exercise_id: "ex",
  weight: 50,
  reps: [8, 8, 7, 6],
  rir: 2,
  notes: null,
  day_name: "Силовой",
  ...props,
});

describe("session-relative analytics", () => {
  it("preserves timestamp timezone and microsecond order before the ID tie-break", () => {
    const previous = row("z", "2026-10-05", { created_at: "2026-10-05T12:00:00.001001+02:00" });
    const selected = row("a", "2026-10-05", { created_at: "2026-10-05T10:00:00.001002Z" });
    expect(previousSessions([selected, previous], selected).session?.id).toBe("z");
  });
  it("rejects foreign exercise/user or a later entry passed directly to the calculator", () => {
    const selected = row("a", "2026-10-05");
    expect(compareSessions(selected, row("b", "2026-10-04", { user_id: "B" }))).toBeNull();
    expect(compareSessions(selected, row("b", "2026-10-04", { exercise_id: "other" }))).toBeNull();
    expect(compareSessions(selected, row("b", "2026-10-06"))).toBeNull();
  });
  it("does not reinterpret calendar years below 100 as 1900-based dates", () => {
    expect(previousSessions([], row("a", "0099-01-05")).weekRange[0]).toMatch(/^0098-/);
  });
  it("anchors both independent comparisons to the chosen workout, not today's date", () => {
    const chosen = row("chosen", "2026-10-05");
    const sameWeek = row("previous", "2026-10-05", { created_at: "2026-10-05T09:00:00Z" });
    const lastWeek = row("week", "2026-10-04");
    const result = previousSessions(
      [
        chosen,
        row("future", "2026-10-12"),
        lastWeek,
        sameWeek,
        row("other-user", "2026-10-04", { user_id: "B" }),
        row("other-ex", "2026-10-04", { exercise_id: "other" }),
      ],
      chosen,
    );
    expect(result.session?.id).toBe("previous");
    expect(result.week?.id).toBe("week");
    expect(result.weekRange).toEqual(["2026-09-28", "2026-10-04"]);
  });
  it("uses created_at then id to distinguish repeated same-day sessions", () => {
    const a = row("a", "2026-10-05"),
      b = row("b", "2026-10-05"),
      c = row("c", "2026-10-05");
    expect(previousSessions([c, b, a], b).session?.id).toBe("a");
  });
  it("returns empty comparisons when previous calendar week or session has no records", () => {
    const current = row("a", "2026-10-05");
    expect(previousSessions([current], current).session).toBeNull();
    expect(previousSessions([current, row("old", "2026-09-20")], current).week).toBeNull();
    expect(compareSessions(current, null)).toBeNull();
  });
  it("handles Monday/Sunday, year boundaries and leap days", () => {
    expect(previousSessions([], row("a", "2027-01-03")).weekRange).toEqual([
      "2026-12-21",
      "2026-12-27",
    ]);
    expect(chartRange(7, "2024-03-01")).toEqual(["2024-02-24", "2024-03-01"]);
  });
  it("calculates weight percentage, total reps and volume, sets and RIR warnings", () => {
    const cmp = compareSessions(
      row("b", "2026-10-05", { weight: 55, reps: [10, 10], rir: 5 }),
      row("a", "2026-10-04"),
    )!;
    expect(cmp.weightPct).toBe(10);
    expect(cmp.repsDelta).toBe(-9);
    expect(cmp.volumeDelta).toBe(-350);
    expect(cmp.warnings).toHaveLength(2);
  });
  it("does not divide by zero or invent missing RIR", () => {
    const cmp = compareSessions(
      row("b", "2026-10-05", { rir: null }),
      row("a", "2026-10-04", { weight: 0 }),
    )!;
    expect(cmp.weightPct).toBeNull();
    expect(cmp.warnings[0]).toMatch(/RIR/);
  });
  it("does not label differently loaded per-set sessions comparable", () => {
    const current = row("b", "2026-10-05", {
      sets: [
        { position: 1, weight: 55, reps: 8, rir: 2, set_type: "working", load_type: "external" },
        { position: 2, weight: 50, reps: 7, rir: 2, set_type: "working", load_type: "external" },
      ],
    });
    const prior = row("a", "2026-10-04", {
      sets: [
        { position: 1, weight: 50, reps: 10, rir: 2, set_type: "working", load_type: "external" },
      ],
    });
    const result = compareSessions(current, prior)!;
    expect(result.comparable).toBe(false);
    expect(result.warnings).toContain("Разное число подходов: условия несопоставимы.");
  });
  it.each([7, 30, 90, 365] as const)("bounds the %i-day chart on both sides", (period) => {
    const [from, to] = chartRange(period, "2026-10-13");
    const values = chartSeries(
      [
        row("before", "2000-01-01"),
        row("first", from),
        row("last", to),
        row("future", "2026-10-14"),
      ],
      "volume",
      period,
      to,
    );
    expect(values.map((v) => v.date)).toEqual([from, to]);
  });
  it("all time still excludes future results and aggregates same-day entries correctly", () => {
    const entries = [
      row("a", "2000-01-01"),
      row("b", "2000-01-01", { weight: 60 }),
      row("future", "2099-01-01"),
    ];
    expect(chartSeries(entries, "weight", "all", "2026-10-13")).toEqual([
      { date: "2000-01-01", value: 60 },
    ]);
    expect(chartSeries(entries, "reps", "all", "2026-10-13")[0]?.value).toBe(58);
    expect(chartSeries(entries, "volume", "all", "2026-10-13")[0]?.value).toBe(3190);
  });
});
