import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authEvent, fake, resetFake, type Row } from "@/test/supabase-mock";
import { AccountBoundary, SessionProvider } from "@/lib/session";
import { ProgramManager } from "@/components/program-manager";
import { userKeys, type Day } from "@/lib/queries";

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
  target_rir_min: null,
  target_rir_max: null,
  working_weight: 50,
  example_reps: null,
});
function mount(verifiedUserId = "A") {
  const view = render(
    <QueryClientProvider client={qc}>
      <SessionProvider onIdentityChange={vi.fn()}>
        <AccountBoundary verifiedUserId={verifiedUserId}>
          <ProgramManager />
        </AccountBoundary>
      </SessionProvider>
    </QueryClientProvider>,
  );
  act(() => authEvent("SIGNED_IN", verifiedUserId));
  return view;
}
async function chooseProgramDay(name: string) {
  fireEvent.click(await screen.findByRole("combobox", { name: "День для упражнений" }));
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(`^${name} ·`) }));
}
async function chooseEditorDay(form: HTMLElement, optionName: string) {
  fireEvent.click(within(form).getByRole("combobox", { name: "Тренировочный день" }));
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
}
async function openDayManagement() {
  fireEvent.click(await screen.findByRole("button", { name: "Изменить дни" }));
}

it("shows day management in a centered dialog with a fixed completion action", async () => {
  mount();
  const trigger = await screen.findByRole("button", { name: "Изменить дни" });
  fireEvent.click(trigger);

  const dialog = await screen.findByRole("dialog", { name: "Тренировочные дни" });
  expect(dialog).toHaveClass("max-h-[90dvh]", "max-w-[520px]");
  expect(dialog).toHaveStyle({ width: "min(520px, calc(100vw - 2rem))" });
  expect(within(dialog).getByText("1 из 7 активных дней")).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Готово" })).toBeInTheDocument();
  expect(dialog.querySelector(".overflow-y-auto")).not.toBeNull();

  fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Тренировочные дни" })).toBeNull(),
  );
  expect(trigger).toHaveFocus();
});

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
  localStorage.clear();
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
  expect(
    qc
      .getQueryData<Array<{ id: string; name: string }>>(userKeys.days("A"))
      ?.find((row) => row.name === "Силовой день")?.name,
  ).toBe("Силовой день");
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
    expect(
      fake.state.rows.program_days!.find((row) => row["name"] === "Силовой день")?.["archived_at"],
    ).toBeNull(),
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

it("shows the target RIR copied from a template in the exercise summary", async () => {
  const firstDayId = "Первый";
  const firstDay = day(firstDayId);
  fake.state.rows.program_days = [firstDay];
  fake.state.rows.program_exercises = [
    { ...exercise("Присед", firstDayId), target_rir_min: 2, target_rir_max: 3 },
  ];
  mount();
  expect(await screen.findByText("3 × 8–12 · RIR 2–3")).toBeInTheDocument();
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
  await chooseProgramDay("Второй");
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
  await chooseProgramDay("Первый");
  await chooseProgramDay("Второй");
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
  await chooseEditorDay(form, "Второй");
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
  await chooseProgramDay("Второй");
  expect(
    await screen.findByRole("button", { name: "Редактировать: Жим сидя" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "В архив: Жим сидя" }));
  await waitFor(() =>
    expect(
      fake.state.rows.program_exercises!.find((row) => row["name"] === "Жим сидя")?.["archived_at"],
    ).toEqual(expect.any(String)),
  );
  expect(
    fake.state.calls
      .filter((call) => call.operation === "update")
      .every((call) => !("working_weight" in call.values)),
  ).toBe(true);
  expect(fake.state.calls.some((call) => "day" in call.values)).toBe(false);
});

it("recovers a day created before a lost response after a component remount without duplicating it", async () => {
  const first = mount();
  await openDayManagement();
  fireEvent.change(screen.getByLabelText("Название нового дня"), { target: { value: "Ноги" } });
  fake.state.insertErrorAfterCommit = { code: "FETCH_ERROR", message: "lost response" };
  fake.state.nextReadError = { table: "program_days", message: "temporary read error" };
  fireEvent.click(screen.getByRole("button", { name: "Добавить день" }));
  await screen.findByRole("alert");
  const pending = JSON.parse(localStorage.getItem("program:create:v1:A:day") ?? "null") as {
    id: string;
  };
  expect(fake.state.rows.program_days!.filter((row) => row["name"] === "Ноги")).toHaveLength(1);
  first.unmount();

  mount();
  await screen.findByRole("button", { name: "Повторить создание" });
  fireEvent.click(screen.getByRole("button", { name: "Повторить создание" }));
  await waitFor(() => expect(localStorage.getItem("program:create:v1:A:day")).toBeNull());
  expect(fake.state.rows.program_days!.filter((row) => row["name"] === "Ноги")).toHaveLength(1);
  expect(fake.state.rows.program_days!.find((row) => row["name"] === "Ноги")?.["id"]).toBe(
    pending.id,
  );
  expect(
    fake.state.calls.filter(
      (call) => call.operation === "insert" && call.values["name"] === "Ноги",
    ),
  ).toHaveLength(2);
});

it("recovers a created exercise after remount with its original UUID and frozen values", async () => {
  const first = mount();
  fireEvent.click(await screen.findByRole("button", { name: "Добавить упражнение" }));
  const form = await screen.findByRole("form", { name: "Новое упражнение" });
  fireEvent.change(within(form).getByLabelText("Название упражнения"), {
    target: { value: "Жим" },
  });
  fireEvent.change(within(form).getByLabelText("Целевой диапазон повторений"), {
    target: { value: "8–12" },
  });
  fake.state.insertErrorAfterCommit = { code: "FETCH_ERROR", message: "lost response" };
  fake.state.nextReadError = {
    table: "program_exercises",
    message: "temporary read error",
  };
  fireEvent.click(within(form).getByRole("button", { name: "Сохранить" }));
  await screen.findByRole("alert");
  const pending = JSON.parse(localStorage.getItem("program:create:v1:A:exercise") ?? "null") as {
    id: string;
    payload: { name: string; target_reps: string };
  };
  expect(fake.state.rows.program_exercises!.filter((row) => row["name"] === "Жим")).toHaveLength(1);
  first.unmount();

  mount();
  const restored = await screen.findByRole("form", { name: "Новое упражнение" });
  expect(within(restored).getByLabelText("Название упражнения")).toHaveValue("Жим");
  expect(within(restored).getByLabelText("Название упражнения")).toBeDisabled();
  fireEvent.click(within(restored).getByRole("button", { name: "Повторить создание" }));
  await waitFor(() => expect(localStorage.getItem("program:create:v1:A:exercise")).toBeNull());
  expect(fake.state.rows.program_exercises!.filter((row) => row["name"] === "Жим")).toHaveLength(1);
  expect(fake.state.rows.program_exercises!.find((row) => row["name"] === "Жим")?.["id"]).toBe(
    pending.id,
  );
  expect(
    fake.state.rows.program_exercises!.find((row) => row["name"] === "Жим")?.["target_reps"],
  ).toBe(pending.payload.target_reps);
  expect(
    fake.state.calls.filter((call) => call.operation === "insert" && call.values["name"] === "Жим"),
  ).toHaveLength(2);
});

it("double submit and a slow response keep day creation to one UUID and one row", async () => {
  let release!: () => void;
  fake.state.delayMutation = new Promise<void>((resolve) => {
    release = resolve;
  });
  mount();
  await openDayManagement();
  fireEvent.change(screen.getByLabelText("Название нового дня"), { target: { value: "День B" } });
  const submit = screen.getByRole("button", { name: "Добавить день" });
  fireEvent.click(submit);
  fireEvent.click(submit);
  await waitFor(() =>
    expect(fake.state.rows.program_days!.filter((row) => row["name"] === "День B")).toHaveLength(1),
  );
  await waitFor(() =>
    expect(
      fake.state.calls.filter(
        (call) => call.operation === "insert" && call.values["name"] === "День B",
      ),
    ).toHaveLength(1),
  );
  release();
  await waitFor(() => expect(localStorage.getItem("program:create:v1:A:day")).toBeNull());
  expect(fake.state.rows.program_days!.filter((row) => row["name"] === "День B")).toHaveLength(1);
});

it("same display names remain independent for different users", async () => {
  mount("A");
  await openDayManagement();
  fireEvent.change(screen.getByLabelText("Название нового дня"), {
    target: { value: "Общий день" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Добавить день" }));
  await waitFor(() =>
    expect(
      fake.state.rows.program_days!.filter((row) => row["name"] === "Общий день"),
    ).toHaveLength(1),
  );
  cleanup();
  qc.clear();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mount("B");
  await openDayManagement();
  fireEvent.change(screen.getByLabelText("Название нового дня"), {
    target: { value: "Общий день" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Добавить день" }));
  await waitFor(() =>
    expect(
      fake.state.rows.program_days!.filter((row) => row["name"] === "Общий день"),
    ).toHaveLength(2),
  );
  const created = fake.state.rows.program_days!.filter((row) => row["name"] === "Общий день");
  expect(created.map((row) => row["user_id"]).sort()).toEqual(["A", "B"]);
  expect(created[0]?.["id"]).not.toBe(created[1]?.["id"]);
});

it("keeps a pending day scoped to its original account when the session switches", async () => {
  let release!: () => void;
  fake.state.delayMutation = new Promise<void>((resolve) => {
    release = resolve;
  });
  mount("A");
  await openDayManagement();
  fireEvent.change(screen.getByLabelText("Название нового дня"), { target: { value: "A day" } });
  fireEvent.click(screen.getByRole("button", { name: "Добавить день" }));
  await waitFor(() =>
    expect(fake.state.rows.program_days!.some((row) => row["name"] === "A day")).toBe(true),
  );
  act(() => authEvent("SIGNED_IN", "B"));
  expect(screen.queryByText("День добавлен")).toBeNull();
  expect(qc.getQueryData<Day[]>(userKeys.days("B"))?.some((row) => row.name === "A day")).not.toBe(
    true,
  );
  expect(fake.state.rows.program_days!.find((row) => row["name"] === "A day")?.["user_id"]).toBe(
    "A",
  );
  expect(localStorage.getItem("program:create:v1:A:day")).not.toBeNull();
  release();
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
  expect(within(form).getByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent(
    "Без назначенного дня",
  );
  expect(fake.state.calls.every((call) => call.operation === "select")).toBe(true);
  await chooseEditorDay(form, "Первый");
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
  expect(await screen.findByRole("alert")).toHaveTextContent("Результат создания не подтверждён");
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
  await waitFor(() =>
    expect(screen.getByLabelText("День для упражнений")).toHaveTextContent("День B"),
  );
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

it("B05 persists the active day, counts exercises and falls back after archival", async () => {
  fake.state.rows.program_days!.push(day("Второй", 1), day("Архив", 2, "2026-10-01"));
  fake.state.rows.program_exercises = [exercise("Жим", "Первый"), exercise("Тяга", "Второй")];
  const view = mount();
  await chooseProgramDay("Второй");
  expect(screen.getByRole("combobox", { name: "День для упражнений" })).toHaveTextContent(
    "Второй · 1 упр.",
  );
  expect(screen.queryByRole("button", { name: "Редактировать: Жим" })).not.toBeInTheDocument();
  expect(localStorage.getItem("program:day:v1:A")).toBe("Второй");
  view.unmount();
  mount();
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "День для упражнений" })).toHaveTextContent(
      "Второй",
    ),
  );
  await openDayManagement();
  fireEvent.click(screen.getByRole("button", { name: "Архивировать день: Второй" }));
  await waitFor(() =>
    expect(fake.state.rows.program_days![1]?.archived_at).toEqual(expect.any(String)),
  );
  fireEvent.click(screen.getByRole("button", { name: "Готово" }));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "День для упражнений" })).toHaveTextContent(
      "Первый",
    ),
  );
  expect(localStorage.getItem("program:day:v1:A")).toBe("Первый");
  fireEvent.click(screen.getByRole("combobox", { name: "День для упражнений" }));
  expect(screen.getAllByRole("option")).toHaveLength(1);
});

it("B05 restores separate preferences for A and B and safely handles missing days", async () => {
  fake.state.rows.program_days = [day("A1"), day("A2", 1), { ...day("B1"), user_id: "B" }];
  localStorage.setItem("program:day:v1:A", "A2");
  localStorage.setItem("program:day:v1:B", "B1");
  const app = (userId: string) => (
    <QueryClientProvider client={qc}>
      <SessionProvider onIdentityChange={vi.fn()}>
        <AccountBoundary verifiedUserId={userId}>
          <ProgramManager />
        </AccountBoundary>
      </SessionProvider>
    </QueryClientProvider>
  );
  const view = render(app("A"));
  act(() => authEvent("SIGNED_IN", "A"));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "День для упражнений" })).toHaveTextContent("A2"),
  );
  act(() => authEvent("SIGNED_IN", "B"));
  view.rerender(app("B"));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "День для упражнений" })).toHaveTextContent("B1"),
  );
  expect(localStorage.getItem("program:day:v1:A")).toBe("A2");
  act(() => authEvent("SIGNED_IN", "A"));
  view.rerender(app("A"));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "День для упражнений" })).toHaveTextContent("A2"),
  );
});

it("B05 shows an empty state and preserves archive exercise management", async () => {
  fake.state.rows.program_days = [day("Архив", 0, "2026-10-01")];
  fake.state.rows.program_exercises = [exercise("Старый жим", "Архив")];
  mount();
  expect(
    await screen.findByText(/Нет активных дней. Создайте или восстановите/),
  ).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "День для упражнений" })).toBeDisabled();
  await openDayManagement();
  fireEvent.click(screen.getByText("Архив дней"));
  fireEvent.click(screen.getByText("Упражнения архивного дня"));
  fireEvent.click(screen.getByRole("button", { name: "Редактировать: Старый жим" }));
  const editor = await screen.findByRole("dialog", { name: "Редактирование упражнения" });
  expect(within(editor).getByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent(
    "Архив",
  );
  expect(fake.state.calls.every((call) => call.operation === "select")).toBe(true);
});

it("keeps the exercise archive open across days and restores each day's own archive", async () => {
  fake.state.rows.program_days!.push(day("Ноги", 1));
  fake.state.rows.program_exercises = [
    { ...exercise("Архивный жим", "Первый"), archived_at: "2026-10-01" },
    { ...exercise("Архивный присед", "Ноги"), archived_at: "2026-10-02" },
  ];
  mount();

  const archiveToggle = await screen.findByRole("button", { name: "Архив упражнений" });
  fireEvent.click(archiveToggle);
  expect(archiveToggle).toHaveAttribute("aria-expanded", "true");
  expect(await screen.findByRole("button", { name: "Редактировать: Архивный жим" })).toBeVisible();

  await chooseProgramDay("Ноги");
  expect(screen.getByRole("button", { name: "Архив упражнений" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    await screen.findByRole("button", { name: "Редактировать: Архивный присед" }),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Редактировать: Архивный жим" })).toBeNull();

  await chooseProgramDay("Первый");
  expect(await screen.findByRole("button", { name: "Редактировать: Архивный жим" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Редактировать: Архивный присед" })).toBeNull();
});

it("keeps the archive toggle open and shows an empty state for a day without archived exercises", async () => {
  fake.state.rows.program_days!.push(day("Ноги", 1));
  fake.state.rows.program_exercises = [
    { ...exercise("Архивный жим", "Первый"), archived_at: "2026-10-01" },
  ];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Архив упражнений" }));
  await screen.findByRole("button", { name: "Редактировать: Архивный жим" });

  await chooseProgramDay("Ноги");
  expect(screen.getByRole("button", { name: "Архив упражнений" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(await screen.findByText("Архивированных упражнений нет")).toBeVisible();
});

it("keeps an explicitly closed archive closed when changing days", async () => {
  fake.state.rows.program_days!.push(day("Ноги", 1));
  fake.state.rows.program_exercises = [
    { ...exercise("Архивный жим", "Первый"), archived_at: "2026-10-01" },
  ];
  mount();
  const archiveToggle = await screen.findByRole("button", { name: "Архив упражнений" });
  fireEvent.click(archiveToggle);
  expect(archiveToggle).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(archiveToggle);
  expect(archiveToggle).toHaveAttribute("aria-expanded", "false");

  await chooseProgramDay("Ноги");
  expect(screen.getByRole("button", { name: "Архив упражнений" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.queryByText("Архивированных упражнений нет")).toBeNull();
});

it("updates the open archive after restoring and archiving an exercise", async () => {
  fake.state.rows.program_exercises = [
    { ...exercise("Архивный жим", "Первый"), archived_at: "2026-10-01" },
  ];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Архив упражнений" }));
  const restore = await screen.findByRole("button", { name: "Восстановить: Архивный жим" });
  fireEvent.click(restore);
  expect(await screen.findByText("Архивированных упражнений нет")).toBeVisible();
  const archive = await screen.findByRole("button", { name: "В архив: Архивный жим" });
  fireEvent.click(archive);
  expect(await screen.findByRole("button", { name: "Восстановить: Архивный жим" })).toBeVisible();
});

it("isolates archive visibility and exercises when switching accounts", async () => {
  fake.state.rows.program_days = [day("День A"), { ...day("День B"), user_id: "B" }];
  fake.state.rows.program_exercises = [
    { ...exercise("Архив A", "День A"), archived_at: "2026-10-01" },
    { ...exercise("Архив B", "День B"), user_id: "B", archived_at: "2026-10-01" },
  ];
  const app = (userId: string) => (
    <QueryClientProvider client={qc}>
      <SessionProvider onIdentityChange={vi.fn()}>
        <AccountBoundary verifiedUserId={userId}>
          <ProgramManager />
        </AccountBoundary>
      </SessionProvider>
    </QueryClientProvider>
  );
  const view = render(app("A"));
  act(() => authEvent("SIGNED_IN", "A"));
  fireEvent.click(await screen.findByRole("button", { name: "Архив упражнений" }));
  expect(await screen.findByRole("button", { name: "Редактировать: Архив A" })).toBeVisible();

  act(() => authEvent("SIGNED_IN", "B"));
  view.rerender(app("B"));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "День для упражнений" })).toHaveTextContent(
      "День B",
    ),
  );
  expect(screen.getByRole("button", { name: "Архив упражнений" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(screen.queryByRole("button", { name: "Редактировать: Архив A" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Архив упражнений" }));
  expect(await screen.findByRole("button", { name: "Редактировать: Архив B" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Редактировать: Архив A" })).toBeNull();
});

it("renders exercise editing in a compact centered dialog with a fixed save action", async () => {
  fake.state.rows.program_exercises = [exercise("Жим", "Первый")];
  mount();
  const trigger = await screen.findByRole("button", { name: "Редактировать: Жим" });
  fireEvent.click(trigger);

  const dialog = await screen.findByRole("dialog", { name: "Редактирование упражнения" });
  expect(dialog).toHaveClass("max-h-[90dvh]", "max-w-[480px]");
  expect(dialog).toHaveStyle({ width: "min(480px, calc(100vw - 2rem))" });
  expect(dialog.querySelector(".overflow-y-auto")).not.toBeNull();
  expect(within(dialog).getByLabelText("Название упражнения")).toHaveValue("Жим");
  expect(within(dialog).getByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent(
    "Первый",
  );
  expect(within(dialog).getByLabelText("Подходы")).toHaveValue("3");
  expect(within(dialog).getByLabelText("Повторения")).toHaveValue("8-12");
  expect(within(dialog).getByRole("button", { name: "Сохранить" })).toHaveClass("w-full");

  fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Редактирование упражнения" })).toBeNull(),
  );
  expect(trigger).toHaveFocus();
});

it("B06 displays validation and network errors inside the editor, preserving input", async () => {
  fake.state.rows.program_exercises = [exercise("Жим", "Первый")];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Редактировать: Жим" }));
  const dialog = await screen.findByRole("dialog", { name: "Редактирование упражнения" });
  fireEvent.change(within(dialog).getByLabelText("Повторения"), { target: { value: "8-1" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Повторения:");
  expect(within(dialog).getByLabelText("Повторения")).toHaveAccessibleDescription(/Повторения:/);
  expect(within(dialog).getByLabelText("Повторения")).toHaveValue("8-1");
  fireEvent.change(within(dialog).getByLabelText("Повторения"), { target: { value: "8-12" } });
  fake.state.nextError = "Network failed";
  fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Не удалось сохранить изменения",
  );
  expect(within(dialog).getByLabelText("Повторения")).toHaveValue("8-12");
  fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
  await openDayManagement();
  expect(
    within(screen.getByRole("dialog", { name: "Тренировочные дни" })).queryByRole("alert"),
  ).not.toBeInTheDocument();
});

it("B13 disables both sortable handles during another mutation, then allows reorder", async () => {
  fake.state.rows.program_days!.push(day("Второй", 1));
  fake.state.rows.program_exercises = [exercise("Жим", "Первый")];
  mount();
  await openDayManagement();
  let finish!: () => void;
  fake.state.delayMutation = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const group = screen.getByRole("group", { name: "День: Первый" });
  fireEvent.click(within(group).getByRole("button", { name: "Переименовать день: Первый" }));
  fireEvent.change(within(group).getByLabelText("Название дня"), {
    target: { value: "Новое имя" },
  });
  fireEvent.click(within(group).getByRole("button", { name: "Сохранить" }));
  await waitFor(() =>
    expect(fake.state.calls.some((call) => call.operation === "update")).toBe(true),
  );
  const handle = screen.getByRole("button", { name: "Переместить день Первый" });
  expect(handle).toBeDisabled();
  fireEvent.keyDown(handle, { key: "Space", code: "Space" });
  expect(handle).not.toHaveAttribute("aria-pressed", "true");
  expect(fake.state.rpc).not.toHaveBeenCalled();
  await act(async () => {
    finish();
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Переместить день Новое имя" })).toBeEnabled(),
  );
});

it("deletes only an archived day and preserves linked exercises and historical snapshots", async () => {
  fake.state.rows.program_days = [day("Активный"), day("Архив", 1, "2026-10-01")];
  fake.state.rows.program_exercises = [exercise("Жим", "Архив")];
  fake.state.rows.workout_entries = [
    {
      id: "record-1",
      user_id: "A",
      exercise_id: "Жим",
      day_id: "Архив",
      day_name: "Архив",
      performed_on: "2026-10-01",
      weight: 50,
      reps: [8, 8, 7],
    },
  ];
  localStorage.setItem("app:archive-settings:v1:A", "1");
  mount();
  await openDayManagement();
  fireEvent.click(screen.getByText("Архив дней"));
  const archive = await screen.findByRole("group", { name: "День: Архив" });
  fireEvent.click(within(archive).getByRole("button", { name: "Удалить день: Архив" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Связанных упражнений: 1")).toBeInTheDocument();
  expect(await within(dialog).findByText("Исторических записей: 1")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
  expect(fake.state.rows.program_days).toHaveLength(2);
  fireEvent.click(within(archive).getByRole("button", { name: "Удалить день: Архив" }));
  const reopened = await screen.findByRole("alertdialog");
  await waitFor(() =>
    expect(within(reopened).getByRole("button", { name: "Удалить день" })).toBeEnabled(),
  );
  fireEvent.click(within(reopened).getByRole("button", { name: "Удалить день" }));
  await waitFor(() => expect(fake.state.rows.program_days).toHaveLength(1));
  expect(fake.state.rows.program_exercises![0]?.day_id).toBeNull();
  expect(fake.state.rows.workout_entries![0]).toMatchObject({
    exercise_id: "Жим",
    day_id: null,
    day_name: "Архив",
    weight: 50,
    reps: [8, 8, 7],
  });
});

it("deletes an archived exercise and only its own history after confirmation", async () => {
  fake.state.rows.program_exercises = [
    { ...exercise("Старый жим", "Первый"), archived_at: "2026-10-01" },
    exercise("Другой жим", "Первый"),
  ];
  fake.state.rows.workout_entries = [
    { id: "old", user_id: "A", exercise_id: "Старый жим", day_id: "Первый" },
    { id: "other", user_id: "A", exercise_id: "Другой жим", day_id: "Первый" },
  ];
  localStorage.setItem("app:archive-settings:v1:A", "1");
  localStorage.setItem("workout:draft:v1:A:Старый жим", "old draft");
  localStorage.setItem("workout:draft:v1:A:Другой жим", "other draft");
  mount();
  qc.setQueryData(
    [...userKeys.entries("A", "Старый жим"), "0001-01-01", "9999-12-31"],
    [{ id: "old" }],
  );
  qc.setQueryData(
    [...userKeys.entries("A", "Другой жим"), "0001-01-01", "9999-12-31"],
    [{ id: "other" }],
  );
  fireEvent.click(await screen.findByText("Архив упражнений"));
  fireEvent.click(screen.getByRole("button", { name: "Удалить упражнение: Старый жим" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(await within(dialog).findByText("Исторических записей: 1")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Удалить навсегда" }));
  await waitFor(() => expect(fake.state.rows.program_exercises).toHaveLength(1));
  expect(fake.state.rows.workout_entries!.map((entry) => entry.id)).toEqual(["other"]);
  expect(localStorage.getItem("workout:draft:v1:A:Старый жим")).toBeNull();
  expect(localStorage.getItem("workout:draft:v1:A:Другой жим")).toBe("other draft");
  expect(qc.getQueriesData({ queryKey: userKeys.entries("A", "Старый жим") })).toHaveLength(0);
  expect(qc.getQueriesData({ queryKey: userKeys.entries("A", "Другой жим") })).toHaveLength(1);
});

it("keeps archived exercise and confirmation open when deletion fails", async () => {
  fake.state.rows.program_exercises = [
    { ...exercise("Старый жим", "Первый"), archived_at: "2026-10-01" },
  ];
  fake.state.rows.workout_entries = [
    { id: "old", user_id: "A", exercise_id: "Старый жим", day_id: "Первый" },
  ];
  localStorage.setItem("app:archive-settings:v1:A", "1");
  mount();
  fireEvent.click(await screen.findByText("Архив упражнений"));
  fireEvent.click(screen.getByRole("button", { name: "Удалить упражнение: Старый жим" }));
  const dialog = await screen.findByRole("alertdialog");
  await within(dialog).findByText("Исторических записей: 1");
  fake.state.nextError = "Network unavailable";
  fireEvent.click(within(dialog).getByRole("button", { name: "Удалить навсегда" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Результат удаления пока не подтверждён",
  );
  expect(fake.state.rows.program_exercises).toHaveLength(1);
  expect(fake.state.rows.workout_entries).toHaveLength(1);
});

it("reconciles a committed exercise deletion after a lost RPC reply and clears only its draft", async () => {
  fake.state.rows.program_exercises = [
    { ...exercise("Old lift", "Первый"), archived_at: "2026-10-01" },
    exercise("Keep lift", "Первый"),
  ];
  fake.state.rows.workout_entries = [
    { id: "old-entry", user_id: "A", exercise_id: "Old lift" },
    { id: "keep-entry", user_id: "A", exercise_id: "Keep lift" },
  ];
  localStorage.setItem("app:archive-settings:v1:A", "1");
  localStorage.setItem("workout:draft:v1:A:Old lift", "old draft");
  localStorage.setItem("workout:draft:v1:A:Keep lift", "keep draft");
  mount();
  fireEvent.click(await screen.findByText("Архив упражнений"));
  fireEvent.click(screen.getByRole("button", { name: "Удалить упражнение: Old lift" }));
  const dialog = await screen.findByRole("alertdialog");
  await within(dialog).findByText("Исторических записей: 1");
  const original = fake.state.rpc.getMockImplementation()!;
  fake.state.rpc.mockImplementationOnce(async (name, args) => {
    const response = await original(name, args);
    return name === "delete_archived_program_exercise"
      ? { data: null, error: { code: "503", message: "gateway timeout" } }
      : response;
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Удалить навсегда" }));
  await waitFor(() => expect(fake.state.rows.program_exercises).toHaveLength(1));
  await waitFor(() => expect(localStorage.getItem("workout:draft:v1:A:Old lift")).toBeNull());
  expect(localStorage.getItem("workout:draft:v1:A:Keep lift")).toBe("keep draft");
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("reconciles a lost day-delete reply without clearing exercise history", async () => {
  fake.state.rows.program_days = [day("Active"), day("Archived", 1, "2026-10-01")];
  fake.state.rows.program_exercises = [exercise("Keep lift", "Archived")];
  fake.state.rows.workout_entries = [
    {
      id: "historic",
      user_id: "A",
      exercise_id: "Keep lift",
      day_id: "Archived",
      day_name: "Archived",
    },
  ];
  localStorage.setItem("app:archive-settings:v1:A", "1");
  mount();
  await openDayManagement();
  fireEvent.click(screen.getByText("Архив дней"));
  fireEvent.click(screen.getByRole("button", { name: "Удалить день: Archived" }));
  const dialog = await screen.findByRole("alertdialog");
  await within(dialog).findByText("Исторических записей: 1");
  const original = fake.state.rpc.getMockImplementation()!;
  fake.state.rpc.mockImplementationOnce(async (name, args) => {
    const response = await original(name, args);
    return name === "delete_archived_program_day"
      ? { data: null, error: { code: "503", message: "gateway timeout" } }
      : response;
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Удалить день" }));
  await waitFor(() => expect(fake.state.rows.program_days).toHaveLength(1));
  expect(fake.state.rows.program_exercises[0]?.day_id).toBeNull();
  expect(fake.state.rows.workout_entries[0]).toMatchObject({
    id: "historic",
    exercise_id: "Keep lift",
    day_id: null,
    day_name: "Archived",
  });
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("preserves the draft on a confirmed deletion rejection", async () => {
  fake.state.rows.program_exercises = [
    { ...exercise("Old lift", "Первый"), archived_at: "2026-10-01" },
  ];
  localStorage.setItem("app:archive-settings:v1:A", "1");
  localStorage.setItem("workout:draft:v1:A:Old lift", "draft");
  mount();
  fireEvent.click(await screen.findByText("Архив упражнений"));
  fireEvent.click(screen.getByRole("button", { name: "Удалить упражнение: Old lift" }));
  const dialog = await screen.findByRole("alertdialog");
  await within(dialog).findByText("Исторических записей: 0");
  fake.state.rpc.mockImplementationOnce(async () => ({
    data: null,
    error: { code: "22023", message: "Only archived objects may be deleted" },
  }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Удалить навсегда" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Сервер отклонил удаление");
  expect(localStorage.getItem("workout:draft:v1:A:Old lift")).toBe("draft");
  expect(fake.state.rows.program_exercises).toHaveLength(1);
});

it("keeps draft and pending marker when the outcome cannot be reconciled", async () => {
  fake.state.rows.program_exercises = [
    { ...exercise("Old lift", "Первый"), archived_at: "2026-10-01" },
  ];
  localStorage.setItem("app:archive-settings:v1:A", "1");
  localStorage.setItem("workout:draft:v1:A:Old lift", "draft");
  mount();
  fireEvent.click(await screen.findByText("Архив упражнений"));
  fireEvent.click(screen.getByRole("button", { name: "Удалить упражнение: Old lift" }));
  const dialog = await screen.findByRole("alertdialog");
  await within(dialog).findByText("Исторических записей: 0");
  fake.state.rpc.mockImplementationOnce(async () => {
    fake.state.readErrors["program_exercises"] = "read timeout";
    return { data: null, error: { code: "503", message: "gateway timeout" } };
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Удалить навсегда" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("не подтверждён");
  expect(localStorage.getItem("workout:draft:v1:A:Old lift")).toBe("draft");
  expect(localStorage.getItem("archive-delete:pending:v1:A")).toContain('"Old lift"');
});

it("finishes pending cleanup after reload when a previously owned exercise is absent", async () => {
  fake.state.rows.program_exercises = [exercise("Keep lift", "Первый")];
  localStorage.setItem("workout:draft:v1:A:Old lift", "draft");
  localStorage.setItem(
    "archive-delete:pending:v1:A",
    JSON.stringify([{ kind: "exercise", id: "Old lift" }]),
  );
  mount();
  await waitFor(() => expect(localStorage.getItem("workout:draft:v1:A:Old lift")).toBeNull());
  expect(localStorage.getItem("archive-delete:pending:v1:A")).toBeNull();
  expect(fake.state.rows.program_exercises).toHaveLength(1);
});

it("fails closed when the server capability RPC is missing", async () => {
  fake.state.deletionCapability = false;
  fake.state.rows.program_days = [day("Активный"), day("Архив", 1, "2026-10-01")];
  fake.state.rows.program_exercises = [
    { ...exercise("Old lift", "Архив"), archived_at: "2026-10-01" },
  ];
  localStorage.setItem("app:archive-settings:v1:A", "1");
  mount();
  expect(await screen.findByText("Удаление пока недоступно на сервере.")).toBeVisible();
  await openDayManagement();
  fireEvent.click(screen.getByText("Архив дней"));
  expect(screen.queryByRole("button", { name: "Удалить день: Архив" })).toBeNull();
  fireEvent.click(screen.getByText("Готово"));
  fireEvent.click(screen.getByText("Архив упражнений"));
  expect(screen.queryByRole("button", { name: "Удалить упражнение: Old lift" })).toBeNull();
  expect(
    fake.state.rpc.mock.calls.some(([name]) => name.startsWith("delete_archived_program_")),
  ).toBe(false);
});

it("reconciles a late delete after switching A to B and back to A", async () => {
  fake.state.rows.program_days = [day("День A"), { ...day("День B"), user_id: "B" }];
  fake.state.rows.program_exercises = [
    { ...exercise("Old lift", "День A"), archived_at: "2026-10-01" },
    { ...exercise("B lift", "День B"), user_id: "B" },
  ];
  localStorage.setItem("app:archive-settings:v1:A", "1");
  localStorage.setItem("workout:draft:v1:A:Old lift", "draft A");
  const app = (userId: string) => (
    <QueryClientProvider client={qc}>
      <SessionProvider onIdentityChange={vi.fn()}>
        <AccountBoundary verifiedUserId={userId}>
          <ProgramManager />
        </AccountBoundary>
      </SessionProvider>
    </QueryClientProvider>
  );
  const view = render(app("A"));
  act(() => authEvent("SIGNED_IN", "A"));
  fireEvent.click(await screen.findByText("Архив упражнений"));
  fireEvent.click(screen.getByRole("button", { name: "Удалить упражнение: Old lift" }));
  const dialog = await screen.findByRole("alertdialog");
  await within(dialog).findByText("Исторических записей: 0");
  const original = fake.state.rpc.getMockImplementation()!;
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => (finish = resolve));
  fake.state.rpc.mockImplementation(async (name, args) => {
    if (name === "delete_archived_program_exercise") {
      await gate;
      const currentUser = fake.state.userId;
      fake.state.userId = "A";
      const result = await original(name, args);
      fake.state.userId = currentUser;
      return result;
    }
    return original(name, args);
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Удалить навсегда" }));
  await waitFor(() =>
    expect(
      fake.state.rpc.mock.calls.some(([name]) => name === "delete_archived_program_exercise"),
    ).toBe(true),
  );
  act(() => authEvent("SIGNED_IN", "B"));
  view.rerender(app("B"));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "День для упражнений" })).toHaveTextContent(
      "День B",
    ),
  );
  await act(async () => {
    finish();
  });
  act(() => authEvent("SIGNED_IN", "A"));
  view.rerender(app("A"));
  await waitFor(() => expect(localStorage.getItem("workout:draft:v1:A:Old lift")).toBeNull());
  expect(localStorage.getItem("workout:draft:v1:A:Old lift")).toBeNull();
  expect(screen.queryByText("B lift")).toBeNull();
});

it("preserves a stale day rename input and only uses a new revision after cancel/reopen", async () => {
  mount();
  await openDayManagement();
  fireEvent.click(await screen.findByRole("button", { name: "Переименовать день: Первый" }));
  fireEvent.change(screen.getByLabelText("Название дня"), { target: { value: "My pending name" } });
  const row = fake.state.rows.program_days[0]!;
  row["name"] = "Other window";
  row["revision"] = 1;
  await act(async () => {
    await qc.invalidateQueries({ queryKey: userKeys.days("A") });
  });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await screen.findByText(/Программа изменена в другом окне/);
  expect(screen.getByLabelText("Название дня")).toHaveValue("My pending name");
  expect(row["name"]).toBe("Other window");
  fireEvent.click(screen.getByRole("button", { name: "Отменить переименование" }));
  fireEvent.click(screen.getByRole("button", { name: "Переименовать день: Other window" }));
  expect(screen.getByLabelText("Название дня")).toHaveValue("Other window");
  fireEvent.change(screen.getByLabelText("Название дня"), { target: { value: "Reviewed name" } });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(row["name"]).toBe("Reviewed name"));
  expect(row["revision"]).toBe(2);
});

it("does not reset exercise input or rebase its revision when another window moves it", async () => {
  fake.state.rows.program_days.push(day("Second", 1));
  fake.state.rows.program_exercises = [exercise("Exercise", "Первый")];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Редактировать: Exercise" }));
  fireEvent.change(screen.getByLabelText("Название упражнения", { exact: true }), {
    target: { value: "My draft" },
  });
  const row = fake.state.rows.program_exercises[0]!;
  row["day_id"] = "Second";
  row["revision"] = 1;
  await act(async () => {
    await qc.invalidateQueries({ queryKey: userKeys.program("A") });
  });
  expect(screen.getByLabelText("Название упражнения", { exact: true })).toHaveValue("My draft");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await screen.findByText(/Программа изменена в другом окне/);
  expect(screen.getByLabelText("Название упражнения", { exact: true })).toHaveValue("My draft");
  expect(row["day_id"]).toBe("Second");
  expect(row["name"]).toBe("Exercise");
});

it("keeps a day rename draft by ID when a refetch moves it into the archive", async () => {
  fake.state.rows.program_days.push(day("Second", 1));
  mount();
  await openDayManagement();
  fireEvent.click(await screen.findByRole("button", { name: "Переименовать день: Первый" }));
  fireEvent.change(screen.getByLabelText("Название дня"), { target: { value: "Preserved draft" } });
  const row = fake.state.rows.program_days[0]!;
  row["archived_at"] = "2026-11-05T00:00:00Z";
  row["revision"] = 1;
  await act(async () => {
    await qc.invalidateQueries({ queryKey: userKeys.days("A") });
  });
  expect(screen.getByLabelText("Название дня")).toHaveValue("Preserved draft");
  expect(row["name"]).toBe("Первый");
});
