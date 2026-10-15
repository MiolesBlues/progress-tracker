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
import { draftKey, newDraft, readDraft, writeDraft } from "@/lib/workout-draft";
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
  await screen.findByText("План 4×6–8");
}
async function chooseTrainingDay(name: RegExp | string) {
  fireEvent.click(screen.getByRole("combobox", { name: "Тренировочный день" }));
  fireEvent.click(await screen.findByRole("option", { name }));
}
const submit = () => fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
const save = () => {
  screen.getAllByLabelText(/^Подход \d+$/).forEach((input) => {
    if ((input as HTMLInputElement).value === "")
      fireEvent.change(input, { target: { value: "8" } });
  });
  submit();
};
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
  expect(screen.getByText("Было 50 кг × 8/8/7/6")).toBeVisible();
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

it("rejects empty weight without sending or losing input", async () => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Рабочий вес, кг"), { target: { value: "" } });
  save();
  expect(await screen.findByText(/Пустое значение не равно нулю/)).toBeInTheDocument();
  expect(fake.state.saveRpc).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("");
});
it.each([50, 0])(
  "prefills weight, every rep and RIR from the last record, including weight %s",
  async (weight) => {
    fake.state.rows.workout_entries = [{ ...last(EX, weight), rir: 2 }];
    mount();
    await ready();
    expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue(String(weight));
    expect(
      screen.getAllByLabelText(/^Подход \d+$/).map((input) => (input as HTMLInputElement).value),
    ).toEqual(["8", "8", "7", "6"]);
    expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("2");
    expect(screen.getByLabelText("Заметки")).toHaveValue("");
  },
);
it("uses program weight, target sets and example reps when exercise history is absent", async () => {
  fake.state.rows.workout_entries = [];
  mount();
  await ready();
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("30");
  expect(screen.getAllByLabelText(/^Подход \d+$/)).toHaveLength(4);
  expect(
    screen.getAllByLabelText(/^Подход \d+$/).map((input) => (input as HTMLInputElement).value),
  ).toEqual(["8", "8", "7", "6"]);
  expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("");
});
it("leaves reps empty when there is no history and no example reps", async () => {
  fake.state.rows.workout_entries = [];
  fake.state.rows.program_exercises = [
    { ...exercise(EX), target_sets: 2, working_weight: null, example_reps: null },
  ];
  mount();
  await screen.findByText("Истории нет");
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("");
  expect(screen.getAllByLabelText(/^Подход \d+$/)).toHaveLength(2);
  expect(
    screen.getAllByLabelText(/^Подход \d+$/).map((input) => (input as HTMLInputElement).value),
  ).toEqual(["", ""]);
});
it("refreshes the suggested weight for the selected date and ignores future history", async () => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-10" } });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("30"));
  fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-13" } });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("50"));
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
it.each([
  ["0", 0],
  ["52,5", 52.5],
] as const)("saves explicit weight %s and all four sets exactly", async (value, weight) => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Рабочий вес, кг"), { target: { value } });
  save();
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  expect(fake.state.saveRpc).toHaveBeenCalledWith(
    expect.objectContaining({ _weight: weight, _reps: [8, 8, 7, 6] }),
  );
  expect(fake.state.saveRpc.mock.calls[0]?.[0]).not.toHaveProperty("_day_name");
  expect(localStorage.getItem(draftKey(A, EX))).toBeNull();
});
it("advances after server confirmation and prefills the next exercise history", async () => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-13" } });
  fireEvent.change(screen.getByLabelText("Рабочий вес, кг"), { target: { value: "52,5" } });
  fireEvent.change(screen.getByLabelText("Подход 1"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("RIR (необязательно)"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Первое упражнение" } });
  save();

  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  expect(screen.getByRole("option", { selected: true })).toHaveTextContent("Тяга");
  expect(await screen.findByText("План 4×6–8")).toBeVisible();
  expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-13");
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("60"));
  expect(screen.getAllByLabelText(/^Подход \d+$/)).toHaveLength(4);
  expect(
    screen.getAllByLabelText(/^Подход \d+$/).map((input) => (input as HTMLInputElement).value),
  ).toEqual(["8", "8", "7", "6"]);
  await waitFor(() => expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("1"));
  expect(screen.getByLabelText("Заметки")).toHaveValue("");
  expect(toast.success).toHaveBeenCalledWith("Ваша тренировка сохранена", {
    id: "workout-saved",
    duration: 3000,
    position: "bottom-center",
    style: { pointerEvents: "none" },
  });

  for (let index = 1; index <= 4; index++)
    fireEvent.change(screen.getByLabelText(`Подход ${index}`), { target: { value: "8" } });
  save();
  await screen.findByText(/Все упражнения этого дня пройдены/);
  expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-13");
  expect(screen.getByLabelText("Рабочий вес, кг")).toBeEnabled();
  expect(
    screen.getAllByLabelText(/^Подход \d+$/).map((input) => (input as HTMLInputElement).value),
  ).toEqual(["8", "8", "8", "8"]);
  expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("1");
  expect(screen.getByLabelText("Заметки")).toHaveValue("");
  expect(screen.queryByText("Сохранено")).not.toBeInTheDocument();
  expect(toast.success).toHaveBeenCalledTimes(2);

  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX } });
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX));
  expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
});
it("loads only the selected exercise's own recorded reps and RIR", async () => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX2 } });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("60"));
  expect(
    screen.getAllByLabelText(/^Подход \d+$/).map((input) => (input as HTMLInputElement).value),
  ).toEqual(["8", "8", "7", "6"]);
  await waitFor(() => expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("1"));
});
it("saves only the edited fourth set and shows it as the latest result when returning", async () => {
  fake.state.rows.workout_entries = [{ ...last(EX), rir: 2 }, last(EX2, 60)];
  fake.state.saveRpc.mockImplementation(async (args) => {
    const id = String(args["_id"]);
    fake.state.rows.workout_entries.push({
      id,
      user_id: A,
      exercise_id: args["_exercise_id"],
      performed_on: args["_performed_on"],
      created_at: "2026-10-14T12:00:00.000Z",
      weight: args["_weight"],
      reps: args["_reps"],
      rir: args["_rir"],
      notes: args["_notes"],
    });
    return { data: id, error: null };
  });
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Подход 4"), { target: { value: "7" } });
  save();
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  expect(fake.state.saveRpc).toHaveBeenCalledWith(
    expect.objectContaining({ _reps: [8, 8, 7, 7], _rir: 2 }),
  );
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX } });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("50"));
  expect(
    screen.getAllByLabelText(/^Подход \d+$/).map((input) => (input as HTMLInputElement).value),
  ).toEqual(["8", "8", "7", "7"]);
  expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("2");
});
it("does not let late next-exercise history overwrite a weight the user has started editing", async () => {
  fake.state.rows.program_exercises[1]!["example_reps"] = [5, 5, 5, 5];
  let resolve!: (response: { data: Row; error: null }) => void;
  fake.state.delaySelect = {
    table: "workout_entries",
    filters: { exercise_id: EX2 },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  mount();
  await ready();
  save();
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("30"));
  expect(
    screen.getAllByLabelText(/^Подход \d+$/).map((input) => (input as HTMLInputElement).value),
  ).toEqual(["5", "5", "5", "5"]);
  fireEvent.change(screen.getByLabelText("Рабочий вес, кг"), { target: { value: "72,5" } });
  await act(async () => {
    resolve({ data: last(EX2, 60), error: null });
  });
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("72,5");
  await waitFor(() =>
    expect(
      screen.getAllByLabelText(/^Подход \d+$/).map((input) => (input as HTMLInputElement).value),
    ).toEqual(["8", "8", "7", "6"]),
  );
  await waitFor(() => expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("1"));
});
it.each(["", "8-8-7-6"])(
  "keeps invalid approach %j visible instead of dropping/concatenating it",
  async (value) => {
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Подход 1"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Подход 2"), { target: { value } });
    submit();
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
  expect(await screen.findByText("План 4×6–8")).toBeVisible();
  expect(screen.getByText("Истории нет")).toBeVisible();
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("72,5");
  expect(screen.getByLabelText("Подход 1")).toHaveValue("11");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Не потерять");
  expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("2,5");
  expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-10");
  act(() => qc.setQueryData(["user", A, "last-entry", EX, "2026-10-10"], last(EX, 90)));
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("72,5");
});
it("shows no invented plan values when an exercise has no targets", async () => {
  fake.state.rows.program_exercises[0]!["target_sets"] = null;
  fake.state.rows.program_exercises[0]!["target_reps"] = null;
  fake.state.rows.workout_entries = [];
  mount();
  expect(await screen.findByText("Истории нет")).toBeVisible();
  const summary = screen.getByText("Истории нет").parentElement;
  expect(summary).not.toHaveTextContent("План");
  expect(summary).not.toHaveTextContent("—");
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
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  expect(fake.state.saveRpc).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Сохранено")).not.toBeInTheDocument();
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
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
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
  expect(toast.success).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Заметки")).toHaveValue("Сохранить меня");
  expect(screen.getByLabelText("Рабочий вес, кг")).toBeEnabled();
  expect(screen.getByLabelText("Упражнение")).toHaveValue(EX);
  const id = fake.state.saveRpc.mock.calls[0]![0]["_id"];
  save();
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  expect(fake.state.saveRpc.mock.calls[1]![0]["_id"]).toBe(id);
});
it("an intentional second entry on the same date gets a new UUID", async () => {
  fake.state.rows.program_exercises = [exercise(EX)];
  mount();
  await ready();
  save();
  await screen.findByText(/Все упражнения этого дня пройдены/);
  for (let index = 1; index <= 4; index++)
    fireEvent.change(screen.getByLabelText(`Подход ${index}`), { target: { value: "8" } });
  save();
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledTimes(2));
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
  expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2);
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
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("80"));
  expect(
    screen.getAllByLabelText(/^Подход \d+$/).map((input) => (input as HTMLInputElement).value),
  ).toEqual(["8", "8", "7", "6"]);
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

it("verifies cached last-entry again and applies the newer response to a pristine form", async () => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX2 } });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("60"));
  let resolve!: (response: { data: Row; error: null }) => void;
  fake.state.delaySelect = {
    table: "workout_entries",
    filters: { exercise_id: EX },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX } });
  await screen.findByText("Загрузка предыдущей тренировки…");
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("30");
  await act(async () => {
    resolve({ data: { ...last(EX, 55), reps: [9, 9, 8], rir: 2 }, error: null });
  });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("55"));
  expect(screen.getAllByLabelText(/^Подход \d+$/)).toHaveLength(3);
  expect(screen.getByLabelText("Подход 3")).toHaveValue("8");
  expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("2");
  // Background refreshes of the same key also update untouched fields.
  fake.state.rows.workout_entries[0]!["weight"] = 57.5;
  await act(async () => {
    await qc.invalidateQueries({ queryKey: userKeys.lastEntry(A, EX) });
  });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("57.5"));
});

it("a fresh cached-key response cannot replace fields edited while it was loading", async () => {
  mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX2 } });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("60"));
  let resolve!: (response: { data: Row; error: null }) => void;
  fake.state.delaySelect = {
    table: "workout_entries",
    filters: { exercise_id: EX },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX } });
  fireEvent.change(screen.getByLabelText("Рабочий вес, кг"), { target: { value: "72,5" } });
  fireEvent.change(screen.getByLabelText("Подход 4"), { target: { value: "7" } });
  fireEvent.change(screen.getByLabelText("RIR (необязательно)"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Мой ввод" } });
  await act(async () => {
    resolve({ data: { ...last(EX, 55), reps: [9, 9, 8], rir: 2 }, error: null });
  });
  await ready();
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("72,5");
  expect(screen.getAllByLabelText(/^Подход \d+$/)).toHaveLength(4);
  expect(screen.getByLabelText("Подход 4")).toHaveValue("7");
  expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("3");
  expect(screen.getByLabelText("Заметки")).toHaveValue("Мой ввод");
});

it("cancels pre-save history and reopening uses the newly confirmed fourth rep", async () => {
  mount();
  await ready();
  let resolve!: (response: { data: Row; error: null }) => void;
  fake.state.delaySelect = {
    table: "workout_entries",
    filters: { exercise_id: EX },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  act(() => {
    void qc.invalidateQueries({ queryKey: userKeys.lastEntry(A, EX) });
  });
  await waitFor(() => expect(fake.state.delaySelect).toBeNull());
  const staleRequest = fake.state.calls.filter((call) => call.table === "workout_entries").at(-1)!;
  fireEvent.change(screen.getByLabelText("Подход 4"), { target: { value: "7" } });
  submit();
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  expect(staleRequest.signal?.aborted).toBe(true);
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX } });
  await waitFor(() => expect(screen.getByLabelText("Подход 4")).toHaveValue("7"));
  await act(async () => {
    resolve({ data: last(EX, 99), error: null });
  });
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("50");
  expect(screen.getByLabelText("Подход 4")).toHaveValue("7");
  expect(fake.state.saveRpc).toHaveBeenCalledTimes(1);
});

it("keeps the session date on auto-advance past a pristine draft of another date", async () => {
  writeDraft(
    newDraft(A, EX2, { date: "2026-10-01", weight: "99", reps: ["1"], rir: "9", notes: "" }),
  );
  const view = mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-15" } });
  await ready();
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX2 } });
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("60"));
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX } });
  await ready();
  fake.state.rows.workout_entries[1]!["weight"] = 65;
  fake.state.rows.workout_entries[1]!["reps"] = [10, 9];
  fake.state.rows.workout_entries[1]!["rir"] = 3;
  submit();
  await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("65"));
  expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-15");
  expect(screen.getAllByLabelText(/^Подход \d+$/)).toHaveLength(2);
  expect(screen.getByLabelText("Подход 2")).toHaveValue("9");
  expect(screen.getByLabelText("RIR (необязательно)")).toHaveValue("3");
  expect(screen.queryByRole("button", { name: /Открыть черновик/ })).not.toBeInTheDocument();
  view.unmount();
  mount();
  await ready();
  expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-15");
});

it.each([false, true])(
  "restores an older edited draft explicitly, preserving both dates and pending=%s",
  async (pending) => {
    const old = newDraft(A, EX2, {
      date: "2026-10-01",
      weight: "22,5",
      reps: ["5", "4"],
      rir: "3",
      notes: "Старый ввод",
    });
    old.dirty = { date: true, weight: true, reps: true, rir: true, notes: true };
    if (pending) old.operation = { id: old.id, payload: validateWorkout(old.fields, EX2, DAY) };
    writeDraft(old);
    mount();
    await ready();
    fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-15" } });
    await ready();
    submit();
    await waitFor(() => expect(screen.getByLabelText("Упражнение")).toHaveValue(EX2));
    await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("60"));
    expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-15");
    fireEvent.change(screen.getByLabelText("Заметки"), { target: { value: "Новый ввод" } });
    const current = readDraft(A, EX2)!;
    expect(current.id).not.toBe(old.id);
    expect(readDraft(A, EX2, "2026-10-01")).toEqual(old);
    fireEvent.click(screen.getByRole("button", { name: "Открыть черновик за 2026-10-01" }));
    expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("22,5");
    expect(screen.getByLabelText("Подход 2")).toHaveValue("4");
    expect(screen.getByLabelText("Заметки")).toHaveValue("Старый ввод");
    if (pending) {
      expect(screen.getByLabelText("Рабочий вес, кг")).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Повторить сохранение" }));
      await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledTimes(2));
      expect(fake.state.saveRpc.mock.calls[1]![0]).toMatchObject({
        _id: old.id,
        _performed_on: "2026-10-01",
        _weight: 22.5,
        _reps: [5, 4],
      });
    } else {
      fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-15" } });
      expect(screen.getByLabelText("Заметки")).toHaveValue("Новый ввод");
      expect(readDraft(A, EX2)?.id).toBe(current.id);
    }
    expect(readDraft(A, EX2, "2026-10-15")?.fields.notes).toBe("Новый ввод");
  },
);

it("rapidly switching A's exercises and then accounts ignores a late cached-key response", async () => {
  fake.state.rows.program_days.push({
    id: DAY_B,
    user_id: B,
    name: "День B",
    position: 0,
    archived_at: null,
  });
  fake.state.rows.program_exercises.push({ ...exercise(EX, B), day_id: DAY_B });
  fake.state.rows.workout_entries.push({ ...last(EX, 80, B), reps: [12, 11], rir: 4 });
  const view = mount();
  await ready();
  fireEvent.change(screen.getByLabelText("Дата"), { target: { value: "2026-10-13" } });
  await ready();
  let resolve!: (response: { data: Row; error: null }) => void;
  fake.state.delaySelect = {
    table: "workout_entries",
    filters: { user_id: A, exercise_id: EX },
    promise: new Promise((done) => {
      resolve = done;
    }),
  };
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX2 } });
  fireEvent.change(screen.getByLabelText("Упражнение"), { target: { value: EX } });
  await waitFor(() => expect(fake.state.delaySelect).toBeNull());
  act(() => authEvent("SIGNED_IN", B));
  view.rerender(tree(<WorkoutPage />, B));
  await waitFor(() => expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("80"));
  const dateB = (screen.getByLabelText("Дата") as HTMLInputElement).value;
  expect(dateB).not.toBe("2026-10-13");
  fireEvent.change(screen.getByLabelText("Подход 2"), { target: { value: "13" } });
  await act(async () => {
    resolve({ data: last(EX, 99, A), error: null });
  });
  expect(screen.getByLabelText("Рабочий вес, кг")).toHaveValue("80");
  expect(screen.getByLabelText("Подход 2")).toHaveValue("13");
  expect(screen.getByLabelText("Дата")).toHaveValue(dateB);
  expect(qc.getQueriesData({ queryKey: userKeys.all(A) })).toHaveLength(0);
});
