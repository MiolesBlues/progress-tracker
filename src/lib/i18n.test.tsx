import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it } from "vitest";
import { authEvent, resetFake } from "@/test/supabase-mock";
import { SessionProvider } from "./session";
import {
  LanguageProvider,
  initialDayNames,
  readLanguage,
  rememberSignupLanguage,
  translate,
  translateKnown,
  useI18n,
} from "./i18n";

it("uses the requested English label for an entry without day information", () => {
  expect(translate("en", "Без назначенного дня")).toBe("Unassigned day");
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
  act(() => authEvent("SIGNED_OUT", null));
  expect(screen.getByRole("heading")).toHaveTextContent("Программа");
  act(() => authEvent("SIGNED_IN", "B"));
  expect(screen.getByRole("heading")).toHaveTextContent("Программа");
  expect(readLanguage("B")).toBe("ru");
  act(() => authEvent("SIGNED_IN", "A"));
  expect(screen.getByRole("heading")).toHaveTextContent("Program");
  cleanup();
  client.clear();
  mount();
  act(() => authEvent("SIGNED_IN", "A"));
  expect(screen.getByRole("heading")).toHaveTextContent("Program");
});

it("translates validation errors and handles unavailable storage safely", () => {
  expect(translate("en", "Пароли не совпадают")).toBe("Passwords do not match");
  expect(
    translateKnown("en", "Заполните подход 4 или явно уберите его кнопкой «Убрать подход»."),
  ).toBe("Fill set 4 or explicitly remove it with Remove set.");
  expect(readLanguage(null)).toBe("ru");
  expect(initialDayNames(3, "en")).toEqual(["Day A", "Day B", "Day C"]);
  rememberSignupLanguage("new-account", "en");
  expect(readLanguage("new-account")).toBe("en");
  localStorage.setItem("app:language:v1:existing", "ru");
  rememberSignupLanguage("existing", "en");
  expect(readLanguage("existing")).toBe("ru");
});
