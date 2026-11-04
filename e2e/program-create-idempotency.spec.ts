import { expect, test } from "@playwright/test";
import { mockSupabase } from "./mock-supabase";
import { register } from "./helpers";

test("day creation retries the same UUID after an ambiguous reply across reload", async ({
  page,
}) => {
  const backend = await mockSupabase(page);
  await page.goto("/");
  await register(page, "phase5a-day@example.invalid", 1);
  backend.loseProgramCreateResponse = "program_days";

  await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Тренировочные дни", exact: true });
  await dialog.getByLabel("Название нового дня", { exact: true }).fill("Дополнительный");
  await dialog.getByRole("button", { name: "Добавить день", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Результат создания не подтверждён");
  await expect
    .poll(() => backend.rows["program_days"]!.filter((row) => row["name"] === "Дополнительный"))
    .toHaveLength(0);
  await expect(
    dialog.getByRole("button", { name: "Повторить создание", exact: true }),
  ).toBeVisible();
  const firstId = backend.programCreateCalls[0]?.payload["id"];
  expect(firstId).toEqual(expect.any(String));
  expect(backend.programCreateCalls[0]?.userId).toBe(backend.rows["program_days"]![0]?.user_id);

  await page.reload();
  const restoredDialog = page.getByRole("dialog", { name: "Тренировочные дни", exact: true });
  await expect(restoredDialog.getByLabel("Название нового дня", { exact: true })).toHaveValue(
    "Дополнительный",
  );
  await restoredDialog.getByRole("button", { name: "Повторить создание", exact: true }).click();
  await expect.poll(() => backend.programCreateCalls).toHaveLength(2);
  await expect
    .poll(() => backend.rows["program_days"]!.filter((row) => row["name"] === "Дополнительный"))
    .toHaveLength(1);
  expect(backend.programCreateCalls.every((call) => call.payload["id"] === firstId)).toBe(true);
});

test("exercise creation recovers the exact stored payload after reload", async ({ page }) => {
  const backend = await mockSupabase(page);
  await page.goto("/");
  await register(page, "phase5a-exercise@example.invalid", 1);
  backend.loseProgramCreateResponse = "program_exercises";

  await page.getByRole("button", { name: "Добавить упражнение", exact: true }).click();
  const form = page.getByRole("form", { name: "Новое упражнение", exact: true });
  await form.getByLabel("Название упражнения", { exact: true }).fill("Жим");
  await form.getByLabel("Целевой диапазон повторений", { exact: true }).fill("8–12");
  await form.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Результат создания не подтверждён");
  await expect
    .poll(() => backend.rows["program_exercises"]!.filter((row) => row["name"] === "Жим"))
    .toHaveLength(0);
  const firstCall = backend.programCreateCalls[0]!;

  await page.reload();
  const restoredForm = page.getByRole("form", { name: "Новое упражнение", exact: true });
  await expect(restoredForm.getByLabel("Название упражнения", { exact: true })).toHaveValue("Жим");
  await expect(restoredForm.getByLabel("Целевой диапазон повторений", { exact: true })).toHaveValue(
    "8–12",
  );
  await restoredForm.getByRole("button", { name: "Повторить создание", exact: true }).click();
  await expect.poll(() => backend.programCreateCalls).toHaveLength(2);
  await expect
    .poll(() => backend.rows["program_exercises"]!.filter((row) => row["name"] === "Жим"))
    .toHaveLength(1);
  expect(backend.programCreateCalls.every((call) => call.userId === firstCall.userId)).toBe(true);
  expect(
    backend.programCreateCalls.every((call) => call.payload["id"] === firstCall.payload["id"]),
  ).toBe(true);
});
