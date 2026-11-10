import { expect, test, type Page } from "@playwright/test";
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

async function chooseSelectOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("English registration and onboarding keep the new account's language", async ({ page }) => {
  const backend = await mockSupabase(page);
  await page.addInitScript(() => localStorage.setItem("app:language:v1:guest", "en"));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^(Настройки|Settings)$/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back!" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "No account? Sign up" }).click();
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await page.getByLabel("Email").fill("english-signup@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("Local-only-test-password!");
  await page.getByLabel("Confirm password").fill("Local-only-test-password!");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  expect(backend.signupCalls).toHaveLength(1);
  expect(backend.signupCalls[0]?.["email"]).toBe("english-signup@example.invalid");
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
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back!" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await page.getByLabel("Email").fill("english-signup@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("Local-only-test-password!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workout", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Program", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Program", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

for (const width of [320, 375, 390, 430]) {
  test(`language settings and compact screens at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockSupabase(page);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Начать" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Настройки|Settings)$/ })).toHaveCount(0);
    await page.getByRole("link", { name: "Начать", exact: true }).click();
    await expect(page.getByRole("heading", { name: "С возвращением!" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Настройки|Settings)$/ })).toHaveCount(0);
    await page
      .getByRole("button", { name: "Нет аккаунта? Зарегистрироваться", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Создать аккаунт" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Настройки|Settings)$/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Уже есть аккаунт? Войти", exact: true }).click();
    await register(page, `mobile-${width}@example.invalid`, 1);
    await page.getByRole("button", { name: "Настройки" }).click();
    const dialog = page.getByRole("dialog", { name: "Настройки" });
    await dialog.getByRole("combobox", { name: "Язык интерфейса" }).click();
    await page.getByRole("option", { name: "English" }).click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await noOverflow(page);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Program", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Program", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Settings" }).click();
    await page
      .getByRole("dialog", { name: "Settings" })
      .getByRole("combobox", { name: "Interface language" })
      .click();
    await page.getByRole("option", { name: "Русский" }).click();
    await page.getByRole("button", { name: "Закрыть" }).click();
    await expect(page.getByRole("heading", { name: "Программа", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await addExercise(page);
    await page.getByRole("link", { name: "Прогресс", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Тренировочный день" })).not.toBeEmpty();
    await expect(page.getByRole("combobox", { name: "Упражнение" })).not.toBeEmpty();
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
  const day = page.getByRole("combobox", { name: "Тренировочный день", exact: true });
  await expect(day).toContainText(String(backend.rows["program_days"]![0]!["name"]));
  await chooseSelectOption(page, "Тренировочный день", String(secondDay["name"]));
  await expect(page.getByRole("combobox", { name: "Упражнение", exact: true })).toContainText(
    secondName,
  );
  await expect(page.getByText(/1\. 72 кг × 8 · RIR 2.*2\. 72 кг × 8 · RIR 2/)).toBeVisible();
  await page.getByRole("link", { name: "Программа", exact: true }).click();
  await chooseProgramDay(page, "День B");
  await page.getByRole("button", { name: `В архив: ${secondName}` }).click();
  await page.getByRole("link", { name: "Прогресс", exact: true }).click();
  await expect(page.getByRole("button", { name: "Архивная история" })).toBeVisible();
  await page.getByRole("button", { name: "Архивная история" }).click();
  await expect(page.getByRole("combobox", { name: "Упражнение", exact: true })).toContainText(
    secondName,
  );
  await expect(page.getByText(/1\. 72 кг × 8 · RIR 2.*2\. 72 кг × 8 · RIR 2/)).toBeVisible();
  await page.getByRole("button", { name: "Настройки" }).click();
  await page
    .getByRole("dialog", { name: "Настройки" })
    .getByRole("combobox", { name: "Язык интерфейса" })
    .click();
  await page.getByRole("option", { name: "English" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Exercise", exact: true })).toContainText(
    secondName,
  );
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
