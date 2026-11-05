import { test, expect } from "@playwright/test";
import { mockSupabase } from "./mock-supabase";
import { register, keyboardSwap } from "./helpers";

test("a newly added day can be keyboard reordered immediately after its confirmation", async ({
  page,
}) => {
  const backend = await mockSupabase(page);
  await page.goto("/");
  await register(page, "keyboard-readiness@example.invalid", 1);
  const first = backend.rows["program_days"]![0]!;
  await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Тренировочные дни", exact: true });
  await dialog.getByLabel("Название нового дня", { exact: true }).fill("Second day");
  await dialog.getByRole("button", { name: "Добавить день", exact: true }).click();
  await expect(dialog.getByRole("group", { name: "День: Second day", exact: true })).toBeVisible();
  await keyboardSwap(page, dialog.getByRole("button", { name: /Переместить день/ }).first());
  await expect.poll(() => first["position"]).toBe(1);
  await expect(dialog.getByRole("button", { name: "Готово", exact: true })).toBeEnabled();
});
