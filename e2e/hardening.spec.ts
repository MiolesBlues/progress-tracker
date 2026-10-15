import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mockSupabase } from "./mock-supabase";
import { register, addExercise, chooseProgramDay, noOverflow, longDay, firstName } from "./helpers";

async function authSpacing(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  expect(
    await button.evaluate((element) => {
      const outer = element.firstElementChild!,
        action = outer.querySelector("span")!,
        prefix = outer.firstChild!;
      const range = document.createRange();
      range.setStart(prefix, 0);
      range.setEnd(prefix, prefix.textContent!.trimEnd().length);
      const text = range.getBoundingClientRect(),
        link = action.getBoundingClientRect();
      return (
        element.getBoundingClientRect().height >= 44 &&
        (link.left > text.right + 1 || link.top >= text.bottom)
      );
    }),
  ).toBe(true);
}

for (const width of [320, 375, 390, 430]) {
  test(`hardening ${width}px: selection, editor errors, busy drag, legacy diary and restore`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
    const backend = await mockSupabase(page);
    await page.goto("/auth");
    await authSpacing(page, "Нет аккаунта? Зарегистрироваться");
    await page
      .getByRole("button", { name: "Нет аккаунта? Зарегистрироваться", exact: true })
      .click();
    await authSpacing(page, "Уже есть аккаунт? Войти");
    await page.getByRole("button", { name: "Уже есть аккаунт? Войти", exact: true }).click();
    await register(page, `hardening-${width}@example.invalid`, 2);
    const [first, second] = backend.rows["program_days"]!;
    await chooseProgramDay(page, String(second!["name"]));
    await addExercise(page, "Тяга");
    await page.reload();
    const select = page.getByRole("combobox", { name: "День для упражнений", exact: true });
    await expect(select).toContainText(`${second!["name"]} · 1 упр.`);
    await chooseProgramDay(page, longDay);
    await addExercise(page);
    const toast = page.getByText("Упражнение добавлено", { exact: true }).last();
    await expect(toast).toBeVisible();
    await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute(
      "data-sonner-theme",
      "dark",
    );
    expect(
      await toast.locator("xpath=ancestor::li[1]").evaluate((element) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        context.fillStyle = getComputedStyle(element).backgroundColor;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return (r! + g! + b!) / 3 < 128;
      }),
    ).toBe(true);
    await page.getByRole("button", { name: `Редактировать: ${firstName}`, exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Редактирование упражнения", exact: true });
    await editor.getByLabel("Повторения", { exact: true }).fill("8-1");
    await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(editor.getByRole("alert")).toContainText("Повторения:");
    await expect(editor.getByLabel("Повторения", { exact: true })).toHaveValue("8-1");
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`editor-error-${width}.png`),
      fullPage: true,
    });
    await editor.getByLabel("Повторения", { exact: true }).fill("8-12");
    backend.failPatch = true;
    await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(editor.getByRole("alert")).toContainText("Не удалось сохранить изменения");
    await expect(editor.getByLabel("Повторения", { exact: true })).toHaveValue("8-12");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Тренировочные дни", exact: true });
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog
      .getByRole("button", { name: `Переименовать день: ${longDay}`, exact: true })
      .click();
    await dialog.getByLabel("Название дня", { exact: true }).fill("Переименованный день");
    let release!: () => void;
    backend.delayProgramUpdate = {
      id: first!.id,
      promise: new Promise<void>((done) => {
        release = done;
      }),
    };
    await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect.poll(() => backend.delayProgramUpdate).toBeNull();
    const handle = dialog.getByRole("button", { name: `Переместить день ${longDay}`, exact: true });
    await expect(handle).toBeDisabled();
    await handle.dispatchEvent("keydown", { key: " ", code: "Space" });
    await expect(handle).not.toHaveAttribute("aria-pressed", "true");
    expect(backend.rpcCalls.filter((call) => call.name === "reorder_program_days")).toHaveLength(0);
    release();
    await expect(
      dialog.getByRole("button", { name: "Переместить день Переименованный день", exact: true }),
    ).toBeEnabled();
    await dialog.getByRole("button", { name: "Готово", exact: true }).click();
    const exercise = backend.rows["program_exercises"]!.find((row) => row["name"] === firstName)!;
    const legacy = {
      ...exercise,
      id: randomUUID(),
      day_id: null,
      name: "Старое упражнение",
      archived_at: "2026-10-01",
    };
    backend.rows["program_exercises"]!.push(legacy);
    backend.rows["workout_entries"]!.push(
      ...Array.from({ length: 25 }, (_, index) => ({
        id: randomUUID(),
        user_id: exercise.user_id,
        exercise_id: exercise.id,
        day_id: first!.id,
        day_name: "Переименованный день",
        performed_on: "2026-10-15",
        created_at: `2026-10-15T10:00:${String(index).padStart(2, "0")}Z`,
        weight: index,
        reps: [8, 7],
        rir: 2,
        notes: `Запись ${index}`,
      })),
      {
        id: randomUUID(),
        user_id: exercise.user_id,
        exercise_id: legacy.id,
        day_id: null,
        day_name: "Старое название",
        performed_on: "2026-10-15",
        created_at: "2026-10-15T09:00:00Z",
        weight: 42,
        reps: [8],
        rir: null,
        notes: "История без дня",
      },
    );
    const historyIds = backend.rows["workout_entries"]!.map((row) => row.id);
    // Fixtures were added outside the UI; reload to fetch that program snapshot.
    await page.reload();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByRole("checkbox", { name: "Показывать архивные дни и упражнения" }).click();
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await page.getByRole("link", { name: "Записи", exact: true }).click();
    await page.getByLabel("День записей", { exact: true }).selectOption(first!.id);
    await page.getByLabel("Упражнение записей", { exact: true }).selectOption(exercise.id);
    const diary = page.getByRole("region", { name: "Дневник записей упражнения", exact: true });
    await expect(diary.getByRole("heading", { name: "Записи · 25", exact: true })).toBeVisible();
    await expect(diary.getByRole("listitem")).toHaveCount(20);
    await diary.getByRole("button", { name: "Далее", exact: true }).click();
    await expect(diary.getByRole("listitem")).toHaveCount(5);
    await diary.getByLabel("Сортировка записей", { exact: true }).selectOption("weight-asc");
    await expect(diary.getByText("Страница 1 из 2", { exact: true })).toBeVisible();
    await expect(diary.getByRole("listitem").first()).toContainText("0 кг");
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`entries-${width}.png`), fullPage: true });
    await page.getByLabel("День записей", { exact: true }).selectOption("unassigned");
    await expect(diary.getByText("История без дня", { exact: true })).toBeVisible();
    expect(legacy.day_id).toBeNull();
    await page.getByRole("link", { name: "Программа", exact: true }).click();
    await expect(select).toContainText("Переименованный день");
    await page.getByRole("button", { name: `В архив: ${firstName}`, exact: true }).click();
    await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Архивировать день: Переименованный день", exact: true })
      .click();
    await expect(dialog.getByRole("button", { name: "Готово", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Готово", exact: true }).click();
    await expect(select).toContainText(String(second!["name"]));
    await page.reload();
    await expect(select).toContainText(String(second!["name"]));
    await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
    await dialog.getByText("Архив дней", { exact: true }).click();
    await dialog
      .getByRole("button", { name: "Восстановить день: Переименованный день", exact: true })
      .click();
    await expect(dialog.getByRole("button", { name: "Готово", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Готово", exact: true }).click();
    await chooseProgramDay(page, "Переименованный день");
    await page.getByText("Архив упражнений", { exact: true }).click();
    await page.getByRole("button", { name: `Восстановить: ${firstName}`, exact: true }).click();
    await expect(
      page.getByRole("button", { name: `Редактировать: ${firstName}`, exact: true }),
    ).toBeVisible();
    expect(backend.rows["workout_entries"]!.map((row) => row.id)).toEqual(historyIds);
    await noOverflow(page);
  });
}

test("B12 a day archived between SELECT and INSERT leaves the creation draft intact", async ({
  page,
}) => {
  const backend = await mockSupabase(page);
  await register(page, "race@example.invalid", 2);
  await page.getByRole("button", { name: "Добавить упражнение", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Добавить упражнение", exact: true });
  await dialog.getByLabel("Название упражнения", { exact: true }).fill("Сохранить мой ввод");
  await dialog.getByLabel("Целевой диапазон повторений", { exact: true }).fill("8–12");
  backend.archiveDayOnInsert = true;
  await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Программа изменилась");
  await expect(dialog.getByLabel("Название упражнения", { exact: true })).toHaveValue(
    "Сохранить мой ввод",
  );
  expect(backend.rows["program_exercises"]).toHaveLength(0);
});
