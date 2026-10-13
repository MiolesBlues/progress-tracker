import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authEvent, fake, resetFake } from "@/test/supabase-mock";
import { AccountBoundary, SessionProvider, SessionStore, useUserSession } from "@/lib/session";
import { daysQuery, entriesQuery, lastEntryQuery, programQuery, userKeys } from "@/lib/queries";

const clients: QueryClient[] = [];
function client() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(qc);
  return qc;
}
beforeEach(resetFake);
afterEach(() => {
  cleanup();
  clients.forEach((qc) => qc.clear());
  clients.length = 0;
});

function PersonalPage() {
  const { userId } = useUserSession();
  const { data } = useQuery(daysQuery(userId));
  const [draft, setDraft] = useState("");
  return (
    <>
      <div>{data?.map((day) => day.name).join(",")}</div>
      <input
        aria-label="Черновик"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </>
  );
}
function app(qc: QueryClient, verifiedUserId: string, changed = vi.fn()) {
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider onIdentityChange={changed}>
        <AccountBoundary verifiedUserId={verifiedUserId}>
          <PersonalPage />
        </AccountBoundary>
      </SessionProvider>
    </QueryClientProvider>
  );
}

describe("account isolation", () => {
  it("keeps the hydration snapshot anonymous even if auth arrives before a lazy page hydrates", () => {
    const store = new SessionStore(client());
    const initial = store.getServerSnapshot();
    store.setUser("A");
    expect(store.getServerSnapshot()).toBe(initial);
    expect(initial).toMatchObject({ ready: false, userId: null });
    expect(store.getSnapshot()).toMatchObject({ ready: true, userId: "A" });
  });
  it("SIGNED_IN A → B removes A data before the router verifies B, then mounts a fresh draft", async () => {
    const qc = client();
    fake.state.rows.program_days = [
      { id: "a-day", user_id: "A", name: "Секрет A", position: 0 },
      { id: "b-day", user_id: "B", name: "День B", position: 0 },
    ];
    const changed = vi.fn();
    const view = render(app(qc, "A", changed));
    act(() => authEvent("INITIAL_SESSION", "A"));
    await screen.findByText("Секрет A");
    fireEvent.change(screen.getByLabelText("Черновик"), { target: { value: "Черновик A" } });
    act(() => authEvent("SIGNED_IN", "B"));
    expect(screen.queryByText("Секрет A")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Черновик A")).not.toBeInTheDocument();
    expect(qc.getQueryData(userKeys.days("A"))).toBeUndefined();
    expect(screen.getByRole("status")).toHaveTextContent("Проверка сессии");
    view.rerender(app(qc, "B", changed));
    await screen.findByText("День B");
    expect(screen.getByLabelText("Черновик")).toHaveValue("");
    expect(screen.queryByText("Секрет A")).not.toBeInTheDocument();
  });

  it.each(["TOKEN_REFRESHED", "SIGNED_IN", "USER_UPDATED"])(
    "%s for the same user preserves cache and the draft",
    async (event) => {
      const qc = client();
      fake.state.rows.program_days = [{ id: "a", user_id: "A", name: "День A", position: 0 }];
      const changed = vi.fn();
      render(app(qc, "A", changed));
      act(() => authEvent("SIGNED_IN", "A"));
      await screen.findByText("День A");
      await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
      fireEvent.change(screen.getByLabelText("Черновик"), { target: { value: "50 × 8" } });
      const calls = fake.state.calls.length;
      act(() => authEvent(event, "A"));
      expect(screen.getByLabelText("Черновик")).toHaveValue("50 × 8");
      expect(qc.getQueryData(userKeys.days("A"))).toBeDefined();
      expect(fake.state.calls.length).toBe(calls);
      expect(changed).toHaveBeenCalledTimes(1);
    },
  );

  it("SIGNED_OUT hides private UI synchronously and clears all personal query families", async () => {
    const qc = client();
    render(app(qc, "A"));
    act(() => authEvent("SIGNED_IN", "A"));
    await screen.findByLabelText("Черновик");
    for (const key of [
      userKeys.program("A"),
      userKeys.entries("A", "ex"),
      userKeys.lastEntry("A", "ex"),
    ])
      qc.setQueryData(key, "private");
    act(() => authEvent("SIGNED_OUT", null));
    expect(screen.queryByLabelText("Черновик")).not.toBeInTheDocument();
    expect(qc.getQueryCache().findAll({ queryKey: ["user"] })).toHaveLength(0);
  });

  it("aborts A requests and ignores late replies even when the transport ignores cancellation (A → B → A)", async () => {
    const qc = client();
    const store = new SessionStore(qc);
    store.setUser("A");
    let resolve!: (value: string) => void;
    let requestSignal!: AbortSignal;
    const late = qc
      .fetchQuery({
        queryKey: userKeys.days("A"),
        queryFn: ({ signal }) => {
          requestSignal = signal;
          return new Promise<string>((done) => {
            resolve = done;
          });
        },
      })
      .catch(() => undefined);
    const mutationSignal = store.getSnapshot().signal;
    store.setUser("B");
    expect(requestSignal.aborted).toBe(true);
    expect(mutationSignal.aborted).toBe(true);
    store.setUser("A");
    qc.setQueryData(userKeys.days("A"), "new session");
    resolve("old private response");
    await late;
    expect(qc.getQueryData(userKeys.days("A"))).toBe("new session");
  });

  it("blocks a stale SIGNED_IN/TOKEN_REFRESHED while logout is in flight", () => {
    const store = new SessionStore(client());
    store.setUser("A");
    store.startSignOut();
    store.setUser("A");
    expect(store.getSnapshot().userId).toBeNull();
    store.finishSignOut();
    store.setUser("B");
    expect(store.getSnapshot().userId).toBe("B");
  });

  it("every personal query uses user-specific keys, an explicit owner filter, and the cancellation signal", async () => {
    const qc = client();
    for (const query of [
      daysQuery("A"),
      programQuery("A"),
      entriesQuery("A", "ex", "2026-10-01"),
      lastEntryQuery("A", "ex"),
    ]) {
      expect(query.queryKey.slice(0, 2)).toEqual(["user", "A"]);
      // The union has different result types; query cache accepts each options shape individually.
      await qc.fetchQuery({
        queryKey: query.queryKey,
        queryFn: query.queryFn as () => Promise<unknown>,
      });
    }
    expect(fake.state.calls).toHaveLength(4);
    for (const call of fake.state.calls) {
      expect(call.filters.user_id).toBe("A");
      expect(call.signal).toBeInstanceOf(AbortSignal);
    }
  });
});
