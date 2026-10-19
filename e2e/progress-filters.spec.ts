import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const cssFile = readdirSync(".output/public/assets").find((file) => /^styles-.*\.css$/.test(file));
if (!cssFile) throw new Error("Сначала выполните production build для теста адаптивности.");
const productionCss = readFileSync(join(".output/public/assets", cssFile), "utf8");

for (const width of [320, 375, 390, 1280]) {
  for (const theme of ["light", "dark"]) {
    test(`Фильтры прогресса компактны: ${width}px, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.setContent(`
        <html data-theme="${theme}"><head><style>${productionCss}</style></head>
        <body>
          <main class="mx-auto min-h-dvh max-w-md bg-background px-4 text-foreground">
            <div id="filters" class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
              <label class="block min-w-0 space-y-1 text-xs">Тренировочный день
                <span class="relative block min-w-0">
                  <select id="day" class="h-11 min-w-0 w-full appearance-none truncate rounded-md border border-input bg-card px-3 pr-9 text-foreground">
                    <option selected>Очень длинное название тренировочного дня</option>
                  </select>
                  <span id="day-arrow" class="pointer-events-none absolute right-[13px] top-1/2 h-4 w-4 -translate-y-1/2">⌄</span>
                </span>
              </label>
              <label class="block min-w-0 space-y-1 text-xs">Упражнение
                <span class="relative block min-w-0">
                  <select id="exercise" class="h-11 min-w-0 w-full appearance-none truncate rounded-md border border-input bg-card px-3 pr-9 text-foreground">
                    <option selected>Тяга верхнего блока широким хватом</option>
                  </select>
                  <span id="exercise-arrow" class="pointer-events-none absolute right-[13px] top-1/2 h-4 w-4 -translate-y-1/2">⌄</span>
                </span>
              </label>
            </div>
          </main>
        </body></html>
      `);

      const layout = await page.evaluate(() => {
        const filters = document.querySelector<HTMLElement>("#filters")!;
        const day = document.querySelector<HTMLSelectElement>("#day")!;
        const exercise = document.querySelector<HTMLSelectElement>("#exercise")!;
        const dayArrow = document.querySelector<HTMLElement>("#day-arrow")!;
        const exerciseArrow = document.querySelector<HTMLElement>("#exercise-arrow")!;
        const rect = (element: Element) => element.getBoundingClientRect();
        return {
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          filters: rect(filters),
          day: rect(day),
          exercise: rect(exercise),
          dayArrow: rect(dayArrow),
          exerciseArrow: rect(exerciseArrow),
          dayStyle: {
            borderRadius: getComputedStyle(day).borderRadius,
            paddingLeft: getComputedStyle(day).paddingLeft,
            paddingRight: getComputedStyle(day).paddingRight,
            textOverflow: getComputedStyle(day).textOverflow,
          },
          exerciseStyle: {
            borderRadius: getComputedStyle(exercise).borderRadius,
            paddingLeft: getComputedStyle(exercise).paddingLeft,
            paddingRight: getComputedStyle(exercise).paddingRight,
            textOverflow: getComputedStyle(exercise).textOverflow,
          },
          dayLabelTop: day.closest("label")!.getBoundingClientRect().top,
        };
      });

      expect(layout.document).toBeLessThanOrEqual(layout.viewport);
      expect(layout.day.width).toBeCloseTo(layout.exercise.width, 0);
      expect(layout.day.top).toBe(layout.exercise.top);
      expect(layout.day.height).toBe(44);
      expect(layout.exercise.height).toBe(44);
      expect(layout.dayStyle.borderRadius).toBe(layout.exerciseStyle.borderRadius);
      expect(layout.dayStyle.paddingLeft).toBe(layout.exerciseStyle.paddingLeft);
      expect(layout.dayStyle.paddingRight).toBe(layout.exerciseStyle.paddingRight);
      expect(layout.dayStyle.textOverflow).toBe("ellipsis");
      expect(layout.exerciseStyle.textOverflow).toBe("ellipsis");
      expect(layout.dayArrow.right).toBeCloseTo(layout.day.right - 13, 0);
      expect(layout.exerciseArrow.right).toBeCloseTo(layout.exercise.right - 13, 0);
      expect(layout.dayLabelTop).toBeLessThan(layout.day.top);
      expect(layout.filters.right).toBeLessThanOrEqual(layout.viewport);
    });
  }
}
