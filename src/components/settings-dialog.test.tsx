import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it } from "vitest";
import { authEvent, resetFake } from "@/test/supabase-mock";
import { SessionProvider } from "@/lib/session";
import { LanguageProvider } from "@/lib/i18n";
import { SettingsDialog } from "./settings-dialog";

let client: QueryClient;
beforeEach(() => {
  resetFake();
  localStorage.clear();
  client = new QueryClient();
});
afterEach(() => {
  cleanup();
  client.clear();
});
it("opens and closes settings by X and Escape without changing the account session", () => {
  render(
    <QueryClientProvider client={client}>
      <SessionProvider onIdentityChange={() => {}}>
        <LanguageProvider>
          <SettingsDialog />
        </LanguageProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  act(() => authEvent("SIGNED_IN", "A"));
  fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
  expect(screen.getByRole("dialog", { name: "Настройки" })).toBeInTheDocument();
  expect(screen.getByText("Язык интерфейса")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("stores deletion and archive choices separately for each account", async () => {
  render(
    <QueryClientProvider client={client}>
      <SessionProvider onIdentityChange={() => {}}>
        <LanguageProvider>
          <SettingsDialog />
        </LanguageProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  act(() => authEvent("SIGNED_IN", "A"));
  fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
  const deletion = screen.getByRole("checkbox", { name: "Разрешить полное удаление" });
  const archive = screen.getByRole("checkbox", { name: "Показывать архивные дни и упражнения" });
  expect(deletion).not.toBeChecked();
  expect(archive).not.toBeChecked();
  fireEvent.click(deletion);
  fireEvent.click(archive);
  expect(deletion).toBeChecked();
  expect(archive).toBeChecked();
  expect(localStorage.getItem("app:archive-settings:v1:A")).toBe("3");
  act(() => authEvent("SIGNED_IN", "B"));
  await waitFor(() => expect(deletion).not.toBeChecked());
  expect(archive).not.toBeChecked();
  fireEvent.click(archive);
  expect(localStorage.getItem("app:archive-settings:v1:B")).toBe("2");
  act(() => authEvent("SIGNED_IN", "A"));
  await waitFor(() => expect(deletion).toBeChecked());
  expect(archive).toBeChecked();
});

it("shows the new controls in English for an account that selected English", async () => {
  localStorage.setItem("app:language:v1:A", "en");
  render(
    <QueryClientProvider client={client}>
      <SessionProvider onIdentityChange={() => {}}>
        <LanguageProvider>
          <SettingsDialog />
        </LanguageProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  act(() => authEvent("SIGNED_IN", "A"));
  fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
  expect(screen.getByText("Data management")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Enable permanent deletion" })).toBeInTheDocument();
  expect(
    screen.getByRole("checkbox", { name: "Show archived days and exercises" }),
  ).toBeInTheDocument();
});
