import { expect, test } from "@playwright/test";
import { addExercise, noOverflow, register } from "./helpers";
import { mockSupabase } from "./mock-supabase";

test("theme preference applies across the main mobile screens", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Theme screenshots are captured once in Chromium.");
  const hydrationWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrated|hydration/i.test(message.text()))
      hydrationWarnings.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await mockSupabase(page);
  await page.goto("/auth");
  await expect(page.getByRole("heading", { name: "С возвращением!" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "test-results/theme-dark-auth.png", fullPage: true });
  await page.evaluate(() => localStorage.setItem("app:theme:v1", "light"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: "test-results/theme-light-auth.png", fullPage: true });
  await page.evaluate(() => localStorage.removeItem("app:theme:v1"));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.addStyleTag({ content: "[data-sonner-toaster] { visibility: hidden !important; }" });

  await register(page, "theme-mobile@example.invalid", 1);
  await expect(page.getByRole("heading", { name: "Программа" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: "test-results/theme-dark-program.png", fullPage: true });

  await addExercise(page);
  await page.getByRole("link", { name: "Тренировка" }).click();
  await expect(page.getByRole("heading", { name: "Тренировка" })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("link", { name: "Записи" }).click();
  await expect(page.getByRole("heading", { name: "Записи", exact: true })).toBeVisible();
  await noOverflow(page);
  await page.getByRole("link", { name: "Прогресс" }).click();
  await expect(page.getByRole("heading", { name: "Прогресс" })).toBeVisible();
  await noOverflow(page);

  await page.getByRole("button", { name: "Настройки" }).click();
  await page.getByRole("button", { name: "Светлая" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: "test-results/theme-light-settings.png", fullPage: true });
  await page.getByRole("button", { name: "Закрыть" }).click();
  await expect(page.getByRole("dialog", { name: "Настройки" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/theme-light-progress.png", fullPage: true });
  await page.getByRole("link", { name: "Программа" }).click();
  await expect(page.getByRole("heading", { name: "Программа", exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: "test-results/theme-light-program.png", fullPage: true });
  await page.getByRole("link", { name: "Тренировка" }).click();
  await expect(page.getByRole("heading", { name: "Тренировка", exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: "test-results/theme-light-workout.png", fullPage: true });
  await page.getByRole("link", { name: "Записи" }).click();
  await expect(page.getByRole("heading", { name: "Записи", exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: "test-results/theme-light-entries.png", fullPage: true });
  await page.getByRole("link", { name: "Прогресс" }).click();

  await page.getByRole("button", { name: "Настройки" }).click();
  await page.getByRole("button", { name: "Тёмная" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Тёмная" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(hydrationWarnings).toEqual([]);
  await page.getByRole("button", { name: "Настройки" }).click();
  await page.getByRole("button", { name: "Авто" }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Закрыть" }).click();
  await expect(page.getByRole("dialog", { name: "Настройки" })).toHaveCount(0);
  await noOverflow(page);

  await page.getByRole("button", { name: "Настройки" }).click();
  await page.getByRole("button", { name: "Светлая" }).click();
  await page.getByRole("button", { name: "Закрыть" }).click();
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page.getByRole("heading", { name: "С возвращением!" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await register(page, "theme-mobile-light@example.invalid", 1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("heading", { name: "Программа" })).toBeVisible();
});
