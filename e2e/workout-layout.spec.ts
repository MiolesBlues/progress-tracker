import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const cssFile = readdirSync(".output/public/assets").find((file) => /^styles-.*\.css$/.test(file));
if (!cssFile) throw new Error("Сначала выполните production build для теста адаптивности.");
const productionCss = readFileSync(join(".output/public/assets", cssFile), "utf8");

for (const width of [320, 375, 390, 430]) {
  test(`Дата и рабочий вес помещаются при ширине ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.setContent(`
      <style>${productionCss}</style>
      <div class="mx-auto min-h-dvh max-w-md">
        <main class="px-5">
          <fieldset class="space-y-5">
            <div id="fields" class="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
              <div class="min-w-0 space-y-2">
                <label for="date" class="text-sm font-medium leading-none">Дата</label>
                <input id="date" type="date" value="2026-10-15" class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors h-12 box-border min-w-0 max-w-full appearance-auto px-2 sm:px-3" />
              </div>
              <div class="min-w-0 space-y-2">
                <label for="w" class="text-sm font-medium leading-none">Рабочий вес, кг</label>
                <input id="w" type="text" value="52,5" class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors h-12 box-border min-w-0 max-w-full text-lg" />
              </div>
            </div>
          </fieldset>
        </main>
      </div>
    `);

    const geometry = await page.evaluate(() => {
      const dateInput = document.querySelector<HTMLInputElement>("#date")!;
      const weightInput = document.querySelector<HTMLInputElement>("#w")!;
      const dateCell = dateInput.parentElement!;
      const weightCell = weightInput.parentElement!;
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
        date: rect(dateInput),
        weight: rect(weightInput),
        dateCell: rect(dateCell),
        weightCell: rect(weightCell),
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.date.width).toBeGreaterThan(0);
    expect(geometry.weight.width).toBeGreaterThan(0);
    expect(geometry.date.left).toBeGreaterThanOrEqual(geometry.dateCell.left);
    expect(geometry.date.right).toBeLessThanOrEqual(geometry.dateCell.right + 1);
    expect(geometry.date.top).toBeGreaterThanOrEqual(geometry.dateCell.top);
    expect(geometry.date.bottom).toBeLessThanOrEqual(geometry.dateCell.bottom + 1);
    expect(geometry.weight.left).toBeGreaterThanOrEqual(geometry.weightCell.left);
    expect(geometry.weight.right).toBeLessThanOrEqual(geometry.weightCell.right + 1);
    expect(geometry.weight.top).toBeGreaterThanOrEqual(geometry.weightCell.top);
    expect(geometry.weight.bottom).toBeLessThanOrEqual(geometry.weightCell.bottom + 1);
    expect(
      geometry.date.right <= geometry.weight.left ||
        geometry.weight.right <= geometry.date.left ||
        geometry.date.bottom <= geometry.weight.top ||
        geometry.weight.bottom <= geometry.date.top,
    ).toBe(true);
    if (width < 390) expect(geometry.weight.top).toBeGreaterThan(geometry.date.bottom);
    else expect(geometry.weight.top).toBe(geometry.date.top);
  });
}
