import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authEvent, fake, resetFake } from "@/test/supabase-mock";
import { AccountBoundary, SessionProvider, useSession } from "@/lib/session";
import { userKeys } from "@/lib/queries";
import { EntriesPage } from "./entries-page";

let queryClient: QueryClient;
function SessionEntries() {
  const session = useSession();
  if (!session.ready || !session.userId) return <p role="status">Signed out</p>;
  return (
    <AccountBoundary verifiedUserId={session.userId}>
      <EntriesPage />
    </AccountBoundary>
  );
}

function mount() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider onIdentityChange={vi.fn()}>
        <SessionEntries />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetFake();
  localStorage.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const today = new Date().toISOString().slice(0, 10);
  for (const owner of ["A", "B"]) {
    fake.state.rows.program_days.push({
      id: `day-${owner}`,
      user_id: owner,
      name: `Day ${owner}`,
      position: 0,
      archived_at: null,
    });
    fake.state.rows.program_exercises.push({
      id: `exercise-${owner}`,
      user_id: owner,
      day_id: `day-${owner}`,
      name: `Press ${owner}`,
      position: 0,
      archived_at: null,
    });
    fake.state.rows.workout_entries.push({
      id: `entry-${owner}`,
      user_id: owner,
      exercise_id: `exercise-${owner}`,
      performed_on: today,
      created_at: `${today}T10:00:00Z`,
      weight: 50,
      reps: [8],
      rir: 2,
      notes: null,
      day_id: `day-${owner}`,
      day_name: `Day ${owner}`,
    });
    fake.state.rows.workout_entry_sets.push({
      id: `set-${owner}`,
      user_id: owner,
      workout_entry_id: `entry-${owner}`,
      position: 1,
      weight: "50.00",
      reps: 8,
      rir: "2.0",
      set_type: "working",
      load_type: "external",
    });
  }
});

afterEach(() => {
  cleanup();
  queryClient.clear();
});

it("does not apply a late account A set mutation to account B UI or cache", async () => {
  let release!: () => void;
  fake.state.delayRpc = new Promise<void>((resolve) => {
    release = resolve;
  });
  mount();
  act(() => authEvent("SIGNED_IN", "A"));
  const diaryA = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  const itemA = within(diaryA).getAllByRole("listitem")[0]!;
  fireEvent.click(within(itemA).getByRole("button"));
  fireEvent.click(within(itemA).getByRole("button", { name: "Изменить подход 1" }));
  fireEvent.change(within(itemA).getByLabelText("Вес подхода 1"), { target: { value: "52.5" } });
  fireEvent.click(within(itemA).getByRole("button", { name: "Сохранить подход 1" }));
  await waitFor(() => expect(fake.state.rpcIdentityCalls).toHaveLength(1));
  const request = fake.state.rpcIdentityCalls[0]!;
  expect(request).toMatchObject({
    name: "edit_workout_entry_set",
    userId: "A",
    args: { _entry_id: "entry-A", _set_id: "set-A", _weight: "52.5" },
  });

  act(() => authEvent("SIGNED_IN", "B"));
  expect(await screen.findByRole("region", { name: "Дневник записей упражнения" })).toBeVisible();
  expect(screen.queryByText("52.5 кг")).not.toBeInTheDocument();
  expect(
    queryClient.getQueriesData({ queryKey: userKeys.entries("A", "exercise-A") }),
  ).toHaveLength(0);
  expect(
    queryClient
      .getQueriesData({ queryKey: userKeys.entries("B", "exercise-B") })
      .flatMap(
        ([, data]) =>
          (data as { entries?: { id: string }[] } | undefined)?.entries?.map((entry) => entry.id) ??
          [],
      ),
  ).toContain("entry-B");
  expect(request.signal?.aborted).toBe(true);

  await act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(screen.queryByText("Подход обновлён")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(fake.state.rows.workout_entry_sets.find((set) => set.id === "set-B")?.user_id).toBe("B");
});
