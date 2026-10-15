import { test, expect } from "@playwright/test";
import { mockSupabase } from "./mock-supabase";
import {
  register,
  addExercise,
  chooseDay,
  chooseProgramDay,
  seedHistory,
  geometry,
  noOverflow,
  keyboardSwap,
  pointerSwap,
  password,
  firstName,
  secondName,
  longDay,
} from "./helpers";

for (const [width, count] of [
  [320, 1],
  [375, 7],
  [390, 4],
  [430, 2],
] as const) {
  test(`mobile ${width}px: current release UI, continuous logging, records and archive`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
    const backend = await mockSupabase(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat/i.test(message.text())) errors.push(message.text());
    });
    await page.goto("/");
    await noOverflow(page);
    await register(page, `mobile-${width}@example.invalid`, count);
    expect(backend.signupCalls).toHaveLength(1);
    expect(backend.signupCalls[0]).not.toHaveProperty("confirmPassword");
    expect(backend.rows["program_days"]).toHaveLength(count);
    const days = backend.rows["program_days"]!,
      firstDay = days[0]!;
    await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
    const dayDialog = page.getByRole("dialog", { name: "Тренировочные дни", exact: true });
    if (count === 1) {
      await dayDialog.getByLabel("Название нового дня", { exact: true }).fill("Дополнительный");
      await dayDialog.getByRole("button", { name: "Добавить день", exact: true }).click();
      await expect(
        dayDialog.getByRole("group", { name: "День: Дополнительный", exact: true }),
      ).toBeVisible();
    }
    const handles = dayDialog.getByRole("button", { name: /Переместить день/ });
    await expect(dayDialog.getByRole("button", { name: /[↑↓]/ })).toHaveCount(0);
    await keyboardSwap(page, handles.first());
    await expect.poll(() => firstDay["position"]).toBe(1);
    // Wait for confirmed mutation before starting another drag (known B13 is outside this stage).
    await expect(dayDialog.getByRole("button", { name: "Готово", exact: true })).toBeEnabled();
    await pointerSwap(page, handles.nth(1), handles.first());
    await expect.poll(() => firstDay["position"]).toBe(0);
    await expect(dayDialog.getByRole("button", { name: "Готово", exact: true })).toBeEnabled();
    await noOverflow(page);
    await dayDialog.getByRole("button", { name: "Готово", exact: true }).click();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Программа", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
    await expect(handles.first()).toHaveAccessibleName(`Переместить день ${longDay}`);
    const group = dayDialog.getByRole("group", { name: `День: ${longDay}`, exact: true });
    await group
      .getByRole("button", { name: `Переименовать день: ${longDay}`, exact: true })
      .click();
    await group.getByLabel("Название дня", { exact: true }).fill(`${longDay}!`);
    await group.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(dayDialog.getByLabel("Название дня", { exact: true })).toHaveCount(0);
    await expect.poll(() => firstDay["name"]).toBe(`${longDay}!`);
    const renamed = dayDialog.getByRole("group", { name: `День: ${longDay}!`, exact: true });
    await renamed
      .getByRole("button", { name: `Переименовать день: ${longDay}!`, exact: true })
      .click();
    await renamed.getByLabel("Название дня", { exact: true }).fill(longDay);
    await renamed.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(dayDialog.getByLabel("Название дня", { exact: true })).toHaveCount(0);
    await dayDialog.getByRole("button", { name: "Готово", exact: true }).click();
    const other = days.find((day) => day.id !== firstDay.id)!;
    await chooseProgramDay(page, String(other["name"]));
    await expect(page.getByText("Упражнений пока нет.", { exact: true })).toBeVisible();
    await chooseProgramDay(page, longDay);
    await addExercise(page);
    await addExercise(page, secondName, 3);
    expect(backend.rows["program_exercises"]!.every((row) => row["day_id"] === firstDay.id)).toBe(
      true,
    );
    await page.getByRole("button", { name: `Редактировать: ${firstName}`, exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Редактирование упражнения", exact: true });
    await expect(editor.getByLabel(/вес/i)).toHaveCount(0);
    await expect(editor.getByRole("combobox", { name: /^Тренировочный день/ })).toBeVisible();
    await expect(editor.getByRole("button", { name: /В архив|[↑↓]/ })).toHaveCount(0);
    await editor.getByLabel("Подходы", { exact: true }).fill("4");
    await editor.getByLabel("Повторения", { exact: true }).fill("8–12");
    await noOverflow(page);
    await editor.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(editor).toBeHidden();
    const { first, second } = seedHistory(backend);
    expect(first["target_reps"]).toBe("8–12");
    expect(first["working_weight"]).toBeNull();
    await page.getByRole("link", { name: "Тренировка", exact: true }).click();
    const daySelect = page.getByRole("combobox", { name: "Тренировочный день", exact: true });
    await expect(daySelect).toContainText(`${longDay} · 2 упражнения`);
    await daySelect.focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("option")).toHaveCount(days.length);
    await noOverflow(page);
    await page.keyboard.press("Escape");
    await expect(daySelect).toBeFocused();
    const otherDay = days.find((day) => day.id !== firstDay.id)!;
    await chooseDay(page, `${otherDay["name"]} · 0 упражнений`);
    await expect(page.getByText("В этом дне нет активных упражнений.")).toBeVisible();
    await chooseDay(page, `${longDay} · 2 упражнения`);
    await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("50");
    await expect(page.getByLabel("Подход 4", { exact: true })).toHaveValue("6");
    await expect(page.getByLabel("RIR (необязательно)", { exact: true })).toHaveValue("2");
    await expect(page.getByText("План 4×8–12", { exact: true })).toBeVisible();
    await geometry(page);
    await page.getByLabel("Рабочий вес, кг", { exact: true }).fill("52,5");
    await page.getByLabel("Подход 4", { exact: true }).fill("7");
    await page.getByLabel("Заметки", { exact: true }).fill("Черновик на устройстве");
    await page.reload();
    await expect(page.getByLabel("Заметки", { exact: true })).toHaveValue("Черновик на устройстве");
    await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("52,5");
    await expect(page.getByLabel("Подход 4", { exact: true })).toHaveValue("7");
    backend.loseSaveResponse = true;
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await page.getByRole("button", { name: "Повторить сохранение", exact: true }).click();
    await expect(page.getByLabel("Упражнение", { exact: true })).toHaveValue(second.id);
    await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("70");
    await expect(page.getByLabel("Подход 3", { exact: true })).toHaveValue("8");
    await expect(page.getByLabel("Подход 4", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Дата", { exact: true })).toHaveValue("2026-10-15");
    await expect(page.getByLabel("Заметки", { exact: true })).toHaveValue("");
    const toast = page.getByText("Ваша тренировка сохранена", { exact: true });
    await expect(toast).toBeVisible();
    await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toBeEnabled();
    // Measure the whole toast after its entrance transition, not a moving text child.
    await expect
      .poll(async () => {
        const toastBox = await toast.locator("xpath=ancestor::li[1]").boundingBox();
        const navBox = await page.getByRole("navigation").boundingBox();
        return !!toastBox && !!navBox && toastBox.y + toastBox.height <= navBox.y;
      })
      .toBe(true);
    expect(new Set(backend.saveCalls).size).toBe(1);
    expect(backend.saveCalls).toHaveLength(2);
    expect(
      backend.rows["workout_entries"]!.filter((row) => row.id === backend.saveCalls[0]),
    ).toHaveLength(1);
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByText(/Все упражнения этого дня пройдены/)).toBeVisible();
    const lastSavedAt = Date.now();
    await expect(toast).toHaveCount(1);
    await expect(toast).toBeHidden({ timeout: 5_000 });
    expect(Date.now() - lastSavedAt).toBeGreaterThanOrEqual(2_000);
    await expect(page.getByText("Сохранено", { exact: true })).toHaveCount(0);
    await page.getByLabel("Упражнение", { exact: true }).selectOption(first.id);
    await expect(page.getByLabel("Подход 4", { exact: true })).toHaveValue("7");
    await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("52.5");
    await page.getByRole("link", { name: "Записи", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Записи", exact: true })).toBeVisible();
    await page
      .getByRole("combobox", { name: "День записей", exact: true })
      .selectOption(firstDay.id);
    await page.getByLabel("Упражнение записей", { exact: true }).selectOption(first.id);
    const diary = page.getByRole("region", { name: "Дневник записей упражнения", exact: true });
    for (const [label, records] of [
      ["Сегодня", 2],
      ["7 дней", 3],
      ["30 дней", 3],
      ["Всё время", 4],
    ] as const) {
      await diary.getByRole("button", { name: label, exact: true }).click();
      await expect(
        diary.getByRole("heading", { name: `Записи · ${records}`, exact: true }),
      ).toBeVisible();
      await expect(diary.getByRole("listitem")).toHaveCount(records);
    }
    await expect(diary.getByText("Будущая запись", { exact: true })).toHaveCount(0);
    await diary.getByLabel("Сортировка записей", { exact: true }).selectOption("weight-desc");
    await expect(diary.getByRole("listitem").first()).toContainText("52,5 кг");
    await expect(diary.getByRole("listitem").nth(1)).toContainText("Ранняя сессия");
    await expect(diary.getByRole("listitem").nth(2)).toContainText("Вчерашняя запись");
    await diary.getByLabel("Сортировка записей", { exact: true }).selectOption("weight-asc");
    await expect(diary.getByRole("listitem").first()).toContainText("40 кг");
    await noOverflow(page);
    await page.getByRole("link", { name: "Прогресс", exact: true }).click();
    await page.getByLabel("Тренировочный день", { exact: true }).selectOption(firstDay.id);
    await page.getByLabel("Упражнение", { exact: true }).selectOption(first.id);
    await page.getByRole("button", { name: "Всё время", exact: true }).click();
    await expect(page.getByText("Записи за период (4)", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "С предыдущей сессией", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "С прошлой календарной неделей", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("50 → 52,5 кг (+5%)", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("График тренировок", { exact: true }).locator("svg"),
    ).toBeVisible();
    for (const metric of ["weight", "reps", "volume"])
      await page.getByLabel("Показатель", { exact: true }).selectOption(metric);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`progress-${width}.png`), fullPage: true });
    const historyIds = backend.rows["workout_entries"]!.map((row) => row.id);
    await page.getByRole("link", { name: "Программа", exact: true }).click();
    await page.getByRole("button", { name: `В архив: ${firstName}`, exact: true }).click();
    await expect(
      page.getByRole("button", { name: `Редактировать: ${firstName}`, exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
    await dayDialog
      .getByRole("button", { name: `Архивировать день: ${longDay}`, exact: true })
      .click();
    await expect(
      dayDialog.getByRole("button", { name: `Переместить день ${longDay}`, exact: true }),
    ).toHaveCount(0);
    await dayDialog.getByRole("button", { name: "Готово", exact: true }).click();
    await page.getByRole("link", { name: "Записи", exact: true }).click();
    await page
      .getByRole("combobox", { name: "День записей", exact: true })
      .selectOption(firstDay.id);
    await page.getByLabel("Упражнение записей", { exact: true }).selectOption(first.id);
    await diary.getByRole("button", { name: "Всё время", exact: true }).click();
    await expect(diary.getByRole("listitem")).toHaveCount(4);
    await page.getByRole("link", { name: "Прогресс", exact: true }).click();
    await page.getByRole("button", { name: "Архивная история", exact: true }).click();
    await page.getByLabel("Тренировочный день", { exact: true }).selectOption(firstDay.id);
    await page.getByLabel("Упражнение", { exact: true }).selectOption(first.id);
    await page.getByRole("button", { name: "Всё время", exact: true }).click();
    await expect(page.getByText("Записи за период (4)", { exact: true })).toBeVisible();
    expect(backend.rows["workout_entries"]!.map((row) => row.id)).toEqual(historyIds);
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("A → B → A isolates cache and restores only the owner's draft; network error has Retry", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
  const backend = await mockSupabase(page);
  await register(page, "a@example.invalid", 1);
  await addExercise(page);
  const exerciseA = backend.rows["program_exercises"]![0]!;
  backend.rows["workout_entries"]!.push({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    user_id: exerciseA.user_id,
    exercise_id: exerciseA.id,
    day_id: exerciseA["day_id"],
    day_name: longDay,
    performed_on: "2026-10-15",
    created_at: "2026-10-15T09:00:00Z",
    weight: 55,
    reps: [8, 8, 7, 6],
    rir: 2,
    notes: "История A",
  });
  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("55");
  await page.getByLabel("Рабочий вес, кг", { exact: true }).fill("61");
  await page.getByLabel("Заметки", { exact: true }).fill("Секретный черновик A");
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await register(page, "b@example.invalid", 2);
  await addExercise(page, "Упражнение B");
  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  await expect(page.getByLabel("Заметки", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("");
  await expect(page.getByRole("option", { name: firstName, exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Записи", exact: true }).click();
  await expect(page.getByText("За выбранный период записей нет.", { exact: true })).toBeVisible();
  await expect(page.getByText("История A", { exact: true })).toHaveCount(0);
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
  await page.getByLabel("Email", { exact: true }).fill("a@example.invalid");
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await expect(page.getByLabel("Пароль", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  await page.getByLabel("Пароль", { exact: true }).press("Enter");
  await expect(page.getByLabel("Заметки", { exact: true })).toHaveValue("Секретный черновик A");
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("61");
});

test("stage 1 regressions: stale cached history, late reply, old next-exercise draft and date", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
  const backend = await mockSupabase(page);
  await register(page, "fresh@example.invalid", 2);
  await addExercise(page);
  await addExercise(page, secondName, 3);
  const { first, second } = seedHistory(backend);
  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  await expect(page.getByLabel("Подход 4", { exact: true })).toHaveValue("6");
  await page.getByLabel("Упражнение", { exact: true }).selectOption(second.id);
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("70");
  const latest = backend.rows["workout_entries"]!.find(
    (row) => row["exercise_id"] === first.id && row["performed_on"] === "2026-10-15",
  )!;
  latest["weight"] = 55;
  latest["reps"] = [9, 9, 8, 7];
  latest["rir"] = 1;
  await page.getByLabel("Упражнение", { exact: true }).selectOption(first.id);
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("55");
  await expect(page.getByLabel("Подход 1", { exact: true })).toHaveValue("9");
  await page.getByLabel("Упражнение", { exact: true }).selectOption(second.id);
  let release!: () => void;
  backend.delayLastRead = {
    exerciseId: first.id,
    promise: new Promise<void>((done) => {
      release = done;
    }),
  };
  await page.getByLabel("Упражнение", { exact: true }).selectOption(first.id);
  await expect.poll(() => backend.delayLastRead).toBeNull();
  await page.getByLabel("Рабочий вес, кг", { exact: true }).fill("62,5");
  release();
  await expect(page.getByText(/Было 55 кг/)).toBeVisible();
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("62,5");
  await page.evaluate(
    ({ userId, exerciseId }) => {
      localStorage.setItem(
        `workout:draft:v1:${userId}:${exerciseId}`,
        JSON.stringify({
          version: 1,
          userId,
          exerciseId,
          id: crypto.randomUUID(),
          fields: { date: "2026-10-01", weight: "99", reps: ["1"], rir: "9", notes: "" },
          dirty: { date: false, weight: false, reps: false, rir: false, notes: false },
          operation: null,
        }),
      );
    },
    { userId: first.user_id, exerciseId: second.id },
  );
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByLabel("Упражнение", { exact: true })).toHaveValue(second.id);
  await expect(page.getByLabel("Дата", { exact: true })).toHaveValue("2026-10-15");
  await expect(page.getByLabel("Рабочий вес, кг", { exact: true })).toHaveValue("70");
  await expect(page.getByLabel("Подход 3", { exact: true })).toHaveValue("8");
});
