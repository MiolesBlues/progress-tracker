import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  google: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ useSession: () => ({ ready: true }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: sdk } }));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: { signInWithOAuth: sdk.google } } }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => sdk.navigate,
}));
import { Route } from "@/routes/auth";
const AuthPage = Route.options.component!;
beforeEach(() => {
  vi.resetAllMocks();
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: null });
  sdk.signUp.mockResolvedValue({ data: { session: null }, error: null });
  sdk.signInWithPassword.mockResolvedValue({ data: {}, error: null });
  sdk.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});
afterEach(cleanup);

function openSignup() {
  fireEvent.click(screen.getByRole("button", { name: "Нет аккаунта? Зарегистрироваться" }));
}

function fillSignup(password: string, confirmation: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
  fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Подтвердите пароль"), {
    target: { value: confirmation },
  });
}

it("shows password confirmation only in registration mode", () => {
  render(<AuthPage />);
  expect(screen.queryByLabelText("Подтвердите пароль")).not.toBeInTheDocument();
  openSignup();
  expect(screen.getByLabelText("Подтвердите пароль")).toBeInTheDocument();
});

it("signs up with matching passwords without sending the confirmation field", async () => {
  render(<AuthPage />);
  openSignup();
  fillSignup("strong-pass", "strong-pass");
  fireEvent.submit(screen.getByRole("button", { name: "Зарегистрироваться" }).closest("form")!);
  await waitFor(() => expect(sdk.signUp).toHaveBeenCalledTimes(1));
  expect(sdk.signUp).toHaveBeenCalledWith({
    email: "user@example.com",
    password: "strong-pass",
    options: { emailRedirectTo: `${window.location.origin}/workout` },
  });
});

it("blocks duplicate registration submissions and preserves fields after failure", async () => {
  let finishSignup!: (result: { data: { session: null }; error: Error }) => void;
  sdk.signUp.mockReturnValue(
    new Promise((resolve) => {
      finishSignup = resolve;
    }),
  );
  render(<AuthPage />);
  openSignup();
  fillSignup("strong-pass", "strong-pass");
  const submitButton = screen.getByRole("button", { name: "Зарегистрироваться" });
  const form = submitButton.closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(sdk.signUp).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Регистрируемся…" })).toBeDisabled();
  await act(async () =>
    finishSignup({ data: { session: null }, error: new Error("network failure") }),
  );
  expect(screen.getByLabelText("Email")).toHaveValue("user@example.com");
  expect(screen.getByLabelText("Пароль")).toHaveValue("strong-pass");
  expect(screen.getByLabelText("Подтвердите пароль")).toHaveValue("strong-pass");
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

it("shows a mismatch error and does not call signUp", () => {
  render(<AuthPage />);
  openSignup();
  fillSignup("strong-pass", "different-pass");
  expect(screen.getByRole("alert")).toHaveTextContent("Пароли не совпадают");
  fireEvent.submit(screen.getByRole("button", { name: "Зарегистрироваться" }).closest("form")!);
  expect(screen.getByRole("alert")).toHaveTextContent("Пароли не совпадают");
  expect(sdk.signUp).not.toHaveBeenCalled();
});

it("does not submit when password confirmation is empty", () => {
  render(<AuthPage />);
  openSignup();
  fillSignup("strong-pass", "");
  fireEvent.submit(screen.getByRole("button", { name: "Зарегистрироваться" }).closest("form")!);
  expect(screen.getByRole("alert")).toHaveTextContent("Подтвердите пароль");
  expect(sdk.signUp).not.toHaveBeenCalled();
});

it("toggles visibility independently for both password fields", () => {
  render(<AuthPage />);
  openSignup();
  fillSignup("strong-pass", "strong-pass");
  const password = screen.getByLabelText("Пароль");
  const confirmation = screen.getByLabelText("Подтвердите пароль");
  fireEvent.click(screen.getByRole("button", { name: "Показать пароль" }));
  expect(password).toHaveAttribute("type", "text");
  expect(confirmation).toHaveAttribute("type", "password");
  fireEvent.click(screen.getByRole("button", { name: "Показать подтверждение пароля" }));
  expect(confirmation).toHaveAttribute("type", "text");
  fireEvent.click(screen.getByRole("button", { name: "Скрыть пароль" }));
  expect(password).toHaveAttribute("type", "password");
});

it("keeps ordinary sign-in available with current-password autocomplete", async () => {
  render(<AuthPage />);
  expect(screen.getByRole("heading", { name: "С возвращением!" })).toBeInTheDocument();
  expect(screen.getByLabelText("Пароль")).toHaveAttribute("autocomplete", "current-password");
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
  fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "correct-pass" } });
  fireEvent.submit(screen.getByRole("button", { name: "Войти" }).closest("form")!);
  await waitFor(() =>
    expect(sdk.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "correct-pass",
    }),
  );
  expect(sdk.signUp).not.toHaveBeenCalled();
});

it.each(["returned", "thrown"])(
  "shows a Russian Google %s error and allows retry",
  async (kind) => {
    if (kind === "returned") sdk.google.mockResolvedValue({ error: new Error("provider failure") });
    else sdk.google.mockRejectedValue(new Error("provider failure"));
    render(<AuthPage />);
    fireEvent.click(screen.getByRole("button", { name: "Продолжить с Google" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось войти через Google");
    expect(screen.getByRole("button", { name: "Продолжить с Google" })).toBeEnabled();
  },
);
it("prevents concurrent OAuth starts and releases busy state", async () => {
  let done!: (result: { error: Error }) => void;
  sdk.google.mockReturnValue(
    new Promise((resolve) => {
      done = resolve;
    }),
  );
  render(<AuthPage />);
  const button = screen.getByRole("button", { name: "Продолжить с Google" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(sdk.google).toHaveBeenCalledTimes(1);
  await act(async () => done({ error: new Error("denied") }));
  await waitFor(() => expect(button).toBeEnabled());
});
it("reports a returned getSession error without navigating to private data", async () => {
  sdk.getSession.mockResolvedValue({ data: { session: null }, error: new Error("bad session") });
  render(<AuthPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось восстановить сессию");
  expect(sdk.navigate).not.toHaveBeenCalled();
});
