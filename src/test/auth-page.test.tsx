import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
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
  sdk.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});
afterEach(cleanup);
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
