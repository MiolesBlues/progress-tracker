import { expect, type Page, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { mockSupabase } from "./mock-supabase";

export type Backend = Awaited<ReturnType<typeof mockSupabase>>;
export const password = "Local-only-test-password!";
export const firstName = "Жим с длинным названием упражнения";
export const secondName = "Тяга блока";
export const longDay = "Силовой день с произвольным длинным названием";

/** Clear native maxlength inputs before replacement (Chromium narrow-input insertText issue). */
export async function replaceText(input: Locator, value: string) {
  await input.fill("");
  await input.fill(value);
  await expect(input).toHaveValue(value);
}

export async function fillWorkout(page: Page, weight: string, reps: string[], rir = "") {
  for (let index = 0; index < reps.length; index++) {
    await replaceText(page.getByLabel(`Вес подхода ${index + 1}`, { exact: true }), weight);
    await replaceText(
      page.getByLabel(`Повторения подхода ${index + 1}`, { exact: true }),
      reps[index]!,
    );
    await replaceText(page.getByLabel(`RIR подхода ${index + 1}`, { exact: true }), rir);
  }
}

export async function sortRecords(page: Page, direction: "weight-asc" | "weight-desc") {
  await page.getByRole("button", { name: "Сортировка записей", exact: true }).click();
  await page
    .getByRole("menuitemradio", {
      name: direction === "weight-asc" ? "Вес: по возрастанию" : "Вес: по убыванию",
      exact: true,
    })
    .click();
}

export async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
export async function register(page: Page, email: string, count: number) {
  if (page.url().endsWith("/"))
    await page.getByRole("link", { name: "Начать", exact: true }).click();
  else if (!page.url().endsWith("/auth")) await page.goto("/auth");
  await expect(page.getByRole("heading", { name: "С возвращением!", exact: true })).toBeVisible();
  await expect(page.getByLabel("Подтвердите пароль", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Создать аккаунт", exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
  await page.getByLabel("Подтвердите пароль", { exact: true }).fill("Different-password!");
  await page.getByRole("button", { name: "Зарегистрироваться", exact: true }).click();
  await expect(page.getByText("Пароли не совпадают", { exact: true })).toBeVisible();
  await page.getByLabel("Подтвердите пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Показать подтверждение пароля", exact: true }).click();
  await expect(page.getByLabel("Подтвердите пароль", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Скрыть подтверждение пароля", exact: true }).click();
  await noOverflow(page);
  await page.getByLabel("Подтвердите пароль", { exact: true }).press("Enter");
  await page.getByRole("button", { name: String(count), exact: true }).click();
  await noOverflow(page);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await noOverflow(page);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(
    page.getByText("Например: Push, Pull, Legs, Upper, Lower, Full Body", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Push|Pull|Legs|Upper|Lower|Full Body)$/ }),
  ).toHaveCount(0);
  await page.getByLabel("День 1", { exact: true }).fill(longDay);
  await noOverflow(page);
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Программа", exact: true })).toBeVisible();
}
export async function addExercise(page: Page, name = firstName, sets = 4) {
  await expect(page.getByLabel("Название нового упражнения", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Добавить упражнение", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить упражнение", exact: true });
  await expect(dialog.getByRole("textbox")).toHaveCount(2);
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await expect(dialog.getByLabel(/вес/i)).toHaveCount(0);
  await dialog.getByLabel("Название упражнения", { exact: true }).fill(name);
  await dialog.getByLabel("Количество подходов", { exact: true }).fill(String(sets));
  await dialog.getByLabel("Целевой диапазон повторений", { exact: true }).fill("6–8");
  await noOverflow(page);
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: `Редактировать: ${name}`, exact: true }),
  ).toBeVisible();
}
export async function chooseDay(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Тренировочный день", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
export async function chooseProgramDay(page: Page, name: string) {
  await page.getByRole("combobox", { name: "День для упражнений", exact: true }).click();
  const options = page.getByRole("option");
  const match = options.filter({ hasText: name });
  await expect(match).toHaveCount(1);
  await match.click();
}
export function seedHistory(backend: Backend) {
  const first = backend.rows["program_exercises"]!.find((row) => row["name"] === firstName)!;
  const second = backend.rows["program_exercises"]!.find((row) => row["name"] === secondName)!;
  const history = (
    exerciseId: string,
    date: string,
    weight: number,
    reps: number[],
    notes: string,
  ) => ({
    id: randomUUID(),
    user_id: first.user_id,
    exercise_id: exerciseId,
    day_id: first["day_id"],
    day_name: longDay,
    performed_on: date,
    created_at: `${date}T09:00:00.000001Z`,
    weight,
    reps,
    rir: 2,
    notes,
  });
  backend.rows["workout_entries"]!.push(
    history(first.id, "2026-09-01", 40, Array(20).fill(100), "Старая запись"),
    history(first.id, "2026-10-14", 50, [6, 6], "Вчерашняя запись"),
    history(first.id, "2026-10-15", 50, [8, 8, 7, 6], "Ранняя сессия"),
    history(first.id, "2026-10-16", 999, [1], "Будущая запись"),
    history(second.id, "2026-10-10", 70, [10, 9, 8], "Своя история тяги"),
  );
  return { first, second };
}
export async function geometry(page: Page) {
  const date = await page.getByLabel("Дата", { exact: true }).boundingBox();
  const weight = await page.getByLabel("Вес подхода 1", { exact: true }).boundingBox();
  expect(date).not.toBeNull();
  expect(weight).not.toBeNull();
  expect(
    date!.x + date!.width <= weight!.x ||
      weight!.x + weight!.width <= date!.x ||
      date!.y + date!.height <= weight!.y ||
      weight!.y + weight!.height <= date!.y,
  ).toBe(true);
  for (const field of [
    page.getByLabel("Дата", { exact: true }),
    page.getByLabel("Вес подхода 1", { exact: true }),
  ]) {
    expect(
      await field.evaluate((input) => {
        const box = input.getBoundingClientRect(),
          cell = input.parentElement!.getBoundingClientRect();
        return box.left >= cell.left && box.right <= cell.right + 1 && box.width > 0;
      }),
    ).toBe(true);
  }
  await noOverflow(page);
}
async function waitForDragLayout(handle: Locator) {
  const dialog = handle.page().getByRole("dialog", { name: "Тренировочные дни", exact: true });
  await expect(dialog.getByRole("button", { name: "Готово", exact: true })).toBeEnabled();
  await handle.evaluate(async (element) => {
    const animations = element.closest("[role='dialog']")!.getAnimations({ subtree: true });
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
}
export async function keyboardSwap(page: Page, handle: Locator) {
  await waitForDragLayout(handle);
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => handle.locator("xpath=ancestor::li[1]").getAttribute("style"))
    .toMatch(/translate3d\(0px, (?!0px)/);
  // Movement of the active item precedes collision detection. Do not drop until
  // the adjacent item has also moved, confirming that dnd-kit selected it as over.
  await expect
    .poll(() =>
      handle.locator("xpath=ancestor::li[1]/following-sibling::li[1]").getAttribute("style"),
    )
    .toMatch(/translate3d\(0px, -/);
  await page.keyboard.press("Space");
}
export async function pointerSwap(page: Page, from: Locator, to: Locator) {
  // Both the sheet entrance and the preceding keyboard reorder can still animate
  // after the RPC finishes. Sample coordinates only once their layout has settled.
  await waitForDragLayout(from);
  const a = await from.boundingBox(),
    b = await to.boundingBox();
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2 - 10);
  await expect(from).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 12 });
  await expect
    .poll(() => to.locator("xpath=ancestor::li[1]").getAttribute("style"))
    .toMatch(/translate3d\(0px, (?!0px)/);
  await page.mouse.up();
}
