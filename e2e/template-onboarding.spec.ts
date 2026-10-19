import { expect, test, type Page } from "@playwright/test";
import { trainingTemplateSummaries } from "../src/lib/training-library";
import { mockSupabase } from "./mock-supabase";

async function createAccount(page: Page, email: string) {
  if (page.url().endsWith("/")) await page.getByRole("link", { name: "Начать" }).click();
  await page.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("Local-only-test-password!");
  await page.getByLabel("Подтвердите пароль").fill("Local-only-test-password!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(
    page.getByRole("heading", { name: "Сколько тренировочных дней в неделю?" }),
  ).toBeVisible();
}

async function selectTemplate(page: Page, count: number) {
  await page.getByRole("button", { name: String(count), exact: true }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  const template = trainingTemplateSummaries.find((item) => item.days_per_week === count)!;
  await page.getByRole("button", { name: template.title_ru }).click();
  if (count === 7) await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Далее" }).click();
  const names = Array.from({ length: count }, (_, index) => `Личный день ${index + 1}`);
  for (const [index, name] of names.entries())
    await page.getByLabel(`День ${index + 1}`).fill(name);
  await page.getByRole("button", { name: "Готово" }).click();
  return { template, names };
}

test("template onboarding selects and applies every 1–7 day variant", async ({ page }) => {
  const backend = await mockSupabase(page);
  await page.goto("/");

  for (let count = 1; count <= 7; count++) {
    if (count > 1) {
      await page.getByRole("button", { name: "Выйти" }).click();
      await expect(page.getByRole("heading", { name: "С возвращением!" })).toBeVisible();
    }
    await createAccount(page, `template-${count}@example.invalid`);
    const { template, names } = await selectTemplate(page, count);
    await expect(page.getByRole("heading", { name: "Тренировка" })).toBeVisible();

    const applied = backend.rpcCalls
      .filter((call) => call.name === "apply_training_template")
      .at(-1)!;
    expect(applied.args).toMatchObject({
      _template_key: template.template_key,
      _version: template.version,
      _names: names,
      _daily_opt_in: count === 7,
    });
    expect(String(applied.args["_application_id"])).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const userDays = backend.rows["program_days"]!.filter(
      (row) => row["user_id"] === applied.userId,
    );
    const userExercises = backend.rows["program_exercises"]!.filter(
      (row) => row["user_id"] === applied.userId,
    );
    expect(userDays.map((row) => row["name"])).toEqual(names);
    expect(userExercises).toHaveLength(count);
    expect(new Set([...userDays, ...userExercises].map((row) => row.id)).size).toBe(count * 2);
  }
});

test("template error leaves no client-visible partial result and can be retried", async ({
  page,
}) => {
  const backend = await mockSupabase(page);
  backend.failNextTemplateApply = true;
  await page.goto("/");
  await createAccount(page, "template-retry@example.invalid");
  const { names } = await selectTemplate(page, 2);

  await expect(page.getByText("Не удалось создать программу")).toBeVisible();
  expect(backend.rows["program_days"]).toHaveLength(0);
  expect(backend.rows["program_exercises"]).toHaveLength(0);
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("heading", { name: "Тренировка" })).toBeVisible();
  const attempts = backend.rpcCalls.filter((call) => call.name === "apply_training_template");
  expect(attempts).toHaveLength(2);
  expect(attempts[0]!.args["_application_id"]).toBe(attempts[1]!.args["_application_id"]);
  expect(backend.rows["program_days"]!.map((row) => row["name"])).toEqual(names);
  expect(backend.rows["program_exercises"]).toHaveLength(2);
});

test("lost apply response can be retried without duplicating template records", async ({
  page,
}) => {
  const backend = await mockSupabase(page);
  backend.loseNextTemplateApplyResponse = true;
  await page.goto("/");
  await createAccount(page, "template-lost-response@example.invalid");
  const { names } = await selectTemplate(page, 3);

  await expect(page.getByText("Не удалось создать программу")).toBeVisible();
  expect(backend.rows["program_days"]).toHaveLength(3);
  expect(backend.rows["program_exercises"]).toHaveLength(3);
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("heading", { name: "Тренировка" })).toBeVisible();
  const attempts = backend.rpcCalls.filter((call) => call.name === "apply_training_template");
  expect(attempts).toHaveLength(2);
  expect(attempts[0]!.args["_application_id"]).toBe(attempts[1]!.args["_application_id"]);
  expect(backend.rows["program_days"]).toHaveLength(3);
  expect(backend.rows["program_exercises"]).toHaveLength(3);
  expect(backend.rows["program_days"]!.map((row) => row["name"])).toEqual(names);
});

test("template choices are unavailable until the backend catalog exists; manual setup still works", async ({
  page,
}) => {
  const backend = await mockSupabase(page);
  backend.trainingLibraryAvailable = false;
  await page.goto("/");
  await createAccount(page, "template-unavailable@example.invalid");
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByRole("alert")).toContainText("шаблоны сейчас недоступны");
  await expect(
    page.getByRole("button", { name: trainingTemplateSummaries[0]!.title_ru }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Далее" }).click();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("heading", { name: "Программа" })).toBeVisible();
  expect(backend.rpcCalls.filter((call) => call.name === "setup_program")).toHaveLength(1);
  expect(backend.rpcCalls.filter((call) => call.name === "apply_training_template")).toHaveLength(
    0,
  );
});
