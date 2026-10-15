import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  addExercise,
  chooseProgramDay,
  firstName,
  longDay,
  noOverflow,
  register,
  secondName,
} from "./helpers";
import { mockSupabase } from "./mock-supabase";

test("English registration and onboarding keep the new account's language", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Начать" })).toBeVisible();
  await page.getByRole("button", { name: "Настройки" }).click();
  await page
    .getByRole("dialog", { name: "Настройки" })
    .getByRole("combobox", { name: "Язык интерфейса" })
    .click();
  await page.getByRole("option", { name: "English" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back!" })).toBeVisible();
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  await page.getByLabel("Email").fill("english-signup@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("Local-only-test-password!");
  await page.getByLabel("Confirm password").fill("Local-only-test-password!");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "How many training days per week?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("Day 1")).toHaveValue("Day A");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Program" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Program" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

for (const width of [320, 375, 390, 430]) {
  test(`language settings and compact screens at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockSupabase(page);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Начать" })).toBeVisible();
    await page.getByRole("button", { name: "Настройки" }).click();
    const dialog = page.getByRole("dialog", { name: "Настройки" });
    await dialog.getByRole("combobox", { name: "Язык интерфейса" }).click();
    await page.getByRole("option", { name: "English" }).click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await noOverflow(page);
    await page.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
    await page.getByRole("button", { name: "Settings" }).click();
    await page
      .getByRole("dialog", { name: "Settings" })
      .getByRole("combobox", { name: "Interface language" })
      .click();
    await page.getByRole("option", { name: "Русский" }).click();
    await page.getByRole("button", { name: "Закрыть" }).click();
    await register(page, `mobile-${width}@example.invalid`, 1);
    await addExercise(page);
    await page.getByRole("link", { name: "Прогресс", exact: true }).click();
    await expect(page.getByLabel("Тренировочный день", { exact: true })).toHaveValue(/.+/);
    await expect(page.getByLabel("Упражнение", { exact: true })).toHaveValue(/.+/);
    await noOverflow(page);
  });
}

test("day then exercise selection, archived results, and account-scoped language", async ({
  page,
}) => {
  const backend = await mockSupabase(page);
  await page.goto("/");
  await register(page, "progress-a@example.invalid", 2);
  await addExercise(page, firstName);
  await chooseProgramDay(page, "День B");
  await addExercise(page, secondName);
  const second = backend.rows["program_exercises"]!.find((row) => row["name"] === secondName)!;
  const secondDay = backend.rows["program_days"]!.find((row) => row.id === second["day_id"])!;
  backend.rows["workout_entries"]!.push({
    id: randomUUID(),
    user_id: second.user_id,
    exercise_id: second.id,
    day_id: secondDay.id,
    day_name: secondDay["name"],
    performed_on: "2026-10-14",
    created_at: "2026-10-14T09:00:00Z",
    weight: 72,
    reps: [8, 8],
    rir: 2,
    notes: "Личная заметка",
  });
  await page.getByRole("link", { name: "Прогресс", exact: true }).click();
  const day = page.getByLabel("Тренировочный день", { exact: true });
  await expect(day).toHaveValue(backend.rows["program_days"]![0]!.id);
  await day.selectOption(secondDay.id);
  await expect(page.getByLabel("Упражнение", { exact: true })).toHaveValue(second.id);
  await expect(page.getByText(/72 кг × 8\/8/)).toBeVisible();
  await page.getByRole("link", { name: "Программа", exact: true }).click();
  await chooseProgramDay(page, "День B");
  await page.getByRole("button", { name: `В архив: ${secondName}` }).click();
  await page.getByRole("link", { name: "Прогресс", exact: true }).click();
  await expect(page.getByRole("button", { name: "Архивная история" })).toBeVisible();
  await page.getByRole("button", { name: "Архивная история" }).click();
  await expect(page.getByLabel("Упражнение", { exact: true })).toHaveValue(second.id);
  await expect(page.getByText(/72 кг × 8\/8/)).toBeVisible();
  await page.getByRole("button", { name: "Настройки" }).click();
  await page
    .getByRole("dialog", { name: "Настройки" })
    .getByRole("combobox", { name: "Язык интерфейса" })
    .click();
  await page.getByRole("option", { name: "English" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  await expect(page.getByRole("option", { name: secondName })).toBeAttached();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  await expect(page).toHaveTitle("Progress — Progress Tracker");
  await noOverflow(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "С возвращением!" })).toBeVisible();
  await register(page, "progress-b@example.invalid", 1);
  await expect(page.getByRole("heading", { name: "Программа" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "День для упражнений" })).toContainText(longDay);
  await expect(page.getByText(secondName)).toHaveCount(0);
});
