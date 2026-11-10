import { expect, test, type Page } from "@playwright/test";
import { addExercise, register } from "./helpers";
import { mockSupabase } from "./mock-supabase";

async function chooseSelectOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("two tabs keep independent workout drafts when one tab saves", async ({ page, context }) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
  const backend = await mockSupabase(page);
  await register(page, "two-tabs@example.invalid", 1);
  await addExercise(page);
  const exercise = backend.rows["program_exercises"]![0]!;

  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  for (let index = 1; index <= 4; index++) {
    await page.getByLabel(`Вес подхода ${index}`, { exact: true }).fill("61");
    await page.getByLabel(`Повторения подхода ${index}`, { exact: true }).fill("8");
  }

  const secondTab = await context.newPage();
  await secondTab.goto("/");
  await secondTab.getByRole("link", { name: "Тренировка", exact: true }).click();
  await chooseSelectOption(secondTab, "Упражнение", String(exercise["name"]));
  await secondTab.getByLabel("Вес подхода 1", { exact: true }).fill("72");
  await secondTab.getByLabel("Повторения подхода 1", { exact: true }).fill("6");

  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect.poll(() => backend.rows["workout_entries"]!.length).toBe(1);
  await secondTab.reload();
  await secondTab.getByRole("link", { name: "Тренировка", exact: true }).click();
  await expect(secondTab.getByLabel("Вес подхода 1", { exact: true })).toHaveValue("72");
  await expect(secondTab.getByLabel("Повторения подхода 1", { exact: true })).toHaveValue("6");
});
