import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { fake, resetFake } from "@/test/supabase-mock";
import { loadAllPages } from "./pagination";
import { entriesQuery, lastEntryQuery, programQuery } from "./queries";
beforeEach(resetFake);
it("explicitly blocks analytics beyond the protective full-history limit", async () => {
  await expect(
    loadAllPages(
      async () => ({ data: [{ id: "a" }], count: 100001, error: null }),
      new AbortController().signal,
    ),
  ).rejects.toThrow(/без полной выборки/);
});
it("refuses invalid legacy results without rewriting them", async () => {
  const legacy = {
    id: "legacy",
    user_id: "A",
    exercise_id: "ex",
    performed_on: "2026-10-05",
    created_at: "2026-10-05T10:00:00Z",
    weight: 50,
    reps: [null, 8],
  };
  fake.state.rows.workout_entries = [legacy];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await expect(qc.fetchQuery(entriesQuery("A", "ex", "2026-01-01", "2026-10-13"))).rejects.toThrow(
    /некорректные старые/,
  );
  expect(legacy.reps).toEqual([null, 8]);
  qc.clear();
});
it("does not fall back to a stale legacy summary when authoritative sets are missing", async () => {
  fake.state.disableLegacySetSynthesis = true;
  fake.state.rows.workout_entries = [
    {
      id: "missing-sets",
      user_id: "A",
      exercise_id: "ex",
      performed_on: "2026-10-05",
      created_at: "2026-10-05T10:00:00Z",
      weight: "99",
      reps: [1],
      rir: null,
    },
  ];
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await expect(qc.fetchQuery(entriesQuery("A", "ex", "2026-01-01", "2026-10-13"))).rejects.toThrow(
    /без подтверждённых подходов/,
  );
  qc.clear();
});
it("loads 1207 rows despite a server cap smaller than the requested page, sorted stably", async () => {
  fake.state.maxRows = 137;
  fake.state.rows.workout_entries = Array.from({ length: 1207 }, (_, i) => ({
    id: String(i).padStart(5, "0"),
    user_id: "A",
    exercise_id: "ex",
    performed_on: "2026-10-05",
    created_at: "2026-10-05T10:00:00Z",
    weight: "50",
    reps: [8],
    rir: null,
  })).reverse();
  fake.state.rows.workout_entries.push(
    { id: "foreign", user_id: "B", exercise_id: "ex", performed_on: "2026-10-05" },
    { id: "future", user_id: "A", exercise_id: "ex", performed_on: "2099-01-01" },
  );
  fake.state.rows.workout_entry_sets = Array.from({ length: 1207 }, (_, i) => ({
    id: `set-${String(i).padStart(5, "0")}`,
    user_id: "A",
    workout_entry_id: String(i).padStart(5, "0"),
    position: 1,
    weight: "50",
    reps: 8,
    rir: null,
    set_type: "working",
    load_type: "external",
  }));
  const qc = new QueryClient();
  const rows = await qc.fetchQuery(entriesQuery("A", "ex", "2026-01-01", "2026-10-13"));
  expect(rows).toHaveLength(1207);
  expect(rows[0]?.id).toBe("00000");
  expect(rows.at(-1)?.id).toBe("01206");
  expect(fake.state.calls.filter((call) => call.table === "workout_entries")).toHaveLength(9);
  expect(fake.state.calls.filter((call) => call.table === "workout_entry_sets")).toHaveLength(13);
  qc.clear();
});
it.each([1000, 3])(
  "loads all 100 × 20 authoritative sets with API cap %i",
  async (cap) => {
    fake.state.maxRows = cap;
    fake.state.rows.workout_entries = Array.from({ length: 100 }, (_, entry) => ({
      id: `entry-${String(entry).padStart(3, "0")}`,
      user_id: "A",
      exercise_id: "ex",
      performed_on: "2026-10-05",
      created_at: "2026-10-05T10:00:00Z",
      weight: "50",
      reps: Array(20).fill(8),
      rir: null,
    }));
    fake.state.rows.workout_entry_sets = Array.from({ length: 100 }, (_, entry) =>
      Array.from({ length: 20 }, (_, index) => ({
        id: `set-${String(entry).padStart(3, "0")}-${String(index).padStart(2, "0")}`,
        user_id: "A",
        workout_entry_id: `entry-${String(entry).padStart(3, "0")}`,
        position: index + 1,
        weight: String(40 + index),
        reps: 8,
        rir: index === 1 ? null : String(index % 4),
        set_type: index === 0 ? "warmup" : "working",
        load_type: "external",
      })),
    ).flat();
    const qc = new QueryClient();
    const rows = await qc.fetchQuery(entriesQuery("A", "ex", "2026-01-01", "2026-10-13"));
    expect(rows).toHaveLength(100);
    expect(rows.every((entry) => entry.sets?.length === 20)).toBe(true);
    expect(rows[0]?.sets?.map((set) => set.position)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(rows[0]?.sets?.[0]).toMatchObject({ weight: 40, rir: 0, set_type: "warmup" });
    expect(rows[0]?.sets?.[1]).toMatchObject({ weight: 41, rir: null, set_type: "working" });
    qc.clear();
  },
  30_000,
);
it("paginates the exercise archive too", async () => {
  fake.state.maxRows = 1;
  fake.state.rows.program_exercises = [
    { id: "a", user_id: "A", position: 0, working_weight: null },
    { id: "b", user_id: "A", position: 1, working_weight: null },
  ];
  const qc = new QueryClient();
  expect(await qc.fetchQuery(programQuery("A"))).toHaveLength(2);
  qc.clear();
});
it("last-entry is bounded by the selected date with stable same-day tie breaking", async () => {
  fake.state.rows.workout_entries = ["a", "b"].map((id) => ({
    id,
    user_id: "A",
    exercise_id: "ex",
    performed_on: "2026-10-05",
    created_at: "2026-10-05T10:00:00Z",
  }));
  fake.state.rows.workout_entries.push({
    id: "new",
    user_id: "A",
    exercise_id: "ex",
    performed_on: "2026-10-12",
  });
  const qc = new QueryClient();
  expect(await qc.fetchQuery(lastEntryQuery("A", "ex", "2026-10-05"))).toMatchObject({ id: "b" });
  qc.clear();
});
it.each(["truncated", "count-change", "duplicate", "network", "missing-count"])(
  "never returns partial analytics on %s",
  async (mode) => {
    let page = 0;
    const fetch = vi.fn(async () => {
      page++;
      if (page === 1)
        return { data: [{ id: "a" }], count: mode === "missing-count" ? null : 2, error: null };
      return {
        data: mode === "duplicate" ? [{ id: "a" }] : mode === "truncated" ? [] : [{ id: "b" }],
        count: mode === "count-change" ? 3 : 2,
        error: mode === "network" ? new Error("offline") : null,
      };
    });
    await expect(loadAllPages(fetch, new AbortController().signal)).rejects.toBeDefined();
  },
);
it("stops pagination immediately after an account cancellation", async () => {
  const controller = new AbortController();
  const fetch = vi.fn(async () => {
    controller.abort();
    return { data: [{ id: "a" }], count: 2, error: null };
  });
  await expect(loadAllPages(fetch, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
