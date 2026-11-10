import { expect, test } from "@playwright/test";
import { mockSupabase } from "./mock-supabase";
import { addExercise, fillWorkout, register } from "./helpers";

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

test("desktop overlays do not shift the shared layout", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  await register(page, "navigation-overlay-layout@example.invalid", 1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addStyleTag({
    content: `
      html::-webkit-scrollbar { width: 15px; }
      body.force-scroll { min-height: calc(100vh + 200px) !important; }
    `,
  });
  await page.evaluate(() => document.body.classList.add("force-scroll"));
  await page.evaluate(() => {
    const root = document.documentElement;
    if (window.innerWidth === root.clientWidth) {
      Object.defineProperty(root, "clientWidth", {
        configurable: true,
        get: () => window.innerWidth - 14,
      });
    }
  });
  expect(
    await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth),
  ).toBeGreaterThan(0);

  const geometry = async () =>
    page.evaluate(() => {
      const left = (selector: string) =>
        document.querySelector(selector)?.getBoundingClientRect().left ?? Number.NaN;
      const width = (selector: string) =>
        document.querySelector(selector)?.getBoundingClientRect().width ?? Number.NaN;
      return {
        positions: [
          left("body"),
          left("header"),
          left('nav[aria-label="Основная навигация"]'),
          left("main"),
          left("main h1"),
          left('header button[aria-label="Выйти"]'),
        ],
        widths: [width("body"), width("header"), width("main")],
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
  const expectStableGeometry = async (before: Awaited<ReturnType<typeof geometry>>) => {
    const after = await geometry();
    expect(after.horizontalOverflow).toBe(false);
    [...after.positions, ...after.widths].forEach((position, index) => {
      const prior = [...before.positions, ...before.widths][index]!;
      if (Number.isNaN(prior) || Number.isNaN(position)) {
        expect(Number.isNaN(position)).toBe(Number.isNaN(prior));
        return;
      }
      expect(Math.abs(position - prior)).toBeLessThan(1);
    });
  };

  const cases = [
    {
      tab: "Тренировка",
      trigger: () => page.getByRole("button", { name: "Настройки", exact: true }),
      opened: () => page.getByRole("dialog", { name: "Настройки", exact: true }),
    },
    {
      tab: "Тренировка",
      trigger: () => page.getByRole("combobox", { name: "Тренировочный день", exact: true }),
      opened: () => page.getByRole("listbox"),
      chooseOption: () => page.getByRole("option").first(),
    },
    {
      tab: "Программа",
      trigger: () => page.getByRole("combobox", { name: "День для упражнений", exact: true }),
      opened: () => page.getByRole("listbox"),
      chooseOption: () => page.getByRole("option").first(),
    },
    {
      tab: "Программа",
      trigger: () => page.getByRole("button", { name: "Изменить дни", exact: true }),
      opened: () => page.getByRole("dialog", { name: "Тренировочные дни", exact: true }),
    },
  ];

  for (const scenario of cases) {
    await page.getByRole("link", { name: scenario.tab, exact: true }).click();
    await scenario.trigger().waitFor({ state: "visible" });
    const before = await geometry();
    await scenario.trigger().click();
    await expect(scenario.opened()).toBeVisible();
    await expectStableGeometry(before);
    if ("chooseOption" in scenario) await scenario.chooseOption().click();
    else await page.keyboard.press("Escape");
    await expect(scenario.opened()).toBeHidden();
    await expectStableGeometry(before);
  }

  await addExercise(page, "Жим для проверки фильтра", 2);
  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  await fillWorkout(page, "40", ["8", "8"]);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сохранить", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Записи", exact: true }).click();
  const before = await geometry();
  await page.getByRole("button", { name: "Сортировка записей", exact: true }).click();
  const sortMenu = page.getByRole("menuitemradio", { name: "Сначала новые", exact: true });
  await expect(sortMenu).toBeVisible();
  await expectStableGeometry(before);
  await sortMenu.click();
  await expect(sortMenu).toBeHidden();
  await expectStableGeometry(before);
});
