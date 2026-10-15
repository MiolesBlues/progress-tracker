import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mockSupabase } from "./mock-supabase";
import { addExercise, longDay, noOverflow, register } from "./helpers";

for (const width of [320, 375, 390, 430]) {
  test(`archive settings and safe deletion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const backend = await mockSupabase(page);
    await page.goto("/");
    await register(page, `archive-${width}@example.invalid`, 2);
    await addExercise(page, "Исторический жим");
    const day = backend.rows["program_days"]!.find((row) => row["name"] === longDay)!;
    const exercise = backend.rows["program_exercises"]!.find(
      (row) => row["name"] === "Исторический жим",
    )!;
    backend.rows["workout_entries"]!.push({
      id: randomUUID(),
      user_id: day.user_id,
      exercise_id: exercise.id,
      day_id: day.id,
      day_name: longDay,
      performed_on: "2026-10-15",
      created_at: "2026-10-15T12:00:00Z",
      weight: 50,
      reps: [8, 8, 7],
      rir: 2,
      notes: "Сохранить снимок",
    });
    await page.getByRole("button", { name: "В архив: Исторический жим" }).click();
    await page.getByRole("button", { name: "Изменить дни" }).click();
    const daysDialog = page.getByRole("dialog", { name: "Тренировочные дни" });
    await daysDialog.getByRole("button", { name: `Архивировать день: ${longDay}` }).click();
    await daysDialog.getByText("Архив дней", { exact: true }).click();
    await expect(daysDialog.getByRole("button", { name: `Удалить день: ${longDay}` })).toHaveCount(
      0,
    );
    await daysDialog.getByRole("button", { name: "Готово" }).click();
    await page.getByRole("button", { name: "Настройки" }).click();
    const settings = page.getByRole("dialog", { name: "Настройки" });
    await settings.getByRole("checkbox", { name: "Разрешить полное удаление" }).click();
    await settings.getByRole("checkbox", { name: "Показывать архивные дни и упражнения" }).click();
    await settings.getByRole("button", { name: "Закрыть" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Изменить дни" }).click();
    await daysDialog.getByText("Архив дней", { exact: true }).click();
    await daysDialog.getByRole("button", { name: `Удалить день: ${longDay}` }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation.getByText("Связанных упражнений: 1")).toBeVisible();
    await expect(confirmation.getByText("Исторических записей: 1")).toBeVisible();
    await confirmation.getByRole("button", { name: "Отмена" }).click();
    expect(backend.rows["program_days"]!.some((row) => row.id === day.id)).toBe(true);
    await daysDialog.getByRole("button", { name: `Удалить день: ${longDay}` }).click();
    await confirmation.getByRole("button", { name: "Удалить день", exact: true }).click();
    await expect(daysDialog.getByRole("button", { name: `Удалить день: ${longDay}` })).toHaveCount(
      0,
    );
    expect(
      backend.rows["program_exercises"]!.find((row) => row.id === exercise.id)?.["day_id"],
    ).toBeNull();
    expect(backend.rows["workout_entries"]![0]).toMatchObject({
      exercise_id: exercise.id,
      day_id: null,
      day_name: longDay,
      weight: 50,
      reps: [8, 8, 7],
    });
    await daysDialog.getByRole("button", { name: "Готово" }).click();
    await page.getByRole("link", { name: "Записи", exact: true }).click();
    await page.getByLabel("День записей").selectOption("unassigned");
    await expect(page.getByText("Сохранить снимок")).toBeVisible();
    await page.getByRole("link", { name: "Прогресс", exact: true }).click();
    await page.getByRole("button", { name: "Архивная история" }).click();
    await page
      .getByLabel("Тренировочный день", { exact: true })
      .selectOption("__unassigned_history__");
    await expect(page.getByRole("option", { name: "Исторический жим" })).toBeAttached();
    await page.getByRole("button", { name: "Всё время" }).click();
    await expect(page.getByText("Записи за период (1)")).toBeVisible();
    await page.getByRole("link", { name: "Программа", exact: true }).click();
    await page.getByRole("button", { name: "Удалить упражнение: Исторический жим" }).click();
    await expect(confirmation.getByText("Исторических записей: 1")).toBeVisible();
    await confirmation.getByRole("button", { name: "Удалить навсегда" }).click();
    await expect(
      page.getByRole("button", { name: "Удалить упражнение: Исторический жим" }),
    ).toHaveCount(0);
    expect(backend.rows["workout_entries"]).toHaveLength(0);
    await noOverflow(page);
  });
}
