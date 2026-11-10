import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addExercise,
  fillWorkout,
  longDay,
  register,
  firstName,
  secondName,
  seedHistory,
} from "./helpers";
import { mockSupabase } from "./mock-supabase";

type Theme = "light" | "dark";
type SelectSample = {
  trigger: string;
  height: string;
  closed: string;
  menu: string;
  item: string;
};

async function styleSignature(locator: Locator, properties: string[]) {
  return locator.evaluate((element, names) => {
    const style = getComputedStyle(element);
    return names.map((name) => style.getPropertyValue(name));
  }, properties);
}

async function sampleSelect(page: Page, trigger: Locator, label: string, theme: Theme) {
  await page.locator("html").evaluate((element, value) => {
    element.setAttribute("data-theme", value);
  }, theme);
  const closed = await styleSignature(trigger, [
    "border-radius",
    "border-color",
    "background-color",
    "color",
    "font-family",
    "font-size",
    "font-weight",
  ]);
  await trigger.click();
  const menu = page.getByRole("listbox");
  await expect(menu, `${label} opens a shared select menu`).toBeVisible();
  const menuStyle = await styleSignature(menu, [
    "border-radius",
    "border-color",
    "background-color",
    "box-shadow",
    "color",
    "font-family",
    "font-size",
  ]);
  const firstOption = page.getByRole("option").first();
  await expect(firstOption).toBeVisible();
  const itemStyle = await styleSignature(firstOption, [
    "min-height",
    "border-radius",
    "color",
    "font-family",
    "font-size",
  ]);
  await firstOption.click();
  await expect(menu).toBeHidden();
  return {
    trigger: label,
    height: await trigger.evaluate((element) => getComputedStyle(element).height),
    closed: JSON.stringify(closed),
    menu: JSON.stringify(menuStyle),
    item: JSON.stringify(itemStyle),
  } satisfies SelectSample;
}

test("selection inputs share the same open and closed appearance", async ({ page }) => {
  const backend = await mockSupabase(page);
  await page.goto("/");
  await register(page, "select-visual-system@example.invalid", 1);

  await addExercise(page, "Жим A", 2);
  await addExercise(page, "Жим B", 2);
  await addExercise(page, firstName, 2);
  await addExercise(page, secondName, 2);
  seedHistory(backend);

  const samples: Record<Theme, SelectSample[]> = { light: [], dark: [] };
  const sample = async (label: string, trigger: Locator) => {
    for (const theme of ["light", "dark"] as const)
      samples[theme].push(await sampleSelect(page, trigger, label, theme));
  };

  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  const workoutDay = page.getByRole("combobox", { name: "Тренировочный день", exact: true });
  const workoutExercise = page.getByRole("combobox", { name: "Упражнение", exact: true });
  await sample("Workout training day", workoutDay);
  await sample("Workout exercise", workoutExercise);
  await workoutExercise.click();
  await page.getByRole("option", { name: "Жим B", exact: true }).click();
  await expect(workoutExercise).toContainText("Жим B");
  await fillWorkout(page, "40", ["8", "8"]);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сохранить", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Программа", exact: true }).click();
  const programDay = page.getByRole("combobox", { name: "День для упражнений", exact: true });
  await sample("Program exercise day", programDay);
  await page.getByRole("button", { name: "Редактировать: Жим B", exact: true }).click();
  const exerciseEditor = page.getByRole("dialog", { name: "Редактирование упражнения" });
  const exerciseDay = exerciseEditor.getByRole("combobox", {
    name: "Тренировочный день",
    exact: true,
  });
  await sample("Program edit exercise day", exerciseDay);
  await page.keyboard.press("Escape");
  await expect(exerciseEditor).toBeHidden();

  await page.getByRole("link", { name: "Записи", exact: true }).click();
  const entriesDay = page.getByRole("combobox", { name: "День записей", exact: true });
  const entriesExercise = page.getByRole("combobox", { name: "Упражнение записей", exact: true });
  await sample("Entries training day", entriesDay);
  await sample("Entries exercise", entriesExercise);

  await page.getByRole("link", { name: "Прогресс", exact: true }).click();
  const progressDay = page.getByRole("combobox", { name: "Тренировочный день", exact: true });
  const progressExercise = page.getByRole("combobox", { name: "Упражнение", exact: true });
  await sample("Progress training day", progressDay);
  await sample("Progress exercise", progressExercise);
  await progressExercise.click();
  await page.getByRole("option", { name: firstName, exact: true }).click();
  await expect(progressExercise).toContainText(firstName);
  const metric = page.getByRole("combobox", { name: "Показатель", exact: true });
  await sample("Progress metric", metric);
  await metric.click();
  await page.getByRole("option", { name: "Повторения", exact: true }).click();
  await expect(metric).toContainText("Повторения");
  const comparedWorkout = page.getByRole("combobox", {
    name: "Тренировка для сравнения",
    exact: true,
  });
  await sample("Progress comparison workout", comparedWorkout);

  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  await page.getByRole("button", { name: "Фокус", exact: true }).click();
  await page.getByRole("button", { name: "Начать тренировку", exact: true }).click();
  const setPicker = page.getByRole("combobox", { name: "Выбрать подход", exact: true });
  await expect(setPicker).toContainText("1/2");
  await sample("Workout set picker", setPicker);
  await setPicker.click();
  await page.getByRole("option", { name: "2/2", exact: true }).click();
  await expect(setPicker).toContainText("2/2");
  await expect(page.getByLabel("Вес подхода 2", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Обычный", exact: true }).click();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "Настройки", exact: true });
  await sample(
    "Settings language",
    settings.getByRole("combobox", { name: "Язык интерфейса", exact: true }),
  );

  for (const theme of ["light", "dark"] as const) {
    const themeSamples = samples[theme];
    expect(themeSamples.length).toBeGreaterThan(8);
    for (const property of ["closed", "menu", "item"] as const) {
      const styles = themeSamples.map((entry) => entry[property]);
      expect([...new Set(styles)], `${theme} ${property} styles should be uniform`).toHaveLength(1);
    }
    for (const entry of themeSamples) {
      expect(entry.height, `${entry.trigger} closed height`).toBe("48px");
    }
  }
});
