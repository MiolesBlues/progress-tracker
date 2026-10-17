import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const cssFile = readdirSync(".output/public/assets").find((file) => /^styles-.*\.css$/.test(file));
if (!cssFile) throw new Error("Сначала выполните production build для теста адаптивности.");
const productionCss = readFileSync(join(".output/public/assets", cssFile), "utf8");

for (const width of [320, 375, 390, 768, 1280]) {
  for (const theme of ["light", "dark"]) {
    test(`Дата и тренировочный день выровнены в одной строке: ${width}px, ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.setContent(`
        <html data-theme="${theme}">
          <head><style>${productionCss}</style></head>
          <body>
            <main class="mx-auto min-h-dvh max-w-md bg-background px-4 text-foreground">
              <div id="date-day-row" class="grid min-w-0 grid-cols-[minmax(0,45fr)_minmax(0,55fr)] items-end gap-2.5">
                <div id="date-cell" class="min-w-0 space-y-1">
                  <label for="date" class="block text-xs font-medium">Дата</label>
                  <div class="relative min-w-0">
                    <input id="date" type="date" value="2026-10-16" class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors box-border h-11 w-full min-w-0 max-w-full appearance-none rounded-md border border-input bg-card px-3 text-xs [&::-webkit-calendar-picker-indicator]:hidden" />
                    <button id="calendar-button" aria-label="Открыть календарь" class="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground touch-manipulation"><span id="date-icon" class="block h-4 w-4">▦</span></button>
                  </div>
                </div>
                <div id="day-cell" class="min-w-0 space-y-1">
                  <label for="day" class="block text-xs font-medium">Тренировочный день</label>
                  <button id="day" class="flex h-9 w-full min-w-0 items-center justify-between whitespace-nowrap rounded-md border border-input bg-card px-3 text-foreground h-11"><span class="min-w-0 truncate">День 1 · 2 упражнения</span><span id="day-arrow" class="h-4 w-4 shrink-0">⌄</span></button>
                </div>
              </div>
            </main>
          </body>
        </html>
      `);
      const geometry = await page.evaluate(() => {
        const date = document.querySelector<HTMLInputElement>("#date")!;
        const day = document.querySelector<HTMLButtonElement>("#day")!;
        const calendarButton = document.querySelector<HTMLButtonElement>("#calendar-button")!;
        const calendarIcon = document.querySelector<HTMLElement>("#date-icon")!;
        const row = document.querySelector<HTMLDivElement>("#date-day-row")!;
        const rect = (element: Element) => {
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
          };
        };
        return {
          date: rect(date),
          day: rect(day),
          dateLabel: rect(document.querySelector("label[for=date]")!),
          dayLabel: rect(document.querySelector("label[for=day]")!),
          calendarButton: rect(calendarButton),
          calendarIcon: rect(calendarIcon),
          row: rect(row),
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          themeBackground: getComputedStyle(document.querySelector("main")!).backgroundColor,
          dayBackground: getComputedStyle(day).backgroundColor,
          dateHeight: date.getBoundingClientRect().height,
          dayHeight: day.getBoundingClientRect().height,
          dateRadius: getComputedStyle(date).borderRadius,
          dayRadius: getComputedStyle(day).borderRadius,
          datePaddingRight: getComputedStyle(date).paddingRight,
          dayPaddingRight: getComputedStyle(day).paddingRight,
          dayArrowRight: document.querySelector("#day-arrow")!.getBoundingClientRect().right,
          dayArrowInset:
            day.getBoundingClientRect().right -
            document.querySelector("#day-arrow")!.getBoundingClientRect().right,
        };
      });

      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.date.width / (geometry.date.width + geometry.day.width)).toBeCloseTo(0.45, 1);
      expect(geometry.day.width).toBeGreaterThan(geometry.date.width);
      expect(geometry.date.top).toBe(geometry.day.top);
      expect(geometry.dateLabel.top).toBe(geometry.dayLabel.top);
      expect(geometry.dateLabel.bottom).toBe(geometry.dayLabel.bottom);
      expect(geometry.date.left).toBeGreaterThanOrEqual(geometry.row.left);
      expect(geometry.day.right).toBeLessThanOrEqual(geometry.row.right + 1);
      expect(geometry.date.right).toBeLessThanOrEqual(geometry.day.left);
      expect(geometry.date.width).toBeGreaterThan(0);
      expect(geometry.day.width).toBeGreaterThan(0);
      expect(geometry.dateHeight).toBe(44);
      expect(geometry.dayHeight).toBe(44);
      expect(geometry.dateRadius).toBe(geometry.dayRadius);
      expect(geometry.datePaddingRight).toBe(geometry.dayPaddingRight);
      expect(geometry.dayArrowRight).toBeLessThanOrEqual(geometry.day.right - 10);
      expect(geometry.calendarButton.height).toBe(44);
      expect(geometry.calendarButton.right).toBe(geometry.date.right);
      expect(geometry.calendarIcon.left + geometry.calendarIcon.width / 2).toBeCloseTo(
        geometry.calendarButton.left + geometry.calendarButton.width / 2,
        0,
      );
      expect(geometry.dayArrowInset).toBeCloseTo(13, 0);
      expect(geometry.themeBackground).not.toBe(geometry.dayBackground);

      await page.evaluate(() => {
        let opened = false;
        Object.defineProperty(HTMLInputElement.prototype, "showPicker", {
          configurable: true,
          value: () => {
            opened = true;
          },
        });
        Object.defineProperty(window, "calendarPickerOpened", { get: () => opened });
        document.querySelector("#calendar-button")!.addEventListener("click", () => {
          document.querySelector<HTMLInputElement>("#date")!.showPicker();
        });
      });
      await page.locator("#date-icon").click();
      expect(
        await page.evaluate(
          () => (window as Window & { calendarPickerOpened?: boolean }).calendarPickerOpened,
        ),
      ).toBe(true);
    });
  }
}

for (const width of [320, 375, 390]) {
  test(`Обычная строка подхода помещается на экран ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(`
      <html><head><style>${productionCss}</style></head>
      <body>
        <main class="mx-auto max-w-md px-4">
          <div id="set-row" class="grid grid-cols-[3rem_repeat(3,minmax(0,1fr))] items-end gap-2 rounded-xl bg-card p-1">
            <div class="flex items-center gap-0.5 pb-3"><button id="set-handle" class="touch-none cursor-grab h-7 w-7 p-1"><svg class="h-4 w-4"></svg></button><span class="text-xs">#1</span></div>
            <label class="min-w-0 space-y-1 text-xs"><span>Вес, кг</span><input class="num h-11 min-w-0 w-full px-1" value="40" /></label>
            <label class="min-w-0 space-y-1 text-xs"><span>Повторения</span><input class="num h-11 min-w-0 w-full px-1" value="10" /></label>
            <label class="min-w-0 space-y-1 text-xs"><span>RIR</span><input class="num h-11 min-w-0 w-full px-1" value="2" /></label>
          </div>
        </main>
      </body></html>
    `);
    const result = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>("#set-row")!;
      const inputs = [...row.querySelectorAll("input")];
      const boxes = inputs.map((input) => input.getBoundingClientRect());
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        row: row.getBoundingClientRect().toJSON(),
        inputRows: boxes.map(({ top }) => top),
        inputWidths: boxes.map(({ width }) => width),
        inputHeights: boxes.map(({ height }) => height),
        handle: row.querySelector("#set-handle")!.getBoundingClientRect().toJSON(),
        hasArrows: !!row.querySelector('[aria-label*="подход вверх"], [aria-label*="подход вниз"]'),
      };
    });
    expect(result.documentWidth).toBeLessThanOrEqual(result.viewportWidth);
    expect(new Set(result.inputRows).size).toBe(1);
    expect(result.inputWidths.every((inputWidth) => inputWidth > 0)).toBe(true);
    expect(result.inputWidths.every((inputWidth) => inputWidth >= 64)).toBe(true);
    expect(result.inputHeights).toEqual([44, 44, 44]);
    expect(result.handle.width).toBeLessThanOrEqual(32);
    expect(result.hasArrows).toBe(false);
    expect(result.row.right).toBeLessThanOrEqual(result.viewportWidth);
  });
}
