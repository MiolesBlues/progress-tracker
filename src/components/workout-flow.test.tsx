import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { authEvent, fake, resetFake, type Row } from "@/test/supabase-mock";
import { AccountBoundary, SessionProvider } from "@/lib/session";
import { WorkoutPage } from "@/components/workout-page";
import { ProgramManager } from "@/components/program-manager";
import { ProgressPage } from "@/components/progress-page";
import { draftKey, readDraft } from "@/lib/workout-draft";

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const EX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  EX2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DAY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const exercise = (id: string, user_id = A): Row => ({
  id,
  user_id,
  day_id: DAY,
  name: id === EX ? "Жим" : "Тяга",
  position: id === EX ? 0 : 1,
  target_sets: 4,
  target_reps: "6-8",
  working_weight: 30,
  example_reps: [8, 8, 7, 6],
  archived_at: null,
});
const last = (exercise_id = EX, weight = 50, user_id = A): Row => ({
  id: randomUUID(),
  user_id,
  exercise_id,
  performed_on: "2026-10-12",
  weight,
  reps: [8, 8, 7, 6],
  rir: 1,
});
let qc: QueryClient;
const changed = () => {};
function tree(children: ReactNode, userId = A) {
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider onIdentityChange={changed}>
        <AccountBoundary verifiedUserId={userId}>{children}</AccountBoundary>
      </SessionProvider>
    </QueryClientProvider>
  );
}
function mount(children: ReactNode = <WorkoutPage />, userId = A) {
  const view = render(tree(children, userId));
  act(() => authEvent("SIGNED_IN", userId));
  return view;
}
async function ready() {
  await screen.findByText(/Прошлый раз/);
}
const save = () => fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
beforeEach(() => {
  resetFake();
  localStorage.clear();
  vi.stubGlobal("crypto", { randomUUID });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  fake.state.rows.program_days = [
    { id: DAY, user_id: A, name: "Силовой", position: 0, archived_at: null },
  ];
  fake.state.rows.program_exercises = [exercise(EX), exercise(EX2)];
  fake.state.rows.workout_entries = [last(), last(EX2, 60)];
});
afterEach(() => {
  cleanup();
  qc.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("rejects empty weight without sending or losing input", async () => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Рабочий вес, кг"), { target: { value: "" } });
  save();
  expect(await screen.findByText(/Пустое значение не равно нулю/)).toBeInTheDocument();
  expect(fake.state.saveRpc).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("");
});
it.each([
  ["0", 0],
  ["52,5", 52.5],
] as const)("saves explicit weight %s and all four sets exactly", async (value, weight) => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Рабочий вес, кг"), { target: { value } });
  save();
  await screen.findByText("Сохранено");
  expect(fake.state.saveRpc).toHaveBeenCalledWith(
    expect.objectContaining({ _weight: weight, _reps: [8, 8, 7, 6] }),
  );
  expect(fake.state.saveRpc.mock.calls[0]?.[0]).not.toHaveProperty("_day_name");
  expect(localStorage.getItem(draftKey(A, EX))).toBeNull();
});
it.each(["", "8-8-7-6"])(
  "keeps invalid approach %j visible instead of dropping/concatenating it",
  async (value) => {
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Подход 2"), { target: { value } });
    save();
    await screen.findByRole("alert");
    expect(fake.state.saveRpc).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText(/^Подход \d+$/)).toHaveLength(4);
    expect(screen.getByLabelText("Подход 2")).toHaveValue(value);
    if (value) expect(screen.getByRole("alert")).toHaveTextContent("четыре отдельных поля");
  },
);
it("late last-entry only fills untouched fields, and subsequent refetch cannot overwrite the draft", async () => {
  let resolve!: (response: { data: Row; error: null }) => void;
  fake.state.delaySelect = {
    table: "workout_entries",
    filters: { exercise_id: EX },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  mount();
  await screen.findByLabelText("Рабочий вес, кг");
  fireEvent.change(screen.getByLabelText("Рабочий вес, кг"), { target: { value: "72,5" } });
  fireEvent.change(screen.getByLabelText("Подход 1"), { target: { value: "11" } });
  fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Не потерять" } });
  fireEvent.change(screen.getByLabelText("RIR (необязательно)"), { target: { value: "2,5" } });
  fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-10" } });
  await act(async () => {
    resolve({ data: last(), error: null });
  });
  await screen.findByText("Предыдущих записей пока нет.");
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("72,5");
  expect(screen.getByLabelText("Подход 1")).toHaveValue("11");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Не потерять");
  expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("2,5");
  expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-10");
  act(() => qc.setQueryData(["user", A, "last-entry", EX, "2026-10-10"], last(EX, 90)));
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("72,5");
});
it("a reply for previously selected exercise cannot change the current exercise", async () => {
  let resolve!: (response: { data: Row; error: null }) => void;
  fake.state.delaySelect = {
    table: "workout_entries",
    filters: { exercise_id: EX },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  mount();
  await screen.findByLabelText("Упражнение");
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX2 } });
  await ready();
  fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Второе упражнение" } });
  await act(async () => {
    resolve({ data: last(EX, 99), error: null });
  });
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("60");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Второе упражнение");
});
it("double click submits once, including a second submit event before acknowledgement", async () => {
  let resolve!: (response: { data: string; error: null }) => void;
  fake.state.saveRpc.mockImplementation(
    (args) =>
      new Promise((done) => {
        expect(readDraft(A, EX)?.operation?.id).toBe(args["_id"]);
        resolve = done;
      }),
  );
  mount();
  await ready();
  save();
  fireEvent.submit(screen.getByRole("form", { name: "Запись тренировки" }));
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledTimes(1));
  const id = String(fake.state.saveRpc.mock.calls[0]![0]["_id"]);
  await act(async () => {
    resolve({ data: id, error: null });
  });
  await screen.findByText("Сохранено");
  fireEvent.submit(screen.getByRole("form", { name: "Запись тренировки" }));
  expect(fake.state.saveRpc).toHaveBeenCalledTimes(1);
});
it("a timeout after INSERT and reopening the app retry the same UUID and immutable payload", async () => {
  const server = new Map<string, unknown>();
  let attempt = 0;
  fake.state.saveRpc.mockImplementation(async (args) => {
    const id = String(args["_id"]);
    server.set(id, args);
    return ++attempt === 1
      ? { data: null, error: { code: "", message: "timeout" } }
      : { data: id, error: null };
  });
  const view = mount();
  await ready();
  save();
  await screen.findByText(/Результат сохранения не подтверждён/);
  const initial = fake.state.saveRpc.mock.calls[0]![0];
  expect(readDraft(A, EX)?.operation?.id).toBe(initial["_id"]);
  expect(screen.getByLabelText("Рабочий вес, кг")).toBeDisabled();
  view.unmount();
  mount();
  await screen.findByRole("button", { name: "Повторить сохранение" });
  fireEvent.click(screen.getByRole("button", { name: "Повторить сохранение" }));
  await screen.findByText("Сохранено");
  expect(fake.state.saveRpc.mock.calls[1]![0]).toEqual(initial);
  expect(server.size).toBe(1);
  expect(localStorage.getItem(draftKey(A, EX))).toBeNull();
});
it("a definite INSERT failure retains editable input and retries with the same UUID", async () => {
  fake.state.saveRpc.mockResolvedValueOnce({
    data: null,
    error: { code: "23514", message: "check" },
  });
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Сохранить меня" } });
  save();
  await screen.findByText(/Запись отклонена/);
  expect(screen.getByLabelText("Заметки")).toHaveValue("Сохранить меня");
  expect(screen.getByLabelText("Рабочий вес, кг")).toBeEnabled();
  const id = fake.state.saveRpc.mock.calls[0]![0]["_id"];
  save();
  await screen.findByText("Сохранено");
  expect(fake.state.saveRpc.mock.calls[1]![0]["_id"]).toBe(id);
});
it("an intentional second entry on the same date gets a new UUID", async () => {
  mount();
  await ready();
  save();
  await screen.findByText("Сохранено");
  fireEvent.click(screen.getByRole("button", { name: "Ещё одна запись" }));
  save();
  await screen.findByText("Сохранено");
  const [first, second] = fake.state.saveRpc.mock.calls;
  expect(first![0]["_id"]).not.toBe(second![0]["_id"]);
  expect(first![0]["_performed_on"]).toBe(second![0]["_performed_on"]);
});
it("restores the selected exercise and its raw draft after reopening", async () => {
  const view = mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX2 } });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("60"));
  fireEvent.change(screen.getByLabelText("Рабочий вес, кг"), { target: { value: "67,5" } });
  fireEvent.change(screen.getByLabelText("Подход 2"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Сырой черновик" } });
  view.unmount();
  mount();
  await ready();
  expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2);
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("67,5");
  expect(screen.getByLabelText("Подход 2")).toHaveValue("");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Сырой черновик");
});
it("success for previous exercise clears only that draft and leaves the new form intact", async () => {
  let resolve!: (response: { data: string; error: null }) => void;
  fake.state.saveRpc.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  await ready();
  save();
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledTimes(1));
  const id = String(fake.state.saveRpc.mock.calls[0]![0]["_id"]);
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX2 } });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("60"));
  fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Другой черновик" } });
  await act(async () => {
    resolve({ data: id, error: null });
  });
  expect(localStorage.getItem(draftKey(A, EX))).toBeNull();
  expect(readDraft(A, EX2)?.fields.notes).toBe("Другой черновик");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Другой черновик");
  expect(screen.queryByText("Сохранено")).not.toBeInTheDocument();
});
it("account A → B → A never exposes A's draft to B and restores A's own draft", async () => {
  const view = mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Секрет A" } });
  fake.state.rows.program_days.push({
    id: DAY,
    user_id: B,
    name: "День B",
    position: 0,
    archived_at: null,
  });
  fake.state.rows.program_exercises.push(exercise(EX2, B));
  fake.state.rows.workout_entries.push(last(EX2, 80, B));
  act(() => authEvent("SIGNED_IN", B));
  view.rerender(tree(<WorkoutPage />, B));
  await ready();
  expect(screen.getByLabelText("Заметки")).toHaveValue("");
  expect(screen.queryByDisplayValue("Секрет A")).not.toBeInTheDocument();
  act(() => authEvent("SIGNED_IN", A));
  view.rerender(tree(<WorkoutPage />, A));
  await ready();
  expect(screen.getByLabelText("Заметки")).toHaveValue("Секрет A");
});
it("storage failure prevents network submission and preserves the visible fields", async () => {
  mount();
  await ready();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  save();
  await screen.findByText(/Запрос не отправлен/);
  expect(fake.state.saveRpc).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("50");
});
it("a corrupt existing draft is preserved and cannot silently be overwritten", async () => {
  localStorage.setItem(draftKey(A, EX), "broken-json");
  mount();
  await screen.findByText(/Не удалось прочитать черновик/);
  expect(localStorage.getItem(draftKey(A, EX))).toBe("broken-json");
  expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
});
it.each(["program_days", "program_exercises"])(
  "a failed %s load is an error, and Retry recovers",
  async (table) => {
    fake.state.readErrors[table] = "denied";
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByText(/нет активных упражнений/i)).not.toBeInTheDocument();
    delete fake.state.readErrors[table];
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await ready();
  },
);
it("failed last-entry load allows manual input and Retry preserves dirty fields", async () => {
  fake.state.readErrors["workout_entries"] = "offline";
  mount();
  await screen.findByRole("alert");
  fireEvent.change(screen.getByLabelText("Рабочий вес, кг"), { target: { value: "77" } });
  delete fake.state.readErrors["workout_entries"];
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  await ready();
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("77");
});
it("history load error is not empty history and Retry recovers", async () => {
  fake.state.rows.workout_entries = [];
  fake.state.readErrors["workout_entries"] = "offline";
  mount(<ProgressPage />);
  await screen.findByRole("alert");
  expect(screen.queryByText("Записей пока нет")).not.toBeInTheDocument();
  delete fake.state.readErrors["workout_entries"];
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  await screen.findByText("Записей пока нет");
});
it("program management distinguishes loading failure from an empty program", async () => {
  fake.state.readErrors["program_exercises"] = "offline";
  mount(<ProgramManager />);
  await screen.findByRole("alert");
  expect(screen.queryByText("Упражнений пока нет.")).not.toBeInTheDocument();
  delete fake.state.readErrors["program_exercises"];
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  await screen.findByRole("heading", { name: "Программа" });
});
it("archived exercises stay out of the new workout selector", async () => {
  fake.state.rows.program_exercises[0]!["archived_at"] = "2026-10-13";
  mount();
  await ready();
  expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2);
  expect(screen.queryByRole("option", { name: "Жим" })).not.toBeInTheDocument();
});

it("loading, empty and success states are distinct from a load error", async () => {
  let resolve!: (response: { data: Row[]; error: null }) => void;
  fake.state.delaySelect = {
    table: "program_exercises",
    filters: { user_id: A },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  mount();
  await screen.findByText("Загрузка программы…");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText(/нет активных упражнений/i)).not.toBeInTheDocument();
  await act(async () => {
    resolve({ data: [], error: null, count: 0 } as { data: Row[]; error: null });
  });
  await screen.findByText(/В этом дне нет активных упражнений/);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("a thrown transport error keeps a retryable operation and a Russian error", async () => {
  fake.state.saveRpc.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  mount();
  await ready();
  save();
  await screen.findByText(/Результат сохранения не подтверждён/);
  expect(readDraft(A, EX)?.operation).not.toBeNull();
  expect(screen.getByRole("button", { name: "Повторить сохранение" })).toBeEnabled();
});
it("an operation conflict preserves the frozen draft and asks to inspect history", async () => {
  fake.state.saveRpc.mockResolvedValueOnce({
    data: null,
    error: { code: "22023", message: "different payload" },
  });
  mount();
  await ready();
  save();
  await screen.findByText(/Эта операция уже сохранена с другими значениями/);
  expect(screen.getByLabelText("Рабочий вес, кг")).toBeDisabled();
  expect(readDraft(A, EX)?.operation?.id).toBe(fake.state.saveRpc.mock.calls[0]![0]["_id"]);
});
it("same-user token refresh preserves real workout fields and its operation UUID", async () => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Черновик при refresh" } });
  const id = readDraft(A, EX)?.id;
  act(() => authEvent("TOKEN_REFRESHED", A));
  expect(screen.getByLabelText("Заметки")).toHaveValue("Черновик при refresh");
  expect(readDraft(A, EX)?.id).toBe(id);
});
it("a late save for A does not clear B's persisted draft", async () => {
  let resolve!: (response: { data: string; error: null }) => void;
  fake.state.saveRpc.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = mount();
  await ready();
  save();
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledTimes(1));
  const id = String(fake.state.saveRpc.mock.calls[0]![0]["_id"]);
  const exB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    dayB = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  fake.state.rows.program_days.push({
    id: dayB,
    user_id: B,
    name: "День B",
    position: 0,
    archived_at: null,
  });
  fake.state.rows.program_exercises.push({ ...exercise(exB, B), day_id: dayB });
  fake.state.rows.workout_entries.push(last(exB, 80, B));
  act(() => authEvent("SIGNED_IN", B));
  view.rerender(tree(<WorkoutPage />, B));
  await ready();
  fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Черновик B" } });
  await act(async () => {
    resolve({ data: id, error: null });
  });
  expect(readDraft(B, exB)?.fields.notes).toBe("Черновик B");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Черновик B");
  expect(screen.queryByText("Сохранено")).not.toBeInTheDocument();
});
