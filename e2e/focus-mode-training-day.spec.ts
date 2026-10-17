import { expect, test } from "@playwright/test";
import { addExercise, noOverflow, register } from "./helpers";
import { mockSupabase } from "./mock-supabase";

test("Focus Mode shows the training day instead of date and keeps the date across mode changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await mockSupabase(page);
  await page.goto("/");
  await register(page, `focus-mode-${Date.now()}@example.invalid`, 1);
  await addExercise(page, "Focus day check", 3);
  await page.goto("/workout");

  const date = page.getByLabel("Дата", { exact: true });
  await expect(date).toBeVisible();
  await date.fill("2026-10-14");
  await page.getByRole("button", { name: "Фокус", exact: true }).click();

  await expect(page.getByLabel("Дата", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Тренировочный день" })).toBeVisible();
  await expect(
    page.getByText(
      "Тренируйся без лишних отвлечений. Выполняй упражнения по очереди и записывай результаты сразу после каждого подхода.",
      { exact: true },
    ),
  ).toBeVisible();
  await noOverflow(page);

  await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
  await expect(page.getByLabel("Дата", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText(
      "Тренируйся без лишних отвлечений. Выполняй упражнения по очереди и записывай результаты сразу после каждого подхода.",
      { exact: true },
    ),
  ).toBeVisible();
  await noOverflow(page);

  await page.getByRole("button", { name: "Обычный", exact: true }).click();
  await expect(page.getByLabel("Дата", { exact: true })).toHaveValue("2026-10-14");
  await expect(page.getByRole("combobox", { name: "Тренировочный день" })).toBeVisible();
  await expect(
    page.getByText(
      "Тренируйся без лишних отвлечений. Выполняй упражнения по очереди и записывай результаты сразу после каждого подхода.",
      { exact: true },
    ),
  ).toHaveCount(0);
  await noOverflow(page);
});
