import { expect, test, type Page } from "@playwright/test";
import { addExercise, register, type Backend } from "./helpers";
import { mockSupabase } from "./mock-supabase";

async function openWorkout(page: Page): Promise<Backend> {
  const backend = await mockSupabase(page);
  await page.goto("/");
  await register(page, `set-drag-${Date.now()}@example.invalid`, 1);
  await addExercise(page, "Проверка перестановки подходов", 3);
  await page.goto("/workout");
  await expect(page.getByLabel("Вес подхода 1", { exact: true })).toBeVisible();
  await page.getByLabel("Вес подхода 1", { exact: true }).fill("10");
  await page.getByLabel("Вес подхода 2", { exact: true }).fill("20");
  await page.getByLabel("Вес подхода 3", { exact: true }).fill("30");
  await page.getByLabel("Повторения подхода 1", { exact: true }).fill("8");
  await page.getByLabel("Повторения подхода 2", { exact: true }).fill("7");
  await page.getByLabel("Повторения подхода 3", { exact: true }).fill("6");
  return backend;
}

test("ordinary workout sets reorder from the handle with mouse and touch", async ({ page }) => {
  test.skip(
    page.context().browser()?.browserType().name() !== "chromium",
    "Touch test uses Chromium CDP",
  );
  const backend = await openWorkout(page);

  const firstHandle = page.getByRole("button", { name: "Перетащить подход 1", exact: true });
  const secondHandle = page.getByRole("button", { name: "Перетащить подход 2", exact: true });
  const first = await firstHandle.boundingBox();
  const second = await secondHandle.boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2);
  await page.mouse.down();
  await page.mouse.move(first!.x + first!.width / 2 + 8, first!.y + first!.height / 2, {
    steps: 2,
  });
  await page.mouse.move(second!.x + second!.width / 2, second!.y + second!.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(page.getByLabel("Вес подхода 1", { exact: true })).toHaveValue("20");
  await expect(page.getByLabel("Вес подхода 2", { exact: true })).toHaveValue("10");
  await expect(page.getByLabel("Вес подхода 3", { exact: true })).toHaveValue("30");

  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Ваша тренировка сохранена", { exact: true })).toBeVisible();
  expect(
    [...backend.rows["workout_entry_sets"]!]
      .sort((a, b) => Number(a["position"]) - Number(b["position"]))
      .map((set) => set["weight"]),
  ).toEqual(["20", "10", "30"]);
  await page.reload();
  await expect(page.getByLabel("Вес подхода 1", { exact: true })).toHaveValue("20");
  await expect(page.getByLabel("Вес подхода 2", { exact: true })).toHaveValue("10");
  await expect(page.getByLabel("Вес подхода 3", { exact: true })).toHaveValue("30");

  await page.setViewportSize({ width: 320, height: 844 });
  const touchSource = page.getByRole("button", { name: "Перетащить подход 1", exact: true });
  const touchTarget = page.getByRole("button", { name: "Перетащить подход 2", exact: true });
  const sourceBox = await touchSource.boundingBox();
  const targetBox = await touchTarget.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const touch = await page.context().newCDPSession(page);
  const x = sourceBox!.x + sourceBox!.width / 2;
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: sourceBox!.y + sourceBox!.height / 2, id: 9 }],
  });
  await page.waitForTimeout(200);
  for (let step = 1; step <= 10; step++) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x,
          y:
            sourceBox!.y +
            sourceBox!.height / 2 +
            ((targetBox!.y + targetBox!.height / 2 - sourceBox!.y - sourceBox!.height / 2) * step) /
              10,
          id: 9,
        },
      ],
    });
  }
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByLabel("Вес подхода 1", { exact: true })).toHaveValue("10");
  await expect(page.getByLabel("Вес подхода 2", { exact: true })).toHaveValue("20");
  await expect(page.getByLabel("Вес подхода 3", { exact: true })).toHaveValue("30");
});
