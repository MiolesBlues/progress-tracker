import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
