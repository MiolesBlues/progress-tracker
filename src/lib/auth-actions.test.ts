import { QueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  signOut: vi.fn(),
  getSession: vi.fn(),
  setSession: vi.fn(),
  oauth: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@lovable.dev/cloud-auth-js", () => ({
  createLovableAuth: () => ({ signInWithOAuth: auth.oauth }),
}));
import { authMessage, signOutSafely } from "./auth-actions";
import { SessionStore } from "./session";
import { lovable } from "@/integrations/lovable";
beforeEach(() => vi.resetAllMocks());
it("propagates the returned setSession error and thrown OAuth errors", async () => {
  auth.oauth.mockResolvedValue({ tokens: { access_token: "invalid", refresh_token: "invalid" } });
  const error = new Error("invalid token");
  auth.setSession.mockResolvedValue({ error });
  expect(await lovable.auth.signInWithOAuth("google")).toEqual({ error });
  auth.oauth.mockRejectedValue(error);
  expect(await lovable.auth.signInWithOAuth("google")).toEqual({ error });
});
it("does not install a session after redirect or provider rejection", async () => {
  auth.oauth
    .mockResolvedValueOnce({ redirected: true })
    .mockResolvedValueOnce({ error: new Error("cancelled") });
  await lovable.auth.signInWithOAuth("google");
  await lovable.auth.signInWithOAuth("google");
  expect(auth.setSession).not.toHaveBeenCalled();
});
it("preserves successful OAuth results", async () => {
  const result = { tokens: { access_token: "a", refresh_token: "r" } };
  auth.oauth.mockResolvedValue(result);
  auth.setSession.mockResolvedValue({ error: null });
  expect(await lovable.auth.signInWithOAuth("google")).toEqual(result);
});
it.each(["returned", "thrown"])(
  "restores retained local session on %s logout failure",
  async (kind) => {
    const store = new SessionStore(new QueryClient());
    store.setUser("A");
    if (kind === "returned") auth.signOut.mockResolvedValue({ error: new Error("offline") });
    else auth.signOut.mockRejectedValue(new Error("offline"));
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "A" } } }, error: null });
    expect(await signOutSafely(store)).toMatchObject({
      signedOut: false,
      message: expect.stringContaining("Сессия на устройстве сохранена"),
    });
    expect(store.getSnapshot().userId).toBe("A");
  },
);
it("distinguishes a local logout from failed global revocation", async () => {
  const store = new SessionStore(new QueryClient());
  store.setUser("A");
  auth.signOut.mockResolvedValue({ error: new Error("offline") });
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  expect(await signOutSafely(store)).toMatchObject({
    signedOut: true,
    message: expect.stringContaining("не подтвердил отзыв"),
  });
  expect(store.getSnapshot().userId).toBeNull();
});
it("keeps private data hidden when session recovery also fails", async () => {
  const store = new SessionStore(new QueryClient());
  store.setUser("A");
  auth.signOut.mockRejectedValue(new Error("offline"));
  auth.getSession.mockRejectedValue(new Error("offline"));
  expect(await signOutSafely(store)).toMatchObject({
    signedOut: true,
    message: expect.stringContaining("Не удалось подтвердить выход"),
  });
  expect(store.getSnapshot().userId).toBeNull();
});
it("confirms successful signOut and uses Russian error messages", async () => {
  const store = new SessionStore(new QueryClient());
  store.setUser("A");
  auth.signOut.mockResolvedValue({ error: null });
  expect(await signOutSafely(store)).toEqual({ signedOut: true, message: null });
  expect(authMessage(new Error("Failed to fetch"))).toMatch(/соединение/);
  expect(authMessage(new Error("internal detail"), "google")).toMatch(
    /Не удалось войти через Google/,
  );
  expect(authMessage(new Error("Invalid login credentials"))).toBe("Неверный email или пароль.");
});
