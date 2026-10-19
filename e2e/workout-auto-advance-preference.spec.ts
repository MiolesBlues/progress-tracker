import { expect, test } from "@playwright/test";
import { addExercise, register, fillWorkout } from "./helpers";
import { mockSupabase } from "./mock-supabase";

test("auto-advance preference stays per-user and off mode supports repeated historical entries", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
  const backend = await mockSupabase(page);
  await page.goto("/");
  await register(page, "manual-next@example.invalid", 1);
  await addExercise(page, "Жим лёжа", 3);
  await addExercise(page, "Тяга", 3);

  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
  const preference = settings.getByRole("checkbox", {
    name: "Автоматически переходить к следующему упражнению",
    exact: true,
  });
  await expect(preference).toBeChecked();
  await preference.click();
  await expect(preference).not.toBeChecked();
  await settings.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Настройки", exact: true }).getByRole("checkbox", {
      name: "Автоматически переходить к следующему упражнению",
      exact: true,
    }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();

  const exercise = backend.rows["program_exercises"]!.find((row) => row["name"] === "Жим лёжа")!;
  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  await expect(page.getByLabel("Упражнение", { exact: true })).toHaveValue(exercise.id);

  const fillEntry = async (date: string, weight: string, reps: string[]) => {
    await page.getByLabel("Дата", { exact: true }).fill(date);
    await expect(page.getByLabel("Дата", { exact: true })).toHaveValue(date);
    await fillWorkout(page, weight, reps, "2");
  };
  const date1 = "2026-09-01";
  await fillEntry(date1, "50", ["8", "8", "8"]);
  await page.getByLabel("RIR подхода 1", { exact: true }).fill("2");
  backend.loseSaveResponse = true;
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("button", { name: "Повторить сохранение", exact: true }).click();
  await expect(page.getByLabel("Упражнение", { exact: true })).toHaveValue(exercise.id);
  await expect(page.getByLabel("Дата", { exact: true })).toHaveValue(date1);
  await expect(page.getByLabel("Вес подхода 1", { exact: true })).toHaveValue("50");
  await expect(page.getByLabel("Повторения подхода 3", { exact: true })).toHaveValue("8");
  await expect(page.getByLabel("RIR подхода 1", { exact: true })).toHaveValue("2");
  expect(backend.saveCalls[0]).toBe(backend.saveCalls[1]);
  expect(
    backend.rows["workout_entries"]!.filter((row) => row["exercise_id"] === exercise.id),
  ).toHaveLength(1);

  const date2 = "2026-09-05";
  await fillEntry(date2, "52,5", ["8", "8", "7"]);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByLabel("Упражнение", { exact: true })).toHaveValue(exercise.id);
  await expect(page.getByLabel("Дата", { exact: true })).toHaveValue(date2);
  await expect(page.getByLabel("Вес подхода 1", { exact: true })).toHaveValue("52.5");
  await expect(page.getByLabel("RIR подхода 1", { exact: true })).toHaveValue("2");

  const date3 = "2026-09-10";
  await fillEntry(date3, "55", ["8", "7", "6"]);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByLabel("Упражнение", { exact: true })).toHaveValue(exercise.id);
  await expect(page.getByLabel("Дата", { exact: true })).toHaveValue(date3);

  const entries = backend.rows["workout_entries"]!.filter(
    (row) => row["exercise_id"] === exercise.id,
  );
  expect(entries.map((row) => row["performed_on"])).toEqual([date1, date2, date3]);
  expect(entries.map((row) => row["weight"])).toEqual([50, 52.5, 55]);
  expect(entries.map((row) => row["reps"])).toEqual([
    [8, 8, 8],
    [8, 8, 7],
    [8, 7, 6],
  ]);
  expect(new Set(entries.map((row) => row.id)).size).toBe(3);
  expect(new Set(backend.saveCalls).size).toBe(3);
});
