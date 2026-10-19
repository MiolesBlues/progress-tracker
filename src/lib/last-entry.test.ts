import { QueryClient } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it } from "vitest";
import { fake, resetFake } from "@/test/supabase-mock";
import { lastEntryQuery } from "./queries";

let client: QueryClient;
beforeEach(() => {
  resetFake();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());

it("selects only the current user's exercise at or before the date, ordered by date/time/id", async () => {
  const base = {
    user_id: "A",
    exercise_id: "ex",
    performed_on: "2026-10-15",
    created_at: "2026-10-15T12:00:00.000001Z",
    weight: 50,
    reps: [8, 8, 7, 6],
    rir: 2,
  };
  fake.state.rows.workout_entries = [
    { ...base, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    {
      ...base,
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      created_at: "2026-10-15T12:00:00.000002Z",
      weight: 52.5,
      reps: [8, 8, 7, 7],
    },
    {
      ...base,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      created_at: "2026-10-15T12:00:00.000002Z",
      weight: 0,
      reps: [9, 8],
      rir: 1,
    },
    {
      ...base,
      id: "past",
      performed_on: "2026-10-14",
      created_at: "2026-10-16T12:00:00Z",
      weight: 60,
    },
    { ...base, id: "future", performed_on: "2026-10-16", weight: 70 },
    { ...base, id: "other-exercise", exercise_id: "other", weight: 80 },
    { ...base, id: "other-user", user_id: "B", weight: 90 },
  ];
  const latest = await client.fetchQuery(lastEntryQuery("A", "ex", "2026-10-15"));
  expect(latest).toMatchObject({ weight: 0, reps: [9, 8], rir: 1 });
  fake.state.rows.workout_entries = fake.state.rows.workout_entries.filter(
    (row) => row.id !== "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  );
  expect(await client.fetchQuery(lastEntryQuery("A", "ex", "2026-10-15"))).toMatchObject({
    weight: 52.5,
    reps: [8, 8, 7, 7],
  });
  expect(await client.fetchQuery(lastEntryQuery("A", "ex", "2026-10-14"))).toMatchObject({
    weight: 60,
  });
  expect(await client.fetchQuery(lastEntryQuery("A", "ex", "2026-10-13"))).toBeNull();
  expect(
    fake.state.calls.every((call) =>
      call.table === "workout_entry_sets"
        ? call.filters["user_id"] === "A" && !!call.filters["workout_entry_id"] && !!call.signal
        : call.filters["user_id"] === "A" && call.filters["exercise_id"] === "ex" && !!call.signal,
    ),
  ).toBe(true);
});
