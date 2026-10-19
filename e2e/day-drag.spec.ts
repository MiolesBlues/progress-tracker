import { test, expect, type Locator } from "@playwright/test";
import { mockSupabase } from "./mock-supabase";
import { register, longDay, noOverflow, keyboardSwap } from "./helpers";

async function touch(
  handle: Locator,
  type: "touchstart" | "touchmove" | "touchend",
  point: { x: number; y: number },
) {
  // Playwright constructs the engine's TouchEvent from these points. A generic Event
  // would not pass dnd-kit's instanceof TouchEvent check. These are synthetic DOM
  // events, not trusted input or evidence of a physical iPhone gesture.
  const finger = { identifier: 1, clientX: point.x, clientY: point.y };
  await handle.dispatchEvent(type, {
    touches: type === "touchend" ? [] : [finger],
    targetTouches: type === "touchend" ? [] : [finger],
    changedTouches: [finger],
  });
}
for (const width of [320, 375, 390, 430]) {
  test(`mobile ${width}px: emulated held touch drag first to last, reload and failed reorder`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const backend = await mockSupabase(page);
    await register(page, `touch-${width}@example.invalid`, 3);
    await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Тренировочные дни", exact: true });
    // The full-height sheet slides in. Coordinates sampled during that animation differ by engine.
    await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    const handles = dialog.getByRole("button", { name: /Переместить день/ });
    const handle = handles.first();
    const points = await handles.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }),
    );
    const start = points[0]!,
      end = points.at(-1)!;
    await touch(handle, "touchstart", start);
    await expect(handle).toHaveAttribute("aria-pressed", "true"); // Wait for TouchSensor's hold delay.
    expect(backend.rpcCalls.filter((call) => call.name === "reorder_program_days")).toHaveLength(0);
    for (let step = 1; step <= 10; step++) {
      await touch(handle, "touchmove", {
        x: start.x + ((end.x - start.x) * step) / 10,
        y: start.y + ((end.y - start.y) * step) / 10,
      });
      await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
    }
    await expect
      .poll(() => handle.locator("xpath=ancestor::li[1]").getAttribute("style"))
      .toMatch(/translate3d\(0px, (?!0px)/);
    await expect
      .poll(() => handles.last().locator("xpath=ancestor::li[1]").getAttribute("style"))
      .toMatch(/translate3d\(0px, -/);
    await touch(handle, "touchend", end);
    await expect.poll(() => backend.rows["program_days"]![0]!["position"]).toBe(2);
    await expect(dialog.getByRole("button", { name: "Готово", exact: true })).toBeEnabled();
    await noOverflow(page);
    await dialog.getByRole("button", { name: "Готово", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
    await expect(handles.last()).toHaveAccessibleName(`Переместить день ${longDay}`);
    const previous = backend.rows["program_days"]!.map((row) => ({
      id: row.id,
      position: row["position"],
    }));
    backend.failReorder = true;
    await keyboardSwap(page, handles.first());
    await expect(dialog.getByRole("alert")).toContainText(
      "Не удалось сохранить изменения. Проверьте соединение и повторите попытку.",
    );
    expect(
      backend.rows["program_days"]!.map((row) => ({ id: row.id, position: row["position"] })),
    ).toEqual(previous);
    await expect(handles.last()).toHaveAccessibleName(`Переместить день ${longDay}`);
    await noOverflow(page);
  });
}
