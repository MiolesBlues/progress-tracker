import { test, expect } from "@playwright/test";
import { addExercise, register } from "./helpers";
import { mockSupabase } from "./mock-supabase";

test("exercise editor stays compact across mobile and desktop sizes", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Responsive theme check runs once in Chromium.");
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSupabase(page);
  await page.goto("/");
  await register(page, "centered-exercise-dialog@example.invalid", 7);
  await addExercise(page, "Жим штанги", 4);

  const trigger = page.getByRole("button", { name: "Редактировать: Жим штанги", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Редактирование упражнения", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Название упражнения", { exact: true })).toHaveValue("Жим штанги");
  await expect(
    dialog.getByRole("combobox", { name: "Тренировочный день", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Подходы", { exact: true })).toHaveValue("4");
  await expect(dialog.getByLabel("Повторения", { exact: true })).toHaveValue("6–8");
  for (const width of [320, 375, 390, 1440]) {
    const height = width === 1440 ? 1000 : 844;
    await page.setViewportSize({ width, height });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await dialog.evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
      );
    });
    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        centerX: rect.x + rect.width / 2,
        centerY: rect.y + rect.height / 2,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
    expect(Math.abs(geometry.centerX - geometry.viewportWidth / 2)).toBeLessThan(2);
    expect(Math.abs(geometry.centerY - geometry.viewportHeight / 2)).toBeLessThan(2);
    expect(geometry.width).toBeCloseTo(Math.min(480, width - 32), 0);
    expect(geometry.height).toBeLessThanOrEqual(height * 0.9 + 1);
    expect(geometry.y).toBeGreaterThanOrEqual(0);
    const save = dialog.getByRole("button", { name: "Сохранить", exact: true });
    const saveBox = await save.boundingBox();
    expect(saveBox).not.toBeNull();
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(height + 1);
  }

  await page.setViewportSize({ width: 320, height: 480 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const name = dialog.getByLabel("Название упражнения", { exact: true });
  await name.focus();
  await name.scrollIntoViewIfNeeded();
  const nameBox = await name.boundingBox();
  const footerBox = await dialog
    .getByRole("button", { name: "Сохранить", exact: true })
    .boundingBox();
  expect(nameBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(nameBox!.y).toBeGreaterThanOrEqual(0);
  expect(nameBox!.y + nameBox!.height).toBeLessThanOrEqual(480);
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(480);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  const reopened = page.getByRole("dialog", { name: "Редактирование упражнения", exact: true });
  await reopened.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(reopened).toBeHidden();
});

test("system theme integration changes the exercise editor between light and dark", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Theme capability check runs once in Chromium.");
  await page.emulateMedia({ colorScheme: "light" });
  await mockSupabase(page);
  await register(page, "editor-theme@example.invalid", 1);
  await addExercise(page, "Жим штанги", 4);
  await page.getByRole("button", { name: "Редактировать: Жим штанги", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Редактирование упражнения", exact: true });
  // Remains an integration blocker while feature/system-theme is excluded.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const light = await dialog.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await dialog.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    light,
  );
});
