import { expect, test } from "@playwright/test";
import { addExercise, fillWorkout, register, noOverflow } from "./helpers";
import { mockSupabase } from "./mock-supabase";

test("Focus logs the shared Standard draft once with independent set values", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
  const backend = await mockSupabase(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await register(page, "focus-logging@example.invalid", 1);
  await addExercise(page, "Жим лёжа", 2);
  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  await expect(page.getByLabel("Вес подхода 1", { exact: true })).toHaveValue("");
  await fillWorkout(page, "40", ["8", "7"], "2");
  await page.getByLabel("Вес подхода 2", { exact: true }).fill("42,5");
  await page.getByRole("button", { name: "Фокус", exact: true }).click();
  await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
  await expect(page.getByLabel("Вес подхода 1", { exact: true })).toHaveValue("40");
  await page.getByRole("button", { name: "Записать подход", exact: true }).click();
  await expect(page.getByLabel("Вес подхода 2", { exact: true })).toHaveValue("42,5");
  expect(backend.saveCalls).toHaveLength(0);
  await page.getByRole("button", { name: "Записать подход", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Тренировка завершена", exact: true }),
  ).toBeVisible();
  expect(backend.saveCalls).toHaveLength(1);
  expect(backend.rows["workout_entries"]).toHaveLength(1);
  expect(backend.rows["workout_entries"]![0]!["performed_on"]).toBe("2026-10-15");
  expect(backend.rows["workout_entry_sets"]).toMatchObject([
    { position: 1, weight: "40", reps: 8, rir: "2" },
    { position: 2, weight: "42.5", reps: 7, rir: "2" },
  ]);
  expect(new Set(backend.rows["workout_entry_sets"]!.map((set) => set.id)).size).toBe(2);
  await noOverflow(page);
  expect(errors).toEqual([]);
});
