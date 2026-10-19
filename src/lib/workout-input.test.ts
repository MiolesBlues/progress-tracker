import { expect, it } from "vitest";
import { validateWorkout, validatePerSetWorkout, MAX_REPS } from "@/lib/workout-input";
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

it("validates per-set values independently and preserves exact numeric strings and NULL RIR", () => {
  const result = validatePerSetWorkout(
    {
      date: "2026-10-13",
      notes: "",
      sets: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          position: 1,
          weight: "52,55",
          reps: "8",
          rir: "2,5",
          set_type: "working",
          load_type: "external",
        },
        {
          id: "10000000-0000-4000-8000-000000000002",
          position: 2,
          weight: "0",
          reps: "0",
          rir: "",
          set_type: "warmup",
          load_type: "bodyweight",
        },
      ],
    },
    "ex",
    "day",
  );
  expect(result.sets).toEqual([
    {
      id: "10000000-0000-4000-8000-000000000001",
      position: 1,
      weight: "52.55",
      reps: 8,
      rir: "2.5",
      set_type: "working",
      load_type: "external",
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      position: 2,
      weight: "0",
      reps: 0,
      rir: null,
      set_type: "warmup",
      load_type: "bodyweight",
    },
  ]);
});

it("rejects duplicate stable set IDs, invalid decimal precision and noncontiguous order", () => {
  const base = {
    date: "2026-10-13",
    notes: "",
    sets: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        position: 1,
        weight: "52.55",
        reps: "8",
        rir: "",
        set_type: "working" as const,
        load_type: "external" as const,
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        position: 2,
        weight: "52.5",
        reps: "8",
        rir: "",
        set_type: "working" as const,
        load_type: "external" as const,
      },
    ],
  };
  expect(() =>
    validatePerSetWorkout(
      { ...base, sets: [{ ...base.sets[0]!, id: base.sets[1]!.id }, base.sets[1]!] },
      "ex",
      "day",
    ),
  ).toThrow("уникальными");
  expect(() =>
    validatePerSetWorkout(
      { ...base, sets: [{ ...base.sets[0]!, weight: "52.555" }, base.sets[1]!] },
      "ex",
      "day",
    ),
  ).toThrow("знаков");
  expect(() =>
    validatePerSetWorkout(
      { ...base, sets: [{ ...base.sets[0]!, position: 2 }, base.sets[1]!] },
      "ex",
      "day",
    ),
  ).toThrow("последовательным");
});
