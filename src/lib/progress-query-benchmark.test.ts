import { beforeEach, expect, it } from "vitest";
import { fake, resetFake } from "@/test/supabase-mock";
import { chartSeries, compareSessions, previousSessions, type HistoryEntry } from "./analytics";
import { entriesQuery } from "./queries";
import { workoutMetrics } from "./workout";

function fixture(size: number, setsPerEntry: number) {
  const entries: HistoryEntry[] = [];
  const sets = [];
  const base = new Date("2026-01-01T12:00:00");
  for (let index = 0; index < size; index += 1) {
    const date = new Date(base);
    date.setDate(date.getDate() + (index % 180));
    const performedOn = date.toISOString().slice(0, 10);
    const id = "entry-" + String(index).padStart(5, "0");
    const entrySets = Array.from({ length: setsPerEntry }, (_, setIndex) => ({
      id: "set-" + index + "-" + setIndex,
      position: setIndex + 1,
      weight: 20 + ((index + setIndex) % 100),
      weightExact: String(20 + ((index + setIndex) % 100)),
      reps: 5 + ((index + setIndex) % 10),
      rir: setIndex % 3 === 0 ? null : setIndex % 5,
      set_type: setIndex === 0 ? ("warmup" as const) : ("working" as const),
      load_type: setIndex % 2 === 0 ? ("external" as const) : ("bodyweight" as const),
    }));
    entries.push({
      id,
      user_id: "A",
      exercise_id: "bench",
      performed_on: performedOn,
      created_at: performedOn + "T10:00:00.000000Z",
      weight: 50,
      reps: entrySets.map((set) => set.reps),
      rir: null,
      notes: null,
      day_id: "archived-day",
      day_name: "Archived day",
      sets: entrySets,
    });
    fake.state.rows.workout_entries.push({
      id,
      user_id: "A",
      exercise_id: "bench",
      performed_on: performedOn,
      created_at: performedOn + "T10:00:00.000000Z",
      weight: 50,
      reps: entrySets.map((set) => set.reps),
      rir: null,
      notes: null,
      day_id: "archived-day",
      day_name: "Archived day",
    });
    sets.push(...entrySets.map((set) => ({ ...set, user_id: "A", workout_entry_id: id })));
  }
  fake.state.rows.workout_entry_sets = sets;
  fake.state.rows.workout_entries.push({
    id: "foreign-user-entry",
    user_id: "B",
    exercise_id: "bench",
    performed_on: "2026-02-01",
    created_at: "2026-02-01T10:00:00Z",
    weight: 200,
    reps: [20],
    rir: null,
    notes: null,
    day_id: null,
    day_name: null,
  });
  return entries;
}

beforeEach(() => {
  resetFake();
  fake.state.maxRows = 1000;
});

it.each([
  { name: "100 entries × 20 sets", entries: 100, sets: 20 },
  { name: "1,200 entries × 2 sets", entries: 1200, sets: 2 },
])("benchmarks exact Progress loading for $name", async ({ entries, sets }) => {
  const reference = fixture(entries, sets);
  const started = performance.now();
  const loaded = await entriesQuery("A", "bench").queryFn!({
    signal: new AbortController().signal,
    queryKey: [],
    meta: undefined,
    client: {} as never,
  });
  const elapsedMs = performance.now() - started;
  const selectCalls = fake.state.calls.filter(
    (call) =>
      call.operation === "select" && ["workout_entries", "workout_entry_sets"].includes(call.table),
  ).length;
  const rowsTransferred =
    loaded.length + loaded.reduce((total, entry) => total + (entry.sets?.length ?? 0), 0);
  expect(loaded).toHaveLength(entries);
  expect(loaded.at(-1)?.sets).toHaveLength(sets);
  expect(chartSeries(loaded, "volume", "all", "2026-12-31")).toEqual(
    chartSeries(reference, "volume", "all", "2026-12-31"),
  );
  const selected = loaded.at(-1)!;
  const referenceSelected = reference.find((entry) => entry.id === selected.id)!;
  expect(workoutMetrics(selected)).toEqual(workoutMetrics(referenceSelected));
  const loadedPrevious = previousSessions(loaded, selected);
  const referencePrevious = previousSessions(reference, referenceSelected);
  expect(loadedPrevious).toEqual(referencePrevious);
  expect(compareSessions(selected, loadedPrevious.session)).toEqual(
    compareSessions(referenceSelected, referencePrevious.session),
  );
  const sortStarted = performance.now();
  const weightSorted = [...loaded].sort(
    (a, b) =>
      workoutMetrics(b).maxWorkingWeight - workoutMetrics(a).maxWorkingWeight ||
      b.performed_on.localeCompare(a.performed_on) ||
      b.created_at.localeCompare(a.created_at) ||
      b.id.localeCompare(a.id),
  );
  expect(weightSorted).toEqual(
    [...reference].sort(
      (a, b) =>
        workoutMetrics(b).maxWorkingWeight - workoutMetrics(a).maxWorkingWeight ||
        b.performed_on.localeCompare(a.performed_on) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id.localeCompare(a.id),
    ),
  );
  const weightSortMs = performance.now() - sortStarted;
  expect(loaded.some((entry) => entry.user_id === "B")).toBe(false);
  console.info(
    "Progress mock benchmark: entries=" +
      entries +
      ", sets/entry=" +
      sets +
      ", requests=" +
      selectCalls +
      ", rows=" +
      rowsTransferred +
      ", elapsed_ms=" +
      elapsedMs.toFixed(2) +
      ", weight_sort_ms=" +
      weightSortMs.toFixed(2),
  );
});
