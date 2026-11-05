import { describe, expect, it } from "vitest";
import { exercisePatch } from "@/lib/program";

const days = [
  { revision: 0, id: "day", name: "Произвольный день", position: 0, archived_at: null },
];
const values = { name: "Жим", dayId: "day", sets: "4", reps: "6–8", weight: "52,5" };
describe("program input", () => {
  it.each(["0", "21", "3.5", "3abc"])("rejects invalid set count %s", (sets) => {
    expect(() => exercisePatch({ ...values, sets }, days)).toThrow("Число подходов");
  });
  it.each(["8-6", "0", "8abc", "8-12-15"])("rejects invalid rep range %s", (reps) => {
    expect(() => exercisePatch({ ...values, reps }, days)).toThrow("Повторения");
  });
  it("accepts explicit zero weight, decimal comma, and optional targets", () => {
    expect(exercisePatch(values, days).working_weight).toBe(52.5);
    expect(exercisePatch({ ...values, weight: "0" }, days).working_weight).toBe(0);
    expect(exercisePatch({ ...values, sets: "", reps: "", weight: "" }, days)).toMatchObject({
      target_sets: null,
      target_reps: null,
      working_weight: null,
    });
  });
});
