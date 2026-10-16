import { test, expect } from "@playwright/test";
import { addExercise, register } from "./helpers";
import { mockSupabase } from "./mock-supabase";

test("compact record sorting menu fits mobile and desktop and preserves its selection", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Responsive menu check runs once in Chromium.");
  await page.setViewportSize({ width: 390, height: 844 });
  const backend = await mockSupabase(page);
  await page.goto("/");
  await register(page, "compact-record-sort@example.invalid", 1);
  await addExercise(page, "Жим лёжа", 3);

  const exercise = backend.rows["program_exercises"]![0]!;
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  backend.rows["workout_entries"]!.push(
    {
      id: "sort-low",
      user_id: exercise.user_id,
      exercise_id: exercise.id,
      day_id: exercise["day_id"],
      day_name: "День 1",
      performed_on: today,
      created_at: `${today}T10:00:00.000Z`,
      weight: 40,
      reps: [8, 8, 8],
      rir: 2,
      notes: null,
    },
    {
      id: "sort-high",
      user_id: exercise.user_id,
      exercise_id: exercise.id,
      day_id: exercise["day_id"],
      day_name: "День 1",
      performed_on: today,
      created_at: `${today}T11:00:00.000Z`,
      weight: 60,
      reps: [6, 6, 6],
      rir: 1,
      notes: null,
    },
  );
  await page.getByRole("link", { name: "Записи", exact: true }).click();
  const diary = page.getByRole("region", { name: "Дневник записей упражнения", exact: true });
  await expect(diary.getByRole("heading", { name: "Записи · 2", exact: true })).toBeVisible();
  const topRecord = diary.getByRole("listitem").first();
  await expect(topRecord.getByRole("button")).toContainText("60 кг");
  await topRecord.getByRole("button").click();
  await expect(topRecord.getByText("60 кг", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Сортировка", { exact: true })).toHaveCount(0);

  const trigger = diary.getByRole("button", { name: "Сортировка записей", exact: true });
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(triggerBox!.width).toBeGreaterThanOrEqual(44);
  expect(triggerBox!.height).toBeGreaterThanOrEqual(44);

  for (const width of [320, 375, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await trigger.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitemradio")).toHaveCount(3);
    const menuBox = await menu.boundingBox();
    expect(menuBox).not.toBeNull();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  }

  await trigger.focus();
  await trigger.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: "Сначала новые" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await menu.getByRole("menuitemradio", { name: "Вес: по возрастанию" }).click();
  await expect(diary.getByRole("listitem").first()).toContainText("40 кг");
  await expect(trigger).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        (userId) => localStorage.getItem(`app:entries-sort:v1:${userId}`),
        exercise.user_id,
      ),
    )
    .toBe("weight-asc");

  await trigger.click();
  await page.getByRole("menuitemradio", { name: "Вес: по убыванию" }).click();
  await expect(diary.getByRole("listitem").first()).toContainText("60 кг");
  await page.reload();
  const reloadedDiary = page.getByRole("region", {
    name: "Дневник записей упражнения",
    exact: true,
  });
  await expect(reloadedDiary).toBeVisible();
  await reloadedDiary.getByRole("button", { name: "Сортировка записей", exact: true }).click();
  await expect(page.getByRole("menuitemradio", { name: "Вес: по убыванию" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
