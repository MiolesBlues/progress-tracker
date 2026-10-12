import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authEvent, fake, resetFake, type Row } from "@/test/supabase-mock";
import { AccountBoundary, SessionProvider } from "@/lib/session";
import { ProgramManager } from "@/components/program-manager";

let qc: QueryClient;
const day = (id: string, position = 0, archived_at: string | null = null): Row => ({
  id,
  user_id: "A",
  name: id,
  position,
  archived_at,
});
const exercise = (id: string, day_id: string | null, position = 0): Row => ({
  id,
  user_id: "A",
  name: id,
  day_id,
  position,
  archived_at: null,
  target_sets: 3,
  target_reps: "8-12",
  working_weight: 50,
  example_reps: null,
});
function mount() {
  render(
    <QueryClientProvider client={qc}>
      <SessionProvider onIdentityChange={vi.fn()}>
        <AccountBoundary verifiedUserId="A">
          <ProgramManager />
        </AccountBoundary>
      </SessionProvider>
    </QueryClientProvider>,
  );
  act(() => authEvent("SIGNED_IN", "A"));
}
beforeEach(() => {
  resetFake();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fake.state.rows.program_days = [day("Первый")];
});
afterEach(() => {
  cleanup();
  qc.clear();
});

it("adds a named day after registration, renames, reorders, archives and restores it", async () => {
  mount();
  const first = await screen.findByRole("form", { name: "День: Первый" });
  expect(within(first).getByRole("button", { name: "В архив" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Название нового дня"), {
    target: { value: "  Ноги и корпус  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Добавить день" }));
  const second = await screen.findByRole("form", { name: "День: Ноги и корпус" });
  fireEvent.change(within(second).getByLabelText("Название дня"), {
    target: { value: "Силовой день" },
  });
  fireEvent.click(within(second).getByRole("button", { name: "Переименовать" }));
  const renamed = await screen.findByRole("form", { name: "День: Силовой день" });
  await waitFor(() =>
    expect(within(renamed).getByRole("button", { name: "День выше" })).toBeEnabled(),
  );
  fireEvent.click(within(renamed).getByRole("button", { name: "День выше" }));
  await waitFor(() =>
    expect(fake.state.rpc).toHaveBeenCalledWith("reorder_program_days", {
      _ids: ["new-1", "Первый"],
    }),
  );
  await waitFor(() =>
    expect(within(renamed).getByRole("button", { name: "В архив" })).toBeEnabled(),
  );
  fireEvent.click(within(renamed).getByRole("button", { name: "В архив" }));
  await screen.findByText("Архив дней");
  fireEvent.click(screen.getByText("Архив дней"));
  const restore = await screen.findByRole("button", { name: "Восстановить день" });
  await waitFor(() => expect(restore).toBeEnabled());
  fireEvent.click(restore);
  await waitFor(() =>
    expect(fake.state.rows.program_days!.find((row) => row.id === "new-1")?.archived_at).toBeNull(),
  );
  expect(fake.state.calls.find((call) => call.operation === "insert")?.values).toMatchObject({
    user_id: "A",
    name: "Ноги и корпус",
  });
  expect(
    fake.state.calls
      .filter((call) => call.operation === "update")
      .every((call) => call.filters.user_id === "A"),
  ).toBe(true);
});

it("creates and edits an exercise, moves it by day UUID, reorders and archives it", async () => {
  fake.state.rows.program_days!.push(day("Второй", 1));
  mount();
  await screen.findByLabelText("Название нового упражнения");
  fireEvent.change(screen.getByLabelText("Название нового упражнения"), {
    target: { value: "Жим" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
  const form = await screen.findByRole("form", { name: "Упражнение: Жим" });
  fireEvent.change(within(form).getByLabelText("Название упражнения"), {
    target: { value: "Жим сидя" },
  });
  fireEvent.change(within(form).getByLabelText("Тренировочный день"), {
    target: { value: "Второй" },
  });
  fireEvent.change(within(form).getByLabelText("Вес, кг"), { target: { value: "52,5" } });
  fireEvent.change(within(form).getByLabelText("Подходы"), { target: { value: "4" } });
  fireEvent.change(within(form).getByLabelText("Повторения"), { target: { value: "6–8" } });
  fireEvent.click(within(form).getByRole("button", { name: "Сохранить" }));
  await waitFor(() =>
    expect(fake.state.rows.program_exercises![0]).toMatchObject({
      name: "Жим сидя",
      day_id: "Второй",
      working_weight: 52.5,
      target_sets: 4,
      target_reps: "6–8",
    }),
  );
  await waitFor(() => expect(screen.getByLabelText("День для упражнений")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("День для упражнений"), { target: { value: "Второй" } });
  fireEvent.change(screen.getByLabelText("Название нового упражнения"), {
    target: { value: "Тяга" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
  const second = await screen.findByRole("form", { name: "Упражнение: Тяга" });
  await waitFor(() =>
    expect(within(second).getByRole("button", { name: "Упражнение выше" })).toBeEnabled(),
  );
  fireEvent.click(within(second).getByRole("button", { name: "Упражнение выше" }));
  await waitFor(() =>
    expect(fake.state.rpc).toHaveBeenCalledWith("reorder_program_exercises", {
      _day_id: "Второй",
      _ids: ["new-2", "new-1"],
    }),
  );
  await waitFor(() =>
    expect(within(second).getByRole("button", { name: "В архив" })).toBeEnabled(),
  );
  fireEvent.click(within(second).getByRole("button", { name: "В архив" }));
  await waitFor(() =>
    expect(
      fake.state.rows.program_exercises!.find((row) => row.id === "new-2")?.archived_at,
    ).toEqual(expect.any(String)),
  );
  expect(fake.state.calls.some((call) => "day" in call.values)).toBe(false);
});

it("shows NULL day_id without automatic backfill and assigns a day only on explicit save", async () => {
  fake.state.rows.program_exercises = [exercise("Старое упражнение", null)];
  mount();
  const form = await screen.findByRole("form", { name: "Упражнение: Старое упражнение" });
  expect(screen.getByRole("region", { name: "Упражнения без дня" })).toBeInTheDocument();
  expect(within(form).getByLabelText("Тренировочный день")).toHaveValue("");
  expect(fake.state.calls.every((call) => call.operation === "select")).toBe(true);
  fireEvent.change(within(form).getByLabelText("Тренировочный день"), {
    target: { value: "Первый" },
  });
  expect(fake.state.rows.program_exercises![0]?.day_id).toBeNull();
  fireEvent.click(within(form).getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(fake.state.rows.program_exercises![0]?.day_id).toBe("Первый"));
  expect(
    fake.state.calls.some(
      (call) => call.table === "workout_entries" && call.operation !== "select",
    ),
  ).toBe(false);
});

it("limits active days to seven, including restore", async () => {
  fake.state.rows.program_days = Array.from({ length: 7 }, (_, index) =>
    day(`День ${index + 1}`, index),
  );
  fake.state.rows.program_days!.push(day("Архивный", 7, "2026-10-01"));
  mount();
  await screen.findByText("Можно иметь не более 7 активных дней.");
  expect(screen.getByRole("button", { name: "Добавить день" })).toBeDisabled();
  fireEvent.click(screen.getByText("Архив дней"));
  expect(screen.getByRole("button", { name: "Восстановить день" })).toBeDisabled();
});

it("keeps the input and displays a failed save instead of claiming success", async () => {
  mount();
  await screen.findByLabelText("Название нового дня");
  fireEvent.change(screen.getByLabelText("Название нового дня"), {
    target: { value: "Не потерять" },
  });
  fake.state.nextError = "Нет связи";
  fireEvent.click(screen.getByRole("button", { name: "Добавить день" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось сохранить изменения");
  expect(screen.getByLabelText("Название нового дня")).toHaveValue("Не потерять");
  expect(fake.state.rows.program_days).toHaveLength(1);
});

it("rejects invalid exercise targets without writing", async () => {
  fake.state.rows.program_exercises = [exercise("Жим", "Первый")];
  mount();
  const form = await screen.findByRole("form", { name: "Упражнение: Жим" });
  fireEvent.change(within(form).getByLabelText("Подходы"), { target: { value: "3abc" } });
  fireEvent.click(within(form).getByRole("button", { name: "Сохранить" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Число подходов");
  expect(fake.state.calls.every((call) => call.operation === "select")).toBe(true);
});

it("a late mutation reply from A cannot update B's form or repopulate A's cache", async () => {
  fake.state.rows.program_days.push({ ...day("День B"), user_id: "B" });
  const changed = vi.fn();
  const app = (userId: string) => (
    <QueryClientProvider client={qc}>
      <SessionProvider onIdentityChange={changed}>
        <AccountBoundary verifiedUserId={userId}>
          <ProgramManager />
        </AccountBoundary>
      </SessionProvider>
    </QueryClientProvider>
  );
  const view = render(app("A"));
  act(() => authEvent("SIGNED_IN", "A"));
  await screen.findByLabelText("Название нового дня");
  let resolve!: () => void;
  fake.state.delayMutation = new Promise<void>((done) => {
    resolve = done;
  });
  fireEvent.change(screen.getByLabelText("Название нового дня"), {
    target: { value: "Приватный день A" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Добавить день" }));
  await waitFor(() =>
    expect(fake.state.calls.some((call) => call.operation === "insert")).toBe(true),
  );
  const request = fake.state.calls.find((call) => call.operation === "insert")!;
  act(() => authEvent("SIGNED_IN", "B"));
  expect(request.signal?.aborted).toBe(true);
  view.rerender(app("B"));
  await screen.findByRole("form", { name: "День: День B" });
  fireEvent.change(screen.getByLabelText("Название нового дня"), {
    target: { value: "Черновик B" },
  });
  await act(async () => {
    resolve();
    await Promise.resolve();
  });
  expect(screen.getByLabelText("Название нового дня")).toHaveValue("Черновик B");
  expect(screen.queryByText("Приватный день A")).not.toBeInTheDocument();
  expect(qc.getQueryCache().findAll({ queryKey: ["user", "A"] })).toHaveLength(0);
});
