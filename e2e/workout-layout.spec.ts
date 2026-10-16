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
              <div id="date-day-row" class="grid min-w-0 grid-cols-[minmax(0,42fr)_minmax(0,58fr)] items-end gap-2.5">
                <div id="date-cell" class="min-w-0 space-y-1">
                  <label for="date" class="text-xs font-medium leading-none">Дата</label>
                  <div class="relative min-w-0">
                    <input id="date" type="date" value="2026-10-16" class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors box-border h-11 min-w-0 max-w-full rounded-md border border-input bg-card px-3 text-xs [&::-webkit-calendar-picker-indicator]:opacity-0" />
                    <span id="date-icon" class="pointer-events-none absolute right-[13px] top-1/2 h-4 w-4 -translate-y-1/2">▦</span>
                  </div>
                </div>
                <div id="day-cell" class="min-w-0 space-y-1">
                  <label for="day" class="text-xs font-medium leading-none">Тренировочный день</label>
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
        const row = document.querySelector<HTMLDivElement>("#date-day-row")!;
        const rect = (element: Element) => {
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            width: box.width,
          };
        };
        return {
          date: rect(date),
          day: rect(day),
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
          dateIconRight: document.querySelector("#date-icon")!.getBoundingClientRect().right,
          dayArrowInset:
            day.getBoundingClientRect().right -
            document.querySelector("#day-arrow")!.getBoundingClientRect().right,
        };
      });

      expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.date.width / (geometry.date.width + geometry.day.width)).toBeCloseTo(0.42, 1);
      expect(geometry.day.width).toBeGreaterThan(geometry.date.width);
      expect(geometry.date.top).toBe(geometry.day.top);
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
      expect(geometry.dateIconRight).toBeCloseTo(geometry.date.right - 13, 0);
      expect(geometry.dayArrowInset).toBeCloseTo(13, 0);
      expect(geometry.themeBackground).not.toBe(geometry.dayBackground);
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
          <div id="set-row" class="grid grid-cols-[2rem_repeat(3,minmax(0,1fr))_auto] items-end gap-2 rounded-xl bg-card p-2">
            <span class="pb-3 text-xs">#1</span>
            <label class="min-w-0 space-y-1 text-xs"><span>Вес, кг</span><input class="num h-11 min-w-0 w-full px-1" value="40" /></label>
            <label class="min-w-0 space-y-1 text-xs"><span>Повторения</span><input class="num h-11 min-w-0 w-full px-1" value="10" /></label>
            <label class="min-w-0 space-y-1 text-xs"><span>RIR</span><input class="num h-11 min-w-0 w-full px-1" value="2" /></label>
            <div class="flex flex-col gap-1"><button aria-label="Переместить подход вверх">↑</button><button aria-label="Переместить подход вниз">↓</button></div>
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
      };
    });
    expect(result.documentWidth).toBeLessThanOrEqual(result.viewportWidth);
    expect(new Set(result.inputRows).size).toBe(1);
    expect(result.inputWidths.every((inputWidth) => inputWidth > 0)).toBe(true);
    expect(result.row.right).toBeLessThanOrEqual(result.viewportWidth);
  });
}
