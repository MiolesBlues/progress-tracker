import { expect, test } from "@playwright/test";
import { mockSupabase } from "./mock-supabase";
import { register } from "./helpers";

test("common layout stays aligned while page height toggles the scrollbar", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  await register(page, "navigation-layout@example.invalid", 1);
  await page.addStyleTag({
    content: `
      html::-webkit-scrollbar { width: 15px; }
      body.force-scroll { min-height: calc(100vh + 200px) !important; }
    `,
  });

  for (const width of [320, 375, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.locator("html").evaluate((element, value) => {
        element.setAttribute("data-theme", value);
      }, theme);

      let baseline: number[] | undefined;
      for (const tab of ["Тренировка", "Программа", "Записи", "Прогресс"]) {
        await page.evaluate((label) => {
          document.body.classList.toggle("force-scroll", label === "Программа");
        }, tab);
        await page.getByRole("link", { name: tab, exact: true }).click();
        await expect(page.getByRole("heading", { name: tab, exact: true })).toBeVisible();

        const geometry = await page.evaluate(() => {
          const header = document.querySelector("header")!;
          const main = document.querySelector("main")!;
          const heading = main.querySelector("h1")!;
          const dock = document.querySelector("nav > div")!;
          const left = (element: Element) => element.getBoundingClientRect().left;
          return {
            positions: [left(header), left(main), left(heading), left(dock)],
            hasVerticalOverflow:
              document.documentElement.scrollHeight > document.documentElement.clientHeight,
            horizontalOverflow:
              document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        });

        if (tab === "Программа") expect(geometry.hasVerticalOverflow).toBe(true);
        expect(geometry.horizontalOverflow).toBe(false);
        if (!baseline) baseline = geometry.positions;
        else
          geometry.positions.forEach((position, index) => {
            expect(Math.abs(position - baseline![index]!)).toBeLessThan(1);
          });
      }
    }
  }
});
