import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addExercise, longDay, register } from "./helpers";
import { mockSupabase } from "./mock-supabase";

test("renamed day appears for archived exercise history without changing snapshots or reloading", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-15T12:00:00Z"));
  const backend = await mockSupabase(page);
  await page.goto("/");
  await register(page, "rename-history@example.invalid", 2);
  await addExercise(page, "Исторический жим");
  const day = backend.rows["program_days"]!.find((row) => row["name"] === longDay)!;
  const exercise = backend.rows["program_exercises"]!.find(
    (row) => row["name"] === "Исторический жим",
  )!;
  const snapshots = Array.from({ length: 2 }, (_, index) => ({
    id: randomUUID(),
    user_id: day.user_id,
    exercise_id: exercise.id,
    day_id: day.id,
    day_name: longDay,
    performed_on: "2026-10-15",
    created_at: `2026-10-15T10:00:0${index}Z`,
    weight: 50,
    reps: [8, 7],
    rir: 2,
    notes: null,
  }));
  backend.rows["workout_entries"]!.push(...snapshots);
  await page.getByRole("link", { name: "Записи", exact: true }).click();
  const diary = page.getByRole("region", { name: "Дневник записей упражнения" });
  await expect(diary.getByText(/ · Силовой день с произвольным длинным названием/)).toHaveCount(2);
  await page.getByRole("link", { name: "Программа", exact: true }).click();
  await page.getByRole("button", { name: "В архив: Исторический жим" }).click();
  await page.getByRole("button", { name: "Изменить дни" }).click();
  const daysDialog = page.getByRole("dialog", { name: "Тренировочные дни" });
  await daysDialog.getByRole("button", { name: `Переименовать день: ${longDay}` }).click();
  await daysDialog.getByLabel("Название дня").fill("Push");
  await daysDialog.getByRole("button", { name: "Сохранить" }).click();
  await daysDialog.getByRole("button", { name: "Готово" }).click();
  await page.getByRole("button", { name: "Настройки" }).click();
  await page.getByRole("checkbox", { name: "Показывать архивные дни и упражнения" }).click();
  await page.getByRole("button", { name: "Закрыть" }).click();
  await page.getByRole("link", { name: "Записи", exact: true }).click();
  await expect(page.getByRole("option", { name: "Push", exact: true })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "Push", exact: true })).toHaveAttribute(
    "value",
    day.id,
  );
  await expect(page.getByRole("option", { name: "Исторический жим (архив)" })).toBeAttached();
  await expect(diary.getByText(/ · Push$/)).toHaveCount(2);
  expect(backend.rows["workout_entries"]).toEqual(snapshots);
});
