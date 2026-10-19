import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { mockSupabase } from "./mock-supabase";
import { register } from "./helpers";

const screenshotDir = "test-results/centered-day-dialog";

test("centered day dialog fits mobile, tablet and desktop viewports", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const backend = await mockSupabase(page);
  await page.goto("/");
  await register(page, "centered-day-dialog@example.invalid", 7);

  // Extra archived rows make the inner scroll area overflow without adding any real data.
  for (let index = 0; index < 8; index++) {
    backend.rows["program_days"]!.push({
      id: `archived-${index}`,
      user_id: backend.rows["program_days"]![0]!.user_id,
      name: `Архивный день ${index + 1}`,
      position: 7 + index,
      archived_at: "2026-10-15T12:00:00.000Z",
      created_at: "2026-10-15T12:00:00.000Z",
    });
  }

  await page.goto("/program");
  await expect(page.getByRole("heading", { name: "Программа", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Тренировочные дни", exact: true });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
    .toBe("hidden");
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  await dialog.locator("summary").filter({ hasText: "Архив дней" }).click();

  const scrollArea = dialog.locator(":scope > div.overflow-y-auto");
  await expect
    .poll(() => scrollArea.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);

  for (const width of [320, 375, 390, 768, 1440]) {
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
    expect(geometry.width).toBeCloseTo(Math.min(520, width - 32), 0);
    expect(geometry.height).toBeLessThanOrEqual(geometry.viewportHeight * 0.9 + 1);
    expect(geometry.y).toBeGreaterThanOrEqual(0);

    const done = dialog.getByRole("button", { name: "Готово", exact: true });
    const doneBox = await done.boundingBox();
    expect(doneBox).not.toBeNull();
    expect(doneBox!.y + doneBox!.height).toBeLessThanOrEqual(height + 1);

    const scrollTop = await scrollArea.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return element.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);
    expect(done).toBeVisible();
    await scrollArea.evaluate((element) => {
      element.scrollTop = 0;
    });
  }

  // The app currently uses its dark design tokens regardless of the OS color preference.
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const colors = await dialog.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      token: getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
      foreground: getComputedStyle(element).color,
    }));
    expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(colors.token).not.toBe("");
    expect(colors.foreground).not.toBe("");
  }

  // A reduced viewport height approximates the visible area when a mobile keyboard is open.
  await page.setViewportSize({ width: 320, height: 480 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const newDayInput = dialog.getByLabel("Название нового дня", { exact: true });
  await newDayInput.focus();
  await newDayInput.scrollIntoViewIfNeeded();
  const inputBox = await newDayInput.boundingBox();
  const footerBox = await dialog.getByRole("button", { name: "Готово", exact: true }).boundingBox();
  expect(inputBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(inputBox!.y).toBeGreaterThanOrEqual(0);
  expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(480);
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(480);

  await page.setViewportSize({ width: 390, height: 844 });
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
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: `${screenshotDir}/mobile-390.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await page.screenshot({ path: `${screenshotDir}/desktop-1440.png`, fullPage: true });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Изменить дни", exact: true })).toBeFocused();
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
    .not.toBe("hidden");
});
