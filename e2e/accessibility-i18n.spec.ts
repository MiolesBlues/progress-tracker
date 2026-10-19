import { test, expect } from "@playwright/test";
import { mockSupabase } from "./mock-supabase";
import { addExercise, register, longDay, noOverflow } from "./helpers";
import { renderErrorPage } from "../src/lib/error-page";

for (const width of [320, 375, 390, 430]) {
  for (const language of ["ru", "en"] as const) {
    test(`C07 ${language} ${width}px: localized close, keyboard drag and notifications`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      const hydrationErrors: string[] = [];
      page.on("console", (message) => {
        if (/hydration|did not match|server rendered HTML/i.test(message.text()))
          hydrationErrors.push(message.text());
      });
      const backend = await mockSupabase(page);
      await register(page, `c07-${language}-${width}@example.invalid`, 2);
      await addExercise(page, "Мой жим — Push");
      await page.getByRole("button", { name: "Настройки", exact: true }).click();
      const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
      if (language === "en") {
        await settings.getByRole("combobox", { name: "Язык интерфейса" }).click();
        await page.getByRole("option", { name: "English", exact: true }).click();
      }
      const close = language === "ru" ? "Закрыть" : "Close";
      await page.getByRole("dialog").getByRole("button", { name: close, exact: true }).click();
      await expect(
        page.getByRole("region", { name: language === "ru" ? /^Уведомления/ : /^Notifications/ }),
      ).toBeAttached();
      await expect
        .poll(
          async () =>
            (await context.cookies()).find((cookie) => cookie.name === "app_display_language")
              ?.value,
        )
        .toBe(language);
      await page
        .getByRole("button", {
          name: language === "ru" ? "Редактировать: Мой жим — Push" : "Edit: Мой жим — Push",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("dialog").getByRole("button", { name: close, exact: true }),
      ).toBeVisible();
      await noOverflow(page);
      await page.getByRole("dialog").getByRole("button", { name: close, exact: true }).click();
      await page
        .getByRole("button", {
          name: language === "ru" ? "Изменить дни" : "Edit days",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog", {
        name: language === "ru" ? "Тренировочные дни" : "Training days",
        exact: true,
      });
      await dialog.evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      const handle = dialog.getByRole("button", {
        name: `${language === "ru" ? "Переместить день" : "Move day"} ${longDay}`,
        exact: true,
      });
      await expect(handle).toHaveAttribute(
        "aria-roledescription",
        language === "ru" ? "Перемещаемый элемент" : "Draggable item",
      );
      await expect(handle).toHaveAccessibleDescription(
        language === "ru"
          ? /Для перемещения нажмите пробел или Enter/
          : /To pick up an item, press Space or Enter/,
      );
      await handle.focus();
      await page.keyboard.press("Space");
      await expect(handle).toHaveAttribute("aria-pressed", "true");
      // KeyboardSensor defers its document keydown listener until the next timer turn.
      await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
      await page.keyboard.press("ArrowDown");
      const live = dialog.getByRole("status");
      await expect(live).toHaveText(
        language === "ru"
          ? "Элемент перемещён на позицию 2 из 2."
          : "Item moved to position 2 of 2.",
      );
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await expect(live).toHaveText(
        language === "ru"
          ? "Перемещение отменено. Исходная позиция 1 из 2."
          : "Drag cancelled. Original position 1 of 2.",
      );
      expect(backend.rpcCalls.filter((call) => call.name === "reorder_program_days")).toHaveLength(
        0,
      );
      await expect(handle).not.toHaveAttribute("aria-pressed", "true");
      await dialog.evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => undefined)),
        );
      });
      await handle.focus();
      await page.keyboard.press("Enter");
      await expect(handle).toHaveAttribute("aria-pressed", "true");
      await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
      await page.keyboard.press("ArrowDown");
      await expect(live).toHaveText(
        language === "ru"
          ? "Элемент перемещён на позицию 2 из 2."
          : "Item moved to position 2 of 2.",
      );
      await page.keyboard.press("Enter");
      await expect
        .poll(() => backend.rpcCalls.filter((call) => call.name === "reorder_program_days").length)
        .toBe(1);
      await expect(live).toHaveText(
        language === "ru"
          ? "Перемещение завершено. Позиция 2 из 2."
          : "Item dropped at position 2 of 2.",
      );
      await noOverflow(page);
      await dialog
        .getByRole("button", { name: language === "ru" ? "Готово" : "Done", exact: true })
        .click();
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      expect(hydrationErrors).toEqual([]);
    });
  }
}

test("C07 standalone error HTML fixture is localized and fits all mobile widths without hydration", async ({
  page,
}) => {
  for (const language of ["ru", "en"] as const) {
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.setContent(renderErrorPage(language));
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      await expect(
        page.getByRole("heading", {
          name: language === "ru" ? "Не удалось загрузить страницу" : "Could not load the page",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: language === "ru" ? "Повторить" : "Retry", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: language === "ru" ? "На главную" : "Home", exact: true }),
      ).toHaveAttribute("href", "/");
      await expect(page.locator("script")).toHaveCount(0);
      await noOverflow(page);
    }
  }
});
