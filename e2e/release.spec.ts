import { test, expect, type Page } from "@playwright/test";
import { mockSupabase } from "./mock-supabase";

async function register(page: Page, email: string, count: number) {
  if (page.url().endsWith("/"))
    await page.getByRole("link", { name: "Начать", exact: true }).click();
  else if (!page.url().endsWith("/auth")) await page.goto("/auth");
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill("Local-only-test-password!");
  await noOverflow(page);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await page.getByRole("button", { name: String(count), exact: true }).click();
  await noOverflow(page);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await noOverflow(page);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page
    .getByLabel("День 1", { exact: true })
    .fill("Силовой день с произвольным длинным названием");
  await noOverflow(page);
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Программа", exact: true })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
async function addExercise(page: Page) {
  await page.getByLabel("Название нового упражнения").fill("Жим с длинным названием упражнения");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await expect(page.getByRole("form", { name: /Упражнение: Жим/ })).toBeVisible();
}
for (const [width, count] of [
  [320, 1],
  [375, 7],
  [390, 4],
  [430, 2],
] as const) {
  test(`mobile ${width}px: registration, personal days, logging, charts and archive`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date("2026-10-13T12:00:00Z"));
    const backend = await mockSupabase(page);
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat/i.test(message.text()))
        browserErrors.push(message.text());
    });
    await page.goto("/");
    await noOverflow(page);
    await register(page, `mobile-${width}@example.invalid`, count);
    await noOverflow(page);
    await addExercise(page);
    await noOverflow(page);
    await page.getByRole("link", { name: "Тренировка", exact: true }).click();
    await page.getByLabel("Рабочий вес, кг").fill("52,5");
    for (let set = 1; set <= 3; set++)
      await page.getByLabel(`Подход ${set}`, { exact: true }).fill("8");
    await page.getByLabel("Заметки").fill("Черновик на устройстве");
    await page.reload();
    await expect(page.getByLabel("Заметки")).toHaveValue("Черновик на устройстве");
    await noOverflow(page);
    backend.loseSaveResponse = true;
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.getByRole("button", { name: "Повторить сохранение", exact: true }).click();
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    expect(backend.saveCalls).toHaveLength(2);
    expect(new Set(backend.saveCalls).size).toBe(1);
    expect(backend.rows["workout_entries"]).toHaveLength(1);
    // Stress history layout with 20 sets and a long historical day name.
    backend.rows["workout_entries"]![0]!["reps"] = Array(20).fill(100);
    await page.getByRole("link", { name: "Прогресс", exact: true }).click();
    await page.getByRole("button", { name: "Всё время", exact: true }).click();
    await expect(page.getByText("Записи за период (1)")).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`progress-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Программа", exact: true }).click();
    await page
      .getByRole("form", { name: /Упражнение: Жим/ })
      .getByRole("button", { name: "В архив", exact: true })
      .click();
    if (count === 1) {
      await page.getByLabel("Название нового дня").fill("Дополнительный");
      await page.getByRole("button", { name: "Добавить день", exact: true }).click();
    }
    await page
      .getByRole("form", { name: /День: Силовой/ })
      .getByRole("button", { name: "В архив", exact: true })
      .click();
    await page.getByRole("link", { name: "Прогресс", exact: true }).click();
    await expect(page.getByText("Записи за период (1)")).toBeVisible();
    expect(backend.rows["workout_entries"]).toHaveLength(1);
    await noOverflow(page);
    expect(browserErrors).toEqual([]);
  });
}
test("A → B → A isolates cache and restores only the owner's draft; network error has Retry", async ({
  page,
}) => {
  const backend = await mockSupabase(page);
  await register(page, "a@example.invalid", 1);
  await addExercise(page);
  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  await page.getByLabel("Заметки").fill("Секретный черновик A");
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await register(page, "b@example.invalid", 2);
  await addExercise(page);
  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  await expect(page.getByLabel("Заметки")).toHaveValue("");
  backend.offline = true;
  await page.getByRole("link", { name: "Прогресс", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Не удалось загрузить страницу", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Записей пока нет", { exact: true })).toHaveCount(0);
  backend.offline = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByText("Записей пока нет", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await page.getByLabel("Email").fill("a@example.invalid");
  await page.getByLabel("Пароль").fill("Local-only-test-password!");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByLabel("Заметки")).toHaveValue("Секретный черновик A");
});
