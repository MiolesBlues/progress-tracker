import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { authEvent, resetFake } from "@/test/supabase-mock";
import { SessionProvider } from "./session";
import {
  initialDayNames,
  readLanguage,
  rememberSignupLanguage,
  translate,
  translateKnown,
  useI18n,
} from "./i18n";

it("falls back to the source string when an English translation is missing at runtime", () => {
  expect(translate("en", "unregistered runtime key" as Parameters<typeof translate>[1])).toBe(
    "unregistered runtime key",
  );
});
import { LanguageProvider } from "./i18n-provider";

it("uses the requested English label for an entry without day information", () => {
  expect(translate("en", "Без назначенного дня")).toBe("Unassigned day");
});

it("localizes the empty archived-exercises state", () => {
  expect(translate("en", "Архивированных упражнений нет")).toBe("No archived exercises");
});

function Probe() {
  const { t, setLanguage } = useI18n();
  return (
    <div>
      <h1>{t("Программа")}</h1>
      <p>Жим штанги лёжа</p>
      <button onClick={() => setLanguage("en")}>English</button>
      <button onClick={() => setLanguage("ru")}>Русский</button>
    </div>
  );
}
let client: QueryClient;
function mount() {
  client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <SessionProvider onIdentityChange={() => {}}>
        <LanguageProvider>
          <Probe />
        </LanguageProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  resetFake();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  client?.clear();
});

it("switches Russian to English and back immediately while preserving user-authored names", () => {
  mount();
  act(() => authEvent("SIGNED_IN", "A"));
  expect(screen.getByRole("heading")).toHaveTextContent("Программа");
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading")).toHaveTextContent("Program");
  expect(screen.getByText("Жим штанги лёжа")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Русский" }));
  expect(screen.getByRole("heading")).toHaveTextContent("Программа");
});

it("persists each account's language through reload and never borrows another account's choice", () => {
  mount();
  act(() => authEvent("SIGNED_IN", "A"));
  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(readLanguage("A")).toBe("en");
  expect(document.cookie).toContain("app_display_language=en");
  act(() => authEvent("SIGNED_OUT", null));
  expect(screen.getByRole("heading")).toHaveTextContent("Программа");
  expect(document.cookie).toContain("app_display_language=ru");
  act(() => authEvent("SIGNED_IN", "B"));
  expect(screen.getByRole("heading")).toHaveTextContent("Программа");
  expect(readLanguage("B")).toBe("ru");
  act(() => authEvent("SIGNED_IN", "A"));
  expect(screen.getByRole("heading")).toHaveTextContent("Program");
  expect(document.cookie).toContain("app_display_language=en");
  cleanup();
  client.clear();
  mount();
  act(() => authEvent("SIGNED_IN", "A"));
  expect(screen.getByRole("heading")).toHaveTextContent("Program");
});

it("translates validation errors and handles unavailable storage safely", () => {
  expect(translate("en", "Пароли не совпадают")).toBe("Passwords do not match");
  expect(
    translateKnown("en", "Этот пароль найден в известных утечках. Выберите другой пароль."),
  ).toBe("This password appears in known data breaches. Choose a different password.");
  expect(
    translateKnown("en", "Результат изменения не подтверждён. Повторите ту же операцию."),
  ).toBe("The change was not confirmed. Retry the same operation.");
  expect(
    translateKnown("en", "Заполните подход 4 или явно уберите его кнопкой «Убрать подход»."),
  ).toBe("Fill set 4 or explicitly remove it with Remove set.");
  expect(translateKnown("en", "ERROR: SQLSTATE 42501; token=private-value")).toBe(
    "Something went wrong. Please try again.",
  );
  expect(translateKnown("ru", "ERROR: SQLSTATE 42501; token=private-value")).toBe(
    "Произошла ошибка. Повторите попытку.",
  );
  expect(translateKnown("en", "Повторить создание")).toBe("Retry creation");
  expect(translateKnown("en", "Результат создания не подтверждён. Повторите попытку.")).toBe(
    "The creation result is not confirmed. Retry the operation.",
  );
  expect(
    translateKnown("en", "Не удалось прочитать черновик подходов. Сохранённые данные не изменены."),
  ).toBe("Could not read the set draft. Saved data was not changed.");
  expect(translateKnown("en", "Данные операции подходов не совпадают с черновиком.")).toBe(
    "The set operation does not match the draft.",
  );
  expect(translateKnown("en", "Программа уже создана")).toBe("The program already exists");
  expect(readLanguage(null)).toBe("ru");
  expect(initialDayNames(3, "en")).toEqual(["Day A", "Day B", "Day C"]);
  rememberSignupLanguage("new-account", "en");
  expect(readLanguage("new-account")).toBe("en");
  localStorage.setItem("app:language:v1:existing", "ru");
  rememberSignupLanguage("existing", "en");
  expect(readLanguage("existing")).toBe("ru");
});

it("hydrates the same Russian markup before applying a saved English guest preference", async () => {
  localStorage.setItem("app:language:v1:guest", "en");
  client = new QueryClient();
  const tree = (
    <QueryClientProvider client={client}>
      <SessionProvider onIdentityChange={() => {}}>
        <LanguageProvider>
          <Probe />
        </LanguageProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(tree);
  expect(container.querySelector("h1")).toHaveTextContent("Программа");
  document.body.append(container);
  const onRecoverableError = vi.fn();
  let root: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, { onRecoverableError });
  });
  expect(container.querySelector("h1")).toHaveTextContent("Program");
  expect(document.cookie).toContain("app_display_language=en");
  expect(onRecoverableError).not.toHaveBeenCalled();
  act(() => root.unmount());
  container.remove();
});
