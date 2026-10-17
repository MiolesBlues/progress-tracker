import { expect, test } from "@playwright/test";
import { addExercise, register } from "./helpers";
import { mockSupabase } from "./mock-supabase";

test("Date and Training day controls stay aligned across viewport sizes and themes", async ({
  page,
}) => {
  await mockSupabase(page);
  await page.goto("/");
  await register(page, `align-${Date.now()}@example.invalid`, 1);
  await addExercise(page, "Alignment check", 3);
  await page.goto("/workout");
  await expect(page.getByLabel("Дата", { exact: true })).toBeVisible();
  for (const width of [320, 375, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (t) => document.documentElement.classList.toggle("dark", t === "dark"),
        theme,
      );
      await page.waitForTimeout(100);
      const rects = await page.evaluate(() => {
        const dateLabel = document.querySelector('label[for="date"]')!;
        const dateInput = document.querySelector<HTMLInputElement>("#date")!;
        const dayLabel = document.querySelector("#training-day-label")!;
        const daySelect = document.querySelector('[aria-labelledby="training-day-label"]')!;
        const rect = (element: Element) => {
          const { top, bottom } = element.getBoundingClientRect();
          return { top, bottom };
        };
        return {
          dateLabel: rect(dateLabel),
          dateInput: rect(dateInput),
          dayLabel: rect(dayLabel),
          daySelect: rect(daySelect),
        };
      });
      expect(
        Math.abs(rects.dateLabel.top - rects.dayLabel.top),
        `${width}px ${theme} label top`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(rects.dateInput.top - rects.daySelect.top),
        `${width}px ${theme} control top`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(rects.dateInput.bottom - rects.daySelect.bottom),
        `${width}px ${theme} control bottom`,
      ).toBeLessThanOrEqual(1);
    }
  }
  expect(await page.locator("#date")).toBeVisible();
});
