import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { trainingTemplateSummaries } from "../src/lib/training-library";

const projectRef = "fdzcwhzszbmpxyawrzzf";
const supabaseUrl = process.env["TEMPLATE_STAGING_URL"]!;
const publishableKey = process.env["TEMPLATE_STAGING_PUBLISHABLE_KEY"]!;
const runId = process.env["TEMPLATE_E2E_RUN_ID"];
const emailDomain = process.env["TEMPLATE_E2E_EMAIL_DOMAIN"]?.toLowerCase();
if (!runId || !/^[a-z0-9-]{8,40}$/.test(runId))
  throw new Error("Set TEMPLATE_E2E_RUN_ID to a unique lowercase cleanup marker.");
if (
  !emailDomain ||
  !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(emailDomain) ||
  ["example.com", "example.net", "example.org", "invalid", "test", "localhost"].some(
    (suffix) => emailDomain === suffix || emailDomain.endsWith(`.${suffix}`),
  )
)
  throw new Error(
    "Set TEMPLATE_E2E_EMAIL_DOMAIN to a domain you control for staging test signups.",
  );

const bundle = JSON.parse(
  readFileSync(
    new URL("../docs/training-library/strength-templates.v1.json", import.meta.url),
    "utf8",
  ),
);
const catalog = new Map(
  bundle.exercise_catalog.map((item: { exercise_key: string }) => [item.exercise_key, item]),
);

type Session = { access_token: string; user: { id: string } };
type DayRow = {
  id: string;
  user_id: string;
  name: string;
  position: number;
  template_application_id: string | null;
  template_day_key: string | null;
};
type ExerciseRow = {
  id: string;
  user_id: string;
  day_id: string;
  day: string;
  position: number;
  name: string;
  target_sets: number;
  target_reps: string;
  target_rir_min: number;
  target_rir_max: number;
  template_application_id: string | null;
  template_slot_key: string | null;
  template_exercise_key: string | null;
};

async function createAccount(page: Page, email: string) {
  if (page.url().endsWith("/")) await page.getByRole("link", { name: "Начать" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  const createAccountButton = page.getByRole("button", { name: /Нет аккаунта\?/ });
  if (await createAccountButton.count()) await createAccountButton.click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill("StageOnly-Template-E2E-2026!");
  await page.getByLabel("Подтвердите пароль").fill("StageOnly-Template-E2E-2026!");
  await page.getByRole("button", { name: "Зарегистрироваться" }).click();
  await expect(
    page.getByRole("heading", { name: "Сколько тренировочных дней в неделю?" }),
  ).toBeVisible({ timeout: 30_000 });
  const session = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (item) => item.startsWith("sb-") && item.endsWith("-auth-token"),
    );
    return key ? (JSON.parse(localStorage.getItem(key) ?? "null") as Session | null) : null;
  });
  if (!session?.access_token || !session.user?.id)
    throw new Error("Signup reached onboarding without an authenticated Supabase session.");
  console.log(`STAGING_TEMPLATE_USER ${JSON.stringify({ runId, userId: session.user.id, email })}`);
  return session;
}

async function selectDayCount(page: Page, count: number) {
  await page.getByRole("button", { name: String(count), exact: true }).click();
  await page.getByRole("button", { name: "Далее" }).click();
}

async function rows<T>(
  request: APIRequestContext,
  session: Session,
  table: string,
  userId: string,
): Promise<T[]> {
  const response = await request.get(
    `${supabaseUrl}/rest/v1/${table}?select=*&user_id=eq.${userId}&order=position.asc`,
    { headers: { apikey: publishableKey, authorization: `Bearer ${session.access_token}` } },
  );
  expect(response.status(), `${table} query should pass for its owner`).toBe(200);
  return response.json() as Promise<T[]>;
}

async function verifyCopiedProgram(
  request: APIRequestContext,
  session: Session,
  count: number,
  names: string[],
) {
  const template = bundle.programs.find(
    (item: { days_per_week: number }) => item.days_per_week === count,
  )!;
  const days = await rows<DayRow>(request, session, "program_days", session.user.id);
  const exercises = await rows<ExerciseRow>(request, session, "program_exercises", session.user.id);
  expect(days).toHaveLength(count);
  expect(days.map((day) => day.name)).toEqual(names);
  expect(days.map((day) => day.position)).toEqual(
    template.sessions.map((_: unknown, i: number) => i),
  );
  expect(new Set(days.map((day) => day.id)).size).toBe(count);
  expect(days.every((day) => day.template_application_id && day.template_day_key)).toBe(true);

  const dayByKey = new Map(days.map((day) => [day.template_day_key, day]));
  const expected = template.sessions.flatMap(
    (sourceDay: { day_key: string; exercises: Array<Record<string, unknown>> }) =>
      sourceDay.exercises.map((source: Record<string, unknown>) => ({
        ...source,
        day_key: sourceDay.day_key,
      })),
  );
  expect(exercises).toHaveLength(expected.length);
  expect(new Set(exercises.map((exercise) => exercise.id)).size).toBe(expected.length);
  for (const source of expected) {
    const exercise = exercises.find((item) => item.template_slot_key === source.slot_key)!;
    expect(exercise).toBeDefined();
    expect(exercise.user_id).toBe(session.user.id);
    expect(exercise.day_id).toBe(dayByKey.get(source.day_key)?.id);
    expect(exercise.day).toBe(source.day_key);
    expect(exercise.position).toBe(Number(source.order) - 1);
    expect(exercise.name).toBe(
      (catalog.get(source.exercise_key as string) as { name_ru: string }).name_ru,
    );
    expect(exercise.template_exercise_key).toBe(source.exercise_key);
    expect(exercise.target_sets).toBe(source.working_sets);
    expect(exercise.target_reps).toBe(`${source.reps_min}-${source.reps_max}`);
    expect(Number(exercise.target_rir_min)).toBe(source.rir_min);
    expect(Number(exercise.target_rir_max)).toBe(source.rir_max);
    expect(exercise.template_application_id).toBe(days[0]!.template_application_id);
  }
  return { days, exercises, template };
}

test("real staging signup, template copy 1–7 days, retry idempotency, RLS and manual setup", async ({
  page,
  request,
}) => {
  expect(new URL(supabaseUrl).hostname).toBe(`${projectRef}.supabase.co`);
  await page.goto("/");
  page.on("pageerror", (error) => console.log(`STAGING_PAGE_ERROR ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`STAGING_CONSOLE_ERROR ${message.text()}`);
  });
  page.on("response", async (response) => {
    if (new URL(response.url()).pathname.endsWith("/auth/v1/signup")) {
      const body = await response.json().catch(() => ({}));
      console.log(
        `STAGING_SIGNUP_RESPONSE ${JSON.stringify({ status: response.status(), code: body.code, message: body.msg ?? body.message })}`,
      );
    }
  });
  const firstSession = await createAccount(page, `codex-template-e2e-${runId}-1@${emailDomain}`);
  let secondUserId = "";

  for (let count = 1; count <= 7; count++) {
    let session = firstSession;
    if (count > 1) {
      await page.getByRole("button", { name: "Выйти" }).click();
      await expect(page.getByRole("heading", { name: "С возвращением!" })).toBeVisible();
      session = await createAccount(page, `codex-template-e2e-${runId}-${count}@${emailDomain}`);
      if (count === 2) secondUserId = session.user.id;
    }

    await selectDayCount(page, count);
    const template = trainingTemplateSummaries.find((item) => item.days_per_week === count)!;
    await page.getByRole("button", { name: template.title_ru }).click();
    if (count === 7) await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Далее" }).click();
    const names = Array.from(
      { length: count },
      (_, index) => `Staging ${runId} — день ${index + 1}`,
    );
    for (const [index, name] of names.entries())
      await page.getByLabel(`День ${index + 1}`).fill(name);
    await page.getByRole("button", { name: "Готово" }).click();
    await expect(page.getByRole("heading", { name: "Тренировка" })).toBeVisible();

    const {
      days,
      exercises,
      template: sourceTemplate,
    } = await verifyCopiedProgram(request, session, count, names);
    const applicationId = days[0]!.template_application_id!;
    const retry = await request.post(`${supabaseUrl}/rest/v1/rpc/apply_training_template`, {
      headers: { apikey: publishableKey, authorization: `Bearer ${session.access_token}` },
      data: {
        _application_id: applicationId,
        _template_key: sourceTemplate.template_key,
        _version: sourceTemplate.version,
        _names: names,
        _daily_opt_in: count === 7,
      },
    });
    expect([200, 204]).toContain(retry.status());
    expect(await rows<DayRow>(request, session, "program_days", session.user.id)).toHaveLength(
      count,
    );
    expect(
      await rows<ExerciseRow>(request, session, "program_exercises", session.user.id),
    ).toHaveLength(exercises.length);

    if (count === 2) {
      const foreignDays = await rows<DayRow>(request, firstSession, "program_days", secondUserId);
      const foreignExercises = await rows<ExerciseRow>(
        request,
        firstSession,
        "program_exercises",
        secondUserId,
      );
      expect(foreignDays).toEqual([]);
      expect(foreignExercises).toEqual([]);
    }
  }

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page.getByRole("heading", { name: "С возвращением!" })).toBeVisible();
  const manualSession = await createAccount(
    page,
    `codex-template-e2e-${runId}-manual@${emailDomain}`,
  );
  await selectDayCount(page, 3);
  await page.getByRole("button", { name: "Пустая программа" }).click();
  await page.getByRole("button", { name: "Далее" }).click();
  const manualNames = ["Manual A", "Manual B", "Manual C"];
  for (const [index, name] of manualNames.entries())
    await page.getByLabel(`День ${index + 1}`).fill(name);
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("heading", { name: "Программа" })).toBeVisible();
  expect(
    (await rows<DayRow>(request, manualSession, "program_days", manualSession.user.id)).map(
      (d) => d.name,
    ),
  ).toEqual(manualNames);
  expect(
    await rows<ExerciseRow>(request, manualSession, "program_exercises", manualSession.user.id),
  ).toEqual([]);
});
