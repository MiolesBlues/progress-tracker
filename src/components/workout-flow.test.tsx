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
import { newDraft, writeDraft, perSetDraftKey, readPerSetDraft } from "@/lib/workout-draft";
import { userKeys } from "@/lib/queries";
import { validateWorkout } from "@/lib/workout-input";
import { toast } from "sonner";

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
const EX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  EX2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DAY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const DAY2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DAY_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const exercise = (id: string, user_id = A): Row => ({
  id,
  user_id,
  day_id: DAY,
  name: id === EX ? "Жим" : "Тяга",
  position: id === EX ? 0 : 1,
  target_sets: 4,
  target_reps: "6-8",
  target_rir_min: null,
  target_rir_max: null,
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
  await screen.findByRole("form", { name: "Запись тренировки" });
}
async function chooseTrainingDay(name: RegExp | string) {
  fireEvent.click(screen.getByRole("combobox", { name: "Тренировочный день" }));
  fireEvent.click(await screen.findByRole("option", { name }));
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function fillSets(weight = "50") {
  screen.getAllByLabelText(/^Вес подхода \d+$/).forEach((_, index) => {
    change(`Вес подхода ${index + 1}`, weight);
    change(`Повторения подхода ${index + 1}`, "8");
    change(`RIR подхода ${index + 1}`, "2");
  });
}
beforeEach(() => {
  resetFake();
  vi.mocked(toast).mockClear();
  vi.mocked(toast.success).mockClear();
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

it("shows active days with exercise counts and filters exercises after selection", async () => {
  fake.state.rows.program_days.push({
    id: DAY2,
    user_id: A,
    name: "День восстановления",
    position: 1,
    archived_at: null,
  });
  fake.state.rows.program_days.push({
    id: "archived-day",
    user_id: A,
    name: "Архивный день",
    position: 2,
    archived_at: "2026-10-01",
  });
  fake.state.rows.program_exercises[1]!["day_id"] = DAY2;
  mount();
  await ready();
  expect(screen.getByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent(
    "Силовой · 1 упражнение",
  );
  fireEvent.click(screen.getByRole("combobox", { name: "Тренировочный день" }));
  expect(await screen.findByRole("option", { name: "Силовой · 1 упражнение" })).toBeVisible();
  expect(screen.getByRole("option", { name: "День восстановления · 1 упражнение" })).toBeVisible();
  expect(screen.queryByRole("option", { name: /Архивный день/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "День восстановления · 1 упражнение" }));
  await ready();
  expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2);
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(screen.getByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent(
    "День восстановления · 1 упражнение",
  );
});

it("remembers the selected day separately for users A and B", async () => {
  const dayB2 = "11111111-2222-4333-8444-555555555555";
  fake.state.rows.program_days.push({
    id: DAY2,
    user_id: A,
    name: "День A2",
    position: 1,
    archived_at: null,
  });
  fake.state.rows.program_exercises[1]!["day_id"] = DAY2;
  fake.state.rows.program_days.push(
    { id: DAY_B, user_id: B, name: "День B1", position: 0, archived_at: null },
    { id: dayB2, user_id: B, name: "День B2", position: 1, archived_at: null },
  );
  fake.state.rows.program_exercises.push(
    { ...exercise("b-ex-1", B), id: "b-ex-1", day_id: DAY_B },
    { ...exercise("b-ex-2", B), id: "b-ex-2", day_id: dayB2 },
  );
  const view = mount();
  await ready();
  await chooseTrainingDay("День A2 · 1 упражнение");
  const keyA = `workout:selection:v1:${A}`;
  const keyB = `workout:selection:v1:${B}`;
  expect(JSON.parse(localStorage.getItem(keyA) ?? "null")).toMatchObject({ dayId: DAY2 });

  act(() => authEvent("SIGNED_IN", B));
  view.rerender(tree(<WorkoutPage />, B));
  await screen.findByRole("combobox", { name: "Тренировочный день" });
  expect(screen.getByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent("День B1");
  await chooseTrainingDay("День B2 · 1 упражнение");
  expect(JSON.parse(localStorage.getItem(keyB) ?? "null")).toMatchObject({ dayId: dayB2 });

  act(() => authEvent("SIGNED_IN", A));
  view.rerender(tree(<WorkoutPage />, A));
  await ready();
  expect(screen.getByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent("День A2");
  expect(JSON.parse(localStorage.getItem(keyA) ?? "null")).toMatchObject({ dayId: DAY2 });
  expect(JSON.parse(localStorage.getItem(keyB) ?? "null")).toMatchObject({ dayId: dayB2 });
});

it("falls back to the first active day when the stored day has been archived", async () => {
  fake.state.rows.program_days.push({
    id: DAY2,
    user_id: A,
    name: "Архивирован после выбора",
    position: 1,
    archived_at: "2026-10-13",
  });
  fake.state.rows.program_exercises[1]!["day_id"] = DAY2;
  localStorage.setItem(
    `workout:selection:v1:${A}`,
    JSON.stringify({ dayId: DAY2, exerciseId: EX2 }),
  );
  mount();
  await ready();
  expect(screen.getByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent("Силовой");
  expect(JSON.parse(localStorage.getItem(`workout:selection:v1:${A}`) ?? "null")).toEqual({
    dayId: DAY,
    exerciseId: EX,
  });
  expect(screen.getByLabelText("Упражнение")).toHaveValue(EX);
});

it("shows a create-day empty state and wraps long custom names in the list", async () => {
  fake.state.rows.program_days[0]!["archived_at"] = "2026-10-13";
  mount();
  expect(await screen.findByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent(
    "Нет активных дней",
  );
  expect(screen.getByText("Добавьте или восстановите день")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Тренировочный день" })).toBeDisabled();

  cleanup();
  qc.clear();
  fake.state.rows.program_days = [
    {
      id: DAY,
      user_id: A,
      name: "Очень длинное пользовательское название силового дня для проверки переноса текста",
      position: 0,
      archived_at: null,
    },
  ];
  mount();
  await ready();
  fireEvent.click(screen.getByRole("combobox", { name: "Тренировочный день" }));
  const longName = await screen.findByRole("option", {
    name: /Очень длинное пользовательское название силового дня для проверки переноса текста/,
  });
  expect(longName).toBeVisible();
  expect(longName).toHaveClass("whitespace-normal");
});

it("preserves the native date input and its focus while changing session dates", async () => {
  mount();
  await ready();
  const input = screen.getByLabelText("Дата");
  input.focus();
  fireEvent.change(input, { target: { value: "2026-10-13" } });
  await ready();
  expect(screen.getByLabelText("Дата")).toBe(input);
  expect(input).toHaveFocus();
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
it.each([50, 0])("does not autofill new sets from historical weight %s", async (weight) => {
  fake.state.rows.workout_entries = [{ ...last(EX, weight), rir: 2 }];
  mount();
  await ready();
  await waitFor(() => expect(qc.isFetching()).toBe(0));
  for (const input of screen.getAllByLabelText(/^(Вес|Повторения|RIR) подхода \d+$/))
    expect(input).toHaveValue("");
});

it.each([2, 4])("keeps the planned %s sets without copying program results", async (count) => {
  fake.state.rows.workout_entries = [];
  fake.state.rows.program_exercises[0]!["target_sets"] = count;
  mount();
  await ready();
  expect(screen.getAllByLabelText(/^Повторения подхода \d+$/)).toHaveLength(count);
  for (const input of screen.getAllByLabelText(/^(Вес|Повторения|RIR) подхода \d+$/))
    expect(input).toHaveValue("");
});

it("rejects empty weight without sending or losing manually entered reps", async () => {
  mount();
  await ready();
  fillSets();
  change("Вес подхода 2", "");
  submit();
  await screen.findByRole("alert");
  expect(fake.state.saveRpc).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("");
  expect(screen.getByLabelText("Повторения подхода 2")).toHaveValue("8");
});

it.each(["", "8-8-7-6"])("keeps invalid per-set reps %j visible", async (value) => {
  mount();
  await ready();
  fillSets();
  change("Повторения подхода 2", value);
  submit();
  await screen.findByRole("alert");
  expect(fake.state.saveRpc).not.toHaveBeenCalled();
  expect(screen.getAllByLabelText(/^Повторения подхода \d+$/)).toHaveLength(4);
  expect(screen.getByLabelText("Повторения подхода 2")).toHaveValue(value);
});

it.each(["0", "52,5"])(
  "saves explicit weight %s with independent sets and advances to empty fields",
  async (value) => {
    mount();
    await ready();
    fillSets(value);
    submit();
    await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
    const args = fake.state.saveRpc.mock.calls[0]![0];
    expect(args["_sets"]).toMatchObject(
      Array.from({ length: 4 }, (_, index) => ({
        position: index + 1,
        weight: value.replace(",", "."),
        reps: 8,
        rir: "2",
      })),
    );
    expect(args).not.toHaveProperty("_weight");
    expect(args).not.toHaveProperty("_day_name");
    expect(readPerSetDraft(A, EX)).toBeNull();
    expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("");
    expect(screen.getByLabelText("RIR подхода 1")).toHaveValue("");
  },
);

it("double submission sends one operation and advances only after acknowledgement", async () => {
  let resolve!: (result: { data: string; error: null }) => void;
  fake.state.saveRpc.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  await ready();
  fillSets();
  submit();
  fireEvent.submit(screen.getByRole("form", { name: "Запись тренировки" }));
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("Упражнение")).toHaveValue(EX);
  const id = String(fake.state.saveRpc.mock.calls[0]![0]["_id"]);
  await act(async () => resolve({ data: id, error: null }));
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  expect(fake.state.saveRpc).toHaveBeenCalledTimes(1);
});

it("a lost acknowledgement survives remount and retries one UUID with the immutable per-set payload", async () => {
  const original = fake.state.saveRpc.getMockImplementation()!;
  fake.state.saveRpc.mockImplementationOnce(async (args) => {
    await original(args);
    throw new TypeError("timeout");
  });
  const view = mount();
  await ready();
  fillSets();
  submit();
  await screen.findByRole("button", { name: "Повторить сохранение" });
  const initial = fake.state.saveRpc.mock.calls[0]![0];
  expect(readPerSetDraft(A, EX)?.operation?.id).toBe(initial["_id"]);
  expect(screen.getByLabelText("Вес подхода 1")).toBeDisabled();
  view.unmount();
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Повторить сохранение" }));
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  expect(fake.state.saveRpc.mock.calls[1]![0]).toEqual(initial);
  expect(fake.state.rows.workout_entries.filter((row) => row.id === initial["_id"])).toHaveLength(
    1,
  );
});

it("a definite rejection preserves editable per-set input and retries with the same UUID", async () => {
  fake.state.saveRpc.mockResolvedValueOnce({
    data: null,
    error: { code: "23514", message: "check" },
  });
  mount();
  await ready();
  fillSets();
  change("Заметки", "Сохранить меня");
  submit();
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Вес подхода 1")).toBeEnabled();
  expect(screen.getByLabelText("Заметки")).toHaveValue("Сохранить меня");
  expect(readPerSetDraft(A, EX)?.operation).toBeNull();
  const id = fake.state.saveRpc.mock.calls[0]![0]["_id"];
  submit();
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledTimes(2));
  expect(fake.state.saveRpc.mock.calls[1]![0]["_id"]).toBe(id);
});

it("an intentional second entry on one date gets a new operation UUID", async () => {
  fake.state.rows.program_exercises = [exercise(EX)];
  mount();
  await ready();
  fillSets();
  submit();
  await screen.findByText(/Все упражнения этого дня пройдены/);
  await waitFor(() => expect(readPerSetDraft(A, EX)?.operation).toBeNull());
  change("Повторения подхода 4", "7");
  submit();
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledTimes(2));
  expect(fake.state.saveRpc.mock.calls[0]![0]["_id"]).not.toBe(
    fake.state.saveRpc.mock.calls[1]![0]["_id"],
  );
});

it("storage failure prevents network submission and preserves the visible per-set input", async () => {
  mount();
  await ready();
  fillSets();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("quota");
  });
  submit();
  await screen.findByText(/Запрос не отправлен/);
  expect(fake.state.saveRpc).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("50");
});

it("a corrupt V2 draft is preserved and blocks overwriting and submission", async () => {
  localStorage.setItem(perSetDraftKey(A, EX), "broken-json");
  mount();
  await screen.findByText(/Не удалось прочитать черновик подходов/);
  expect(localStorage.getItem(perSetDraftKey(A, EX))).toBe("broken-json");
  expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
});

it("failed last-entry load allows manual input and Retry preserves all dirty set values", async () => {
  fake.state.readErrors["workout_entries"] = "offline";
  mount();
  await screen.findByRole("alert");
  fillSets("77");
  delete fake.state.readErrors["workout_entries"];
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  await waitFor(() => expect(qc.isFetching()).toBe(0));
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("77");
  expect(screen.getByLabelText("Повторения подхода 4")).toHaveValue("8");
});

it("a pending payload conflict remains frozen and retryable", async () => {
  fake.state.saveRpc.mockResolvedValueOnce({
    data: null,
    error: { code: "22023", message: "conflict" },
  });
  mount();
  await ready();
  fillSets();
  submit();
  await screen.findByText(/Операция конфликтует/);
  expect(screen.getByLabelText("Вес подхода 1")).toBeDisabled();
  expect(readPerSetDraft(A, EX)?.operation?.id).toBe(fake.state.saveRpc.mock.calls[0]![0]["_id"]);
});

it("same-user token refresh preserves real V2 fields and the operation UUID", async () => {
  mount();
  await ready();
  fillSets();
  change("Заметки", "Черновик при refresh");
  const draft = readPerSetDraft(A, EX)!;
  act(() => authEvent("TOKEN_REFRESHED", A));
  expect(screen.getByLabelText("Заметки")).toHaveValue("Черновик при refresh");
  expect(readPerSetDraft(A, EX)).toEqual(draft);
});

it("a late history response and cached refetch cannot autofill untouched sets or replace manual input", async () => {
  let resolve!: (result: { data: Row; error: null }) => void;
  fake.state.delaySelect = {
    table: "workout_entries",
    filters: { exercise_id: EX },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  mount();
  await ready();
  change("Вес подхода 1", "72,5");
  change("Повторения подхода 1", "11");
  change("RIR подхода 1", "2,5");
  change("Заметки", "Не потерять");
  await act(async () => resolve({ data: last(), error: null }));
  act(() =>
    qc.setQueryData(
      [...userKeys.lastEntry(A, EX), (screen.getByLabelText("Дата") as HTMLInputElement).value],
      last(EX, 99),
    ),
  );
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("72,5");
  expect(screen.getByLabelText("Повторения подхода 1")).toHaveValue("11");
  expect(screen.getByLabelText("RIR подхода 1")).toHaveValue("2,5");
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Не потерять");
});

it("late history for the previous exercise cannot change the selected exercise's draft", async () => {
  let resolve!: (result: { data: Row; error: null }) => void;
  fake.state.delaySelect = {
    table: "workout_entries",
    filters: { exercise_id: EX },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  mount();
  await ready();
  change("Упражнение", EX2);
  await ready();
  fillSets("67,5");
  const draft = readPerSetDraft(A, EX2);
  await act(async () => resolve({ data: last(EX, 99), error: null }));
  expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2);
  expect(readPerSetDraft(A, EX2)).toEqual(draft);
});

it("a late save for the previous exercise leaves the newly selected per-set draft intact", async () => {
  let resolve!: (result: { data: string; error: null }) => void;
  fake.state.saveRpc.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  await ready();
  fillSets();
  submit();
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledOnce());
  const id = String(fake.state.saveRpc.mock.calls[0]![0]["_id"]);
  change("Упражнение", EX2);
  await ready();
  fillSets("67,5");
  const draft = readPerSetDraft(A, EX2);
  await act(async () => resolve({ data: id, error: null }));
  expect(readPerSetDraft(A, EX2)).toEqual(draft);
  expect(readPerSetDraft(A, EX)).toBeNull();
});

it("remount restores the selected exercise and its raw V2 draft with the same set IDs", async () => {
  const view = mount();
  await ready();
  change("Упражнение", EX2);
  await ready();
  change("Вес подхода 2", "67,5");
  change("RIR подхода 4", "0");
  change("Заметки", "Второй черновик");
  const draft = readPerSetDraft(A, EX2)!;
  view.unmount();
  mount();
  await ready();
  expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2);
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("67,5");
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("");
  expect(screen.getByLabelText("RIR подхода 4")).toHaveValue("0");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Второй черновик");
  expect(readPerSetDraft(A, EX2)).toEqual(draft);
});

it("returning to a saved workout restores its sets and notes, while the next new exercise stays empty", async () => {
  mount();
  await ready();
  fillSets("52,5");
  change("Повторения подхода 4", "7");
  change("Заметки", "Моя записанная заметка");
  submit();
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("");
  change("Упражнение", EX);
  await waitFor(() => expect(screen.getByLabelText("Повторения подхода 4")).toHaveValue("7"));
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("52.5");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Моя записанная заметка");
});

it("a late A save cannot clear B's persisted V2 draft", async () => {
  const exB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  fake.state.rows.program_days.push({
    id: DAY_B,
    user_id: B,
    name: "День B",
    position: 0,
    archived_at: null,
  });
  fake.state.rows.program_exercises.push({ ...exercise(exB, B), day_id: DAY_B });
  let resolve!: (result: { data: string; error: null }) => void;
  fake.state.saveRpc.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const view = mount();
  await ready();
  fillSets();
  submit();
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledOnce());
  const id = String(fake.state.saveRpc.mock.calls[0]![0]["_id"]);
  act(() => authEvent("SIGNED_IN", B));
  view.rerender(tree(<WorkoutPage />, B));
  await ready();
  fillSets("80");
  const draftB = readPerSetDraft(B, exB);
  await act(async () => resolve({ data: id, error: null }));
  expect(readPerSetDraft(B, exB)).toEqual(draftB);
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("80");
});

it.each(["program_days", "program_exercises"])(
  "a failed %s read remains an error until Retry recovers",
  async (table) => {
    fake.state.readErrors[table] = "offline";
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByText("В этом дне нет активных упражнений.")).not.toBeInTheDocument();
    delete fake.state.readErrors[table];
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    await ready();
  },
);

it("A → B → A isolates the V2 draft and ignores late A responses", async () => {
  const exB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  fake.state.rows.program_days.push({
    id: DAY_B,
    user_id: B,
    name: "День B",
    position: 0,
    archived_at: null,
  });
  fake.state.rows.program_exercises.push({ ...exercise(exB, B), day_id: DAY_B });
  let resolve!: (result: { data: Row; error: null }) => void;
  fake.state.delaySelect = {
    table: "workout_entries",
    filters: { exercise_id: EX },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  const view = mount();
  await ready();
  fillSets("61");
  change("Заметки", "A");
  const draftA = readPerSetDraft(A, EX)!;
  act(() => authEvent("SIGNED_IN", B));
  view.rerender(tree(<WorkoutPage />, B));
  await ready();
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("");
  fillSets("80");
  change("Заметки", "B");
  const draftB = readPerSetDraft(B, exB);
  await act(async () => resolve({ data: last(EX, 99), error: null }));
  expect(readPerSetDraft(B, exB)).toEqual(draftB);
  act(() => authEvent("SIGNED_IN", A));
  view.rerender(tree(<WorkoutPage />, A));
  await ready();
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("61");
  expect(readPerSetDraft(A, EX)).toEqual(draftA);
});

it.each([false, true])(
  "selecting an older session restores its V2 draft and pending=%s without losing the current draft",
  async (pending) => {
    mount();
    await ready();
    change("Дата", "2026-10-01");
    fillSets("22,5");
    change("Заметки", "Старый ввод");
    if (pending) {
      fake.state.saveRpc.mockRejectedValueOnce(new TypeError("timeout"));
      submit();
      await screen.findByRole("button", { name: "Повторить сохранение" });
    }
    const old = readPerSetDraft(A, EX)!;
    // Open another session, as a remounted page does, leaving the frozen operation intact.
    cleanup();
    localStorage.setItem(`workout:date:v1:${A}`, "2026-10-15");
    mount();
    await ready();
    fillSets("40");
    change("Заметки", "Новый ввод");
    const current = readPerSetDraft(A, EX)!;
    change("Дата", "2026-10-01");
    expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("22,5");
    expect(screen.getByLabelText("Заметки")).toHaveValue("Старый ввод");
    expect(readPerSetDraft(A, EX)?.id).toBe(old.id);
    expect(readPerSetDraft(A, EX, "2026-10-15")?.id).toBe(current.id);
    if (pending) {
      expect(screen.getByLabelText("Вес подхода 1")).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Повторить сохранение" }));
      await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledTimes(2));
      expect(fake.state.saveRpc.mock.calls[1]![0]).toEqual(fake.state.saveRpc.mock.calls[0]![0]);
    }
  },
);

it.each([false, true])(
  "preserves legacy user input while migrating or retrying a V1 draft, pending=%s",
  async (pending) => {
    const date = "2026-10-01";
    const old = newDraft(A, EX, {
      date,
      weight: "22,5",
      reps: ["5", "4"],
      rir: "3",
      notes: "Старый ввод",
    });
    old.dirty = { date: true, weight: true, reps: true, rir: true, notes: true };
    if (pending) old.operation = { id: old.id, payload: validateWorkout(old.fields, EX, DAY) };
    writeDraft(old);
    mount();
    await ready();
    change("Дата", date);
    if (pending) {
      fireEvent.click(await screen.findByRole("button", { name: "Повторить сохранение" }));
      await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledOnce());
      expect(fake.state.saveRpc.mock.calls[0]![0]).toMatchObject({
        _id: old.id,
        _weight: 22.5,
        _reps: [5, 4],
      });
    } else {
      await ready();
      expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("22,5");
      expect(screen.getByLabelText("Повторения подхода 2")).toHaveValue("4");
      expect(screen.getByLabelText("Заметки")).toHaveValue("Старый ввод");
      submit();
      await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledOnce());
      expect(fake.state.saveRpc.mock.calls[0]![0]["_sets"]).toMatchObject([
        { weight: "22.5", reps: 5 },
        { weight: "22.5", reps: 4 },
      ]);
    }
  },
);

it("a manually edited V1 draft takes precedence over saved history on the same date", async () => {
  const old = newDraft(A, EX, {
    date: "2026-10-12",
    weight: "22,5",
    reps: ["5", "4"],
    rir: "3",
    notes: "Мой черновик",
  });
  old.dirty = { date: true, weight: true, reps: true, rir: true, notes: true };
  writeDraft(old);
  localStorage.setItem(`workout:date:v1:${A}`, old.fields.date);
  mount();
  await ready();
  await waitFor(() => expect(qc.isFetching()).toBe(0));
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("22,5");
  expect(screen.getByLabelText("Повторения подхода 2")).toHaveValue("4");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Мой черновик");
});
