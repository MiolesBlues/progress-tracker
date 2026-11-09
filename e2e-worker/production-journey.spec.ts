import { test, expect } from "@playwright/test";
import { mockSupabase } from "../e2e/mock-supabase";
import { register, addExercise, fillWorkout, firstName } from "../e2e/helpers";

test("built Worker hydrates, authenticates and persists a workout through a browser reload", async ({
  page,
}) => {
  // The shared context route fulfills .invalid requests in-memory and aborts
  // all other non-local hosts. Service workers cannot bypass these handlers.
  const backend = await mockSupabase(page);
  const errors: string[] = [];
  const scripts: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await register(page, "worker-smoke@example.invalid", 1);
  await addExercise(page, firstName, 2);
  await page.getByRole("link", { name: "Тренировка", exact: true }).click();
  await fillWorkout(page, "42.5", ["8", "7"], "2");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Ваша тренировка сохранена", { exact: true })).toBeVisible();
  expect(backend.rows["workout_entries"]).toHaveLength(1);
  expect(backend.rows["workout_entry_sets"]).toHaveLength(2);
  await page.getByRole("link", { name: "Записи", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Записи", exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Дневник записей упражнения", exact: true }),
  ).toBeVisible();
  expect(backend.signupCalls).toHaveLength(1);
  expect(errors).toEqual([]);
  expect(scripts.some((path) => /^\/assets\/.*\.js$/.test(path))).toBe(true);
  expect(scripts.some((path) => /@vite|\/src\//.test(path))).toBe(false);
});
