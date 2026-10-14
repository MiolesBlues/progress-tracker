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
async function openDayManagement() {
  fireEvent.click(await screen.findByRole("button", { name: "Изменить дни" }));
}
function mockSortableRects() {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function getRect(this: HTMLElement) {
      const item = this.closest("li");
      const index = item ? Array.from(item.parentElement?.children ?? []).indexOf(item) : -1;
      const top = index < 0 ? 0 : index * 64;
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 320,
        bottom: top + 56,
        width: 320,
        height: index < 0 ? 500 : 56,
        toJSON: () => ({}),
      } as DOMRect;
    });
}
async function startKeyboardDrag(handle: HTMLElement) {
  fireEvent.keyDown(handle, { key: "Space", code: "Space", keyCode: 32 });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
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

it("adds a named day after registration, renames, archives and restores it", async () => {
  mount();
  await openDayManagement();
  const first = await screen.findByRole("group", { name: "День: Первый" });
  expect(within(first).queryByLabelText("Название дня")).not.toBeInTheDocument();
  expect(within(first).getByRole("button", { name: "Архивировать день: Первый" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Название нового дня"), {
    target: { value: "  Ноги и корпус  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Добавить день" }));
  const second = await screen.findByRole("group", { name: "День: Ноги и корпус" });
  fireEvent.click(
    within(second).getByRole("button", { name: "Переименовать день: Ноги и корпус" }),
  );
  fireEvent.change(within(second).getByLabelText("Название дня"), {
    target: { value: "Силовой день" },
  });
  fireEvent.click(within(second).getByRole("button", { name: "Сохранить" }));
  const renamed = await screen.findByRole("group", { name: "День: Силовой день" });
  expect(screen.queryByRole("button", { name: "День выше" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "День ниже" })).not.toBeInTheDocument();
  fireEvent.click(within(renamed).getByRole("button", { name: "Архивировать день: Силовой день" }));
  await screen.findByText("Архив дней");
  fireEvent.click(screen.getByText("Архив дней"));
  const archived = await screen.findByRole("group", { name: "День: Силовой день" });
  fireEvent.click(
    within(archived).getByRole("button", { name: "Восстановить день: Силовой день" }),
  );
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

it("reorders the first day to the last with the keyboard handle and keeps the saved position", async () => {
  fake.state.rows.program_days = [day("День A"), day("День B", 1), day("День C", 2)];
  mount();
  await openDayManagement();

  const rectSpy = mockSortableRects();
  const handle = screen.getByRole("button", { name: "Переместить день День A" });
  await startKeyboardDrag(handle);
  fireEvent.keyDown(handle, { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
  fireEvent.keyDown(handle, { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
  fireEvent.keyDown(handle, { key: "Space", code: "Space", keyCode: 32 });

  try {
    await waitFor(() =>
      expect(fake.state.rpc).toHaveBeenCalledWith("reorder_program_days", {
        _ids: ["День B", "День C", "День A"],
      }),
    );
    await waitFor(() => {
      expect(fake.state.rows.program_days!.map((row) => row.position)).toEqual([2, 0, 1]);
    });
    expect(screen.getByRole("group", { name: "День: День A" })).toBeInTheDocument();
  } finally {
    rectSpy.mockRestore();
  }
});

it("keeps the previous day order and displays an error when the reorder RPC fails", async () => {
  fake.state.rows.program_days = [day("День A"), day("День B", 1)];
  mount();
  await openDayManagement();
  const rectSpy = mockSortableRects();
  const handle = screen.getByRole("button", { name: "Переместить день День A" });

  await startKeyboardDrag(handle);
  fireEvent.keyDown(handle, { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
  fake.state.nextError = "Нет соединения";
  fireEvent.keyDown(handle, { key: "Space", code: "Space", keyCode: 32 });

  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось сохранить изменения");
  expect(fake.state.rpc).toHaveBeenCalledWith("reorder_program_days", {
    _ids: ["День B", "День A"],
  });
  expect(fake.state.rows.program_days!.map((row) => row.position)).toEqual([0, 1]);
  rectSpy.mockRestore();
});

it("creates an exercise for the selected day and edits it without changing its working weight", async () => {
  fake.state.rows.program_days!.push(day("Второй", 1));
  mount();
  fireEvent.change(await screen.findByLabelText("День для упражнений"), {
    target: { value: "Второй" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Добавить упражнение" }));
  const createForm = await screen.findByRole("form", { name: "Новое упражнение" });
  expect(screen.getByLabelText("День для упражнений")).toBeDisabled();
  expect(within(createForm).getByLabelText("Название упражнения")).toBeInTheDocument();
  expect(within(createForm).getByLabelText("Количество подходов")).toBeInTheDocument();
  expect(within(createForm).getByLabelText("Целевой диапазон повторений")).toBeInTheDocument();
  expect(within(createForm).queryByLabelText("Вес, кг")).not.toBeInTheDocument();
  expect(within(createForm).queryByLabelText("Тренировочный день")).not.toBeInTheDocument();
  fireEvent.change(within(createForm).getByLabelText("Название упражнения"), {
    target: { value: "Жим" },
  });
  fireEvent.change(within(createForm).getByLabelText("Целевой диапазон повторений"), {
    target: { value: "8–12" },
  });
  fireEvent.click(within(createForm).getByRole("button", { name: "Сохранить" }));
  await waitFor(() =>
    expect(fake.state.rows.program_exercises![0]).toMatchObject({
      name: "Жим",
      day_id: "Второй",
      target_sets: 3,
      target_reps: "8–12",
    }),
  );
  expect(fake.state.calls.find((call) => call.operation === "insert")?.values).not.toHaveProperty(
    "working_weight",
  );
  fake.state.rows.program_exercises![0]!["working_weight"] = 50;
  await waitFor(() => expect(screen.queryByRole("form", { name: "Новое упражнение" })).toBeNull());
  fireEvent.change(screen.getByLabelText("День для упражнений"), { target: { value: "Первый" } });
  fireEvent.change(screen.getByLabelText("День для упражнений"), { target: { value: "Второй" } });
  const form =
    (fireEvent.click(await screen.findByRole("button", { name: "Редактировать: Жим" })),
    await screen.findByRole("form", { name: "Упражнение: Жим" }));
  expect(within(form).getAllByRole("button")).toHaveLength(1);
  expect(within(form).getByRole("button", { name: "Сохранить" })).toHaveClass("bg-primary");
  expect(within(form).queryByRole("button", { name: "Упражнение выше" })).not.toBeInTheDocument();
  expect(within(form).queryByRole("button", { name: "Упражнение ниже" })).not.toBeInTheDocument();
  expect(within(form).queryByRole("button", { name: "В архив" })).not.toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText("Название упражнения"), {
    target: { value: "Жим сидя" },
  });
  fireEvent.change(within(form).getByLabelText("Тренировочный день"), {
    target: { value: "Второй" },
  });
  expect(within(form).queryByLabelText("Вес, кг")).not.toBeInTheDocument();
  fireEvent.change(within(form).getByLabelText("Подходы"), { target: { value: "4" } });
  fireEvent.change(within(form).getByLabelText("Повторения"), { target: { value: "6–8" } });
  fireEvent.click(within(form).getByRole("button", { name: "Сохранить" }));
  await waitFor(() =>
    expect(fake.state.rows.program_exercises![0]).toMatchObject({
      name: "Жим сидя",
      day_id: "Второй",
      target_sets: 4,
      target_reps: "6–8",
    }),
  );
  expect(fake.state.rows.program_exercises![0]?.["working_weight"]).toBe(50);
  await waitFor(() => expect(screen.queryByRole("form", { name: "Упражнение: Жим" })).toBeNull());
  await waitFor(() => expect(screen.getByLabelText("День для упражнений")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("День для упражнений"), { target: { value: "Второй" } });
  expect(
    await screen.findByRole("button", { name: "Редактировать: Жим сидя" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "В архив: Жим сидя" }));
  await waitFor(() =>
    expect(
      fake.state.rows.program_exercises!.find((row) => row.id === "new-1")?.archived_at,
    ).toEqual(expect.any(String)),
  );
  expect(
    fake.state.calls
      .filter((call) => call.operation === "update")
      .every((call) => !("working_weight" in call.values)),
  ).toBe(true);
  expect(fake.state.calls.some((call) => "day" in call.values)).toBe(false);
});

it("keeps the creation form open when the captured day is archived before save", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Добавить упражнение" }));
  const form = await screen.findByRole("form", { name: "Новое упражнение" });
  fireEvent.change(within(form).getByLabelText("Название упражнения"), {
    target: { value: "Тяга" },
  });
  fireEvent.change(within(form).getByLabelText("Целевой диапазон повторений"), {
    target: { value: "8–10" },
  });
  fake.state.rows.program_days![0]!["archived_at"] = "2026-10-14T12:00:00Z";
  fireEvent.click(within(form).getByRole("button", { name: "Сохранить" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("больше недоступен");
  expect(screen.getByLabelText("Название упражнения")).toHaveValue("Тяга");
  expect(fake.state.calls.some((call) => call.operation === "insert")).toBe(false);
});

it("shows NULL day_id without automatic backfill and assigns a day only on explicit save", async () => {
  fake.state.rows.program_exercises = [exercise("Старое упражнение", null)];
  mount();
  expect(await screen.findByRole("region", { name: "Упражнения без дня" })).toBeInTheDocument();
  const form =
    (fireEvent.click(
      await screen.findByRole("button", { name: "Редактировать: Старое упражнение" }),
    ),
    await screen.findByRole("form", { name: "Упражнение: Старое упражнение" }));
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
  await openDayManagement();
  await screen.findByText("Можно иметь не более 7 активных дней.");
  expect(screen.getByRole("button", { name: "Добавить день" })).toBeDisabled();
  fireEvent.click(screen.getByText("Архив дней"));
  expect(screen.getByRole("button", { name: "Восстановить день: Архивный" })).toBeDisabled();
});

it("keeps the input and displays a failed save instead of claiming success", async () => {
  mount();
  await openDayManagement();
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
  const form =
    (fireEvent.click(await screen.findByRole("button", { name: "Редактировать: Жим" })),
    await screen.findByRole("form", { name: "Упражнение: Жим" }));
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
  await openDayManagement();
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
  await waitFor(() => expect(screen.getByLabelText("День для упражнений")).toHaveValue("День B"));
  await openDayManagement();
  await screen.findByRole("group", { name: "День: День B" });
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
