import { expect, it } from "vitest";
import { validateWorkout, MAX_REPS } from "@/lib/workout-input";
import { prefillFor } from "@/lib/workout";
const fields = {
  date: "2026-10-13",
  weight: "50",
  reps: ["8", "8", "7", "6"],
  rir: "1,5",
  notes: "  точный текст  ",
};

it.each(["", " "])("empty weight %j is not zero", (weight) =>
  expect(() => validateWorkout({ ...fields, weight }, "ex", "day")).toThrow(
    "Пустое значение не равно нулю",
  ),
);
it.each([
  ["0", 0],
  ["52,55", 52.55],
  ["52.55", 52.55],
  ["2000", 2000],
] as const)("preserves weight %s", (weight, expected) => {
  expect(validateWorkout({ ...fields, weight }, "ex", "day")).toMatchObject({
    weight: expected,
    reps: [8, 8, 7, 6],
    rir: 1.5,
    notes: fields.notes,
  });
});
it.each(["2000.01", "-1", "1,234", "1.2.3", "1,2,3", "1e2", "NaN", "Infinity"])(
  "rejects invalid weight %s",
  (weight) => expect(() => validateWorkout({ ...fields, weight }, "ex", "day")).toThrow(),
);
it.each(["", "-1", "8-8-7-6", "3.5", "8abc", String(MAX_REPS + 1)])(
  "does not silently alter reps %s",
  (rep) =>
    expect(() => validateWorkout({ ...fields, reps: ["8", rep, "7", "6"] }, "ex", "day")).toThrow(),
);
it("accepts zero and twenty integer sets, rejects zero/twenty-one sets", () => {
  expect(validateWorkout({ ...fields, reps: Array(20).fill("0") }, "ex", "day").reps).toEqual(
    Array(20).fill(0),
  );
  expect(() => validateWorkout({ ...fields, reps: [] }, "ex", "day")).toThrow();
  expect(() => validateWorkout({ ...fields, reps: Array(21).fill("8") }, "ex", "day")).toThrow();
});
it("rejects invalid dates, RIR precision and oversized notes", () => {
  expect(() => validateWorkout({ ...fields, date: "2026-02-30" }, "ex", "day")).toThrow("дату");
  expect(() => validateWorkout({ ...fields, rir: "1,55" }, "ex", "day")).toThrow("RIR");
  expect(() => validateWorkout({ ...fields, notes: "a".repeat(1001) }, "ex", "day")).toThrow(
    "1000",
  );
});
it("prefill has exactly the planned set count even with an older shorter example", () => {
  expect(
    prefillFor({ target_sets: 4, example_reps: [8, 8], working_weight: 50 }, null).reps,
  ).toEqual(["8", "8", "", ""]);
});
