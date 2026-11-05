import { test, expect } from "@playwright/test";
import { mockSupabase } from "./mock-supabase";
import { register, longDay, noOverflow } from "./helpers";

for (const width of [320, 375, 390, 768]) {
  test(`day rename keeps the full input and PATCH value at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const backend = await mockSupabase(page);
    await register(page, `rename-${width}@example.invalid`, 2);
    await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Тренировочные дни", exact: true });
    await dialog
      .getByRole("button", { name: `Переименовать день: ${longDay}`, exact: true })
      .click();
    const input = dialog.getByLabel("Название дня", { exact: true });
    await expect(input).toHaveAttribute("maxlength", "60");
    const renamed = `${longDay}!`;
    // Exercise native editing as a user does. Chromium fill() replacement in a
    // narrow prefilled maxlength field also truncates on a plain HTML fixture.
    await input.press("End");
    await input.pressSequentially("!");
    await expect(input).toHaveValue(renamed);
    const request = page.waitForRequest(
      (request) => request.method() === "PATCH" && request.url().includes("/program_days"),
    );
    await dialog.getByRole("button", { name: "Сохранить", exact: true }).click();
    const patchRequest = await request;
    expect(patchRequest.postDataJSON()).toEqual({ name: renamed, revision: 1 });
    expect(new URL(patchRequest.url()).searchParams.get("revision")).toBe("eq.0");
    await expect.poll(() => backend.rows["program_days"]![0]!["name"]).toBe(renamed);
    expect(backend.rows["program_days"]![0]!["revision"]).toBe(1);
    await noOverflow(page);
    await page.reload();
    await page.getByRole("button", { name: "Изменить дни", exact: true }).click();
    await expect(
      dialog.getByRole("group", { name: `День: ${renamed}`, exact: true }),
    ).toBeVisible();
  });
}
