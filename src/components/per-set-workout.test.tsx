import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authEvent, fake, resetFake } from "@/test/supabase-mock";
import { AccountBoundary, SessionProvider } from "@/lib/session";
import { WorkoutPage } from "@/components/workout-page";
import { perSetDraftKey } from "@/lib/workout-draft";
import { toISO } from "@/lib/workout";

const USER = "11111111-1111-4111-8111-111111111111";
const DAY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EXERCISE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_EXERCISE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let client: QueryClient;

beforeEach(() => {
  resetFake();
  localStorage.clear();
  vi.stubGlobal("crypto", { randomUUID });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  fake.state.rows.program_days = [
    { id: DAY, user_id: USER, name: "Силовой", position: 0, archived_at: null },
  ];
  fake.state.rows.program_exercises = [
    {
      id: EXERCISE,
      user_id: USER,
      day_id: DAY,
      name: "Жим",
      position: 0,
      target_sets: 3,
      target_reps: "6-8",
      working_weight: 30,
      example_reps: [8, 8, 6],
      archived_at: null,
    },
  ];
  fake.state.rows.workout_entries = [
    {
      id: "history",
      user_id: USER,
      exercise_id: EXERCISE,
      performed_on: "2026-10-12",
      created_at: "2026-10-12T10:00:00Z",
      weight: 40,
      reps: [8, 8, 6],
      rir: 2,
    },
  ];
  fake.state.rows.workout_entry_sets = [
    {
      id: "history-set-1",
      user_id: USER,
      workout_entry_id: "history",
      position: 1,
      weight: "40.00",
      reps: 8,
      rir: "2.0",
      set_type: "working",
      load_type: "external",
    },
    {
      id: "history-set-2",
      user_id: USER,
      workout_entry_id: "history",
      position: 2,
      weight: "42.50",
      reps: 8,
      rir: "1.0",
      set_type: "working",
      load_type: "external",
    },
    {
      id: "history-set-3",
      user_id: USER,
      workout_entry_id: "history",
      position: 3,
      weight: "40.00",
      reps: 6,
      rir: null,
      set_type: "working",
      load_type: "external",
    },
  ];
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

function mount() {
  const view = render(
    <QueryClientProvider client={client}>
      <SessionProvider onIdentityChange={() => {}}>
        <AccountBoundary verifiedUserId={USER}>
          <WorkoutPage />
        </AccountBoundary>
      </SessionProvider>
    </QueryClientProvider>,
  );
  act(() => authEvent("SIGNED_IN", USER));
  return view;
}

function addSecondExercise() {
  fake.state.rows.program_exercises.push({
    id: SECOND_EXERCISE,
    user_id: USER,
    day_id: DAY,
    name: "Тяга",
    position: 1,
    target_sets: 3,
    target_reps: "8",
    working_weight: 30,
    example_reps: [8, 8, 8],
    archived_at: null,
  });
}

it("prefills each set independently and submits independent weight, reps, and nullable RIR", async () => {
  mount();
  await screen.findByLabelText("Вес подхода 1");
  expect(screen.queryByLabelText(/Тип подхода/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Тип нагрузки/)).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50"));
  const dateDayRow = screen.getByRole("group", { name: "Дата и тренировочный день" });
  expect(dateDayRow.className).toContain("grid-cols-[minmax(0,42fr)_minmax(0,58fr)]");
  expect(dateDayRow.className).toContain("gap-2.5");
  expect(screen.getByLabelText("Дата").closest('[role="group"]')).toBe(dateDayRow);
  expect(
    screen.getByRole("combobox", { name: "Тренировочный день" }).closest('[role="group"]'),
  ).toBe(dateDayRow);
  expect(
    screen.queryByText(/План 3×6–8|Предыдущая тренировка загружена по подходам/),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Прошлые результаты по подходам")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Повторения подхода 1")).toHaveValue("8");
  expect(screen.getByLabelText("RIR подхода 3")).toHaveValue("");

  fireEvent.change(screen.getByLabelText("Вес подхода 1"), { target: { value: "41.25" } });
  fireEvent.change(screen.getByLabelText("Повторения подхода 2"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("RIR подхода 2"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalled());
  const args = fake.state.saveRpc.mock.calls[0]?.[0];
  expect(args).toMatchObject({
    _exercise_id: EXERCISE,
    _day_id: DAY,
    _sets: [
      expect.objectContaining({ position: 1, weight: "41.25", reps: 8, rir: "2.0" }),
      expect.objectContaining({ position: 2, weight: "42.50", reps: 10, rir: "3" }),
      expect.objectContaining({ position: 3, weight: "40.00", reps: 6, rir: null }),
    ],
  });
  expect(new Set((args?.["_sets"] as { id: string }[]).map((set) => set.id)).size).toBe(3);
});

it("adds a set using the prior matching set as a non-overwriting fallback", async () => {
  mount();
  await screen.findByLabelText("Вес подхода 1");
  await waitFor(() => expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50"));
  fireEvent.click(screen.getByRole("button", { name: "Добавить подход" }));
  expect(screen.getByLabelText("Вес подхода 4")).toHaveValue("40.00");
  expect(screen.getByLabelText("Повторения подхода 4")).toHaveValue("6");
  fireEvent.change(screen.getByLabelText("Вес подхода 4"), { target: { value: "45" } });
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("40.00");
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalled());
  const args = fake.state.saveRpc.mock.calls[0]?.[0];
  expect((args?.["_sets"] as { set_type: string; load_type: string }[])[3]).toMatchObject({
    set_type: "working",
    load_type: "external",
  });
});

it("persists a frozen retry and sends identical set values after a lost response", async () => {
  const original = fake.state.saveRpc.getMockImplementation()!;
  const requests: unknown[] = [];
  fake.state.saveRpc.mockImplementation(async (args) => {
    requests.push(structuredClone(args));
    if (requests.length === 1) throw new TypeError("network timeout");
    return original(args);
  });
  mount();
  await screen.findByLabelText("Вес подхода 1");
  await waitFor(() => expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50"));
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  const retry = await screen.findByRole("button", { name: "Повторить сохранение" });
  fireEvent.click(retry);
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]).toEqual(requests[0]);
});

it("restores the user's per-set draft after remount without replacing neighboring values", async () => {
  const view = mount();
  await screen.findByLabelText("Вес подхода 1");
  await waitFor(() => expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50"));
  fireEvent.change(screen.getByLabelText("Вес подхода 2"), { target: { value: "47.25" } });
  fireEvent.change(screen.getByLabelText("RIR подхода 3"), { target: { value: "0" } });
  view.unmount();
  mount();
  await waitFor(() => expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("47.25"));
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("40.00");
  expect(screen.getByLabelText("RIR подхода 3")).toHaveValue("0");
});

it("hides set/load type controls and preserves existing metadata while editing a set", async () => {
  const date = toISO(new Date());
  localStorage.setItem(
    perSetDraftKey(USER, EXERCISE),
    JSON.stringify({
      version: 2,
      userId: USER,
      exerciseId: EXERCISE,
      id: randomUUID(),
      fields: {
        date,
        notes: "",
        sets: [
          {
            id: randomUUID(),
            position: 1,
            weight: "20",
            reps: "8",
            rir: "2",
            set_type: "warmup",
            load_type: "bodyweight",
          },
        ],
      },
      recordedSetIds: [],
      dirty: { date: false, sets: true, notes: false },
      operation: null,
    }),
  );
  mount();
  await screen.findByLabelText("Вес подхода 1");
  expect(screen.queryByLabelText(/Тип подхода/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Тип нагрузки/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Вес подхода 1"), { target: { value: "22.5" } });
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalled());
  const args = fake.state.saveRpc.mock.calls[0]?.[0];
  expect(
    (args?.["_sets"] as { weight: string; set_type: string; load_type: string }[])[0],
  ).toMatchObject({ weight: "22.5", set_type: "warmup", load_type: "bodyweight" });
});

it("starts a separate Focus Mode and hides the preparation controls without losing the draft", async () => {
  const view = mount();
  await screen.findByLabelText("Вес подхода 1");
  await waitFor(() => expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50"));
  expect(screen.getByRole("group", { name: "Режим тренировки" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Обычный" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Фокус" })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Фокус" }));
  expect(screen.getByRole("button", { name: "Фокус" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Тренировочный день")).toBeInTheDocument();
  expect(screen.getByLabelText("Дата")).toBeInTheDocument();
  expect(screen.queryByLabelText("Упражнение")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Focus Mode" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Вес подхода 1")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Начать тренировку" }));
  expect(screen.getByRole("region", { name: "Focus Mode" })).toHaveTextContent("Жим");
  expect(
    screen.queryByText(/План 3×6–8|Предыдущая тренировка загружена по подходам/),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Прошлые результаты по подходам")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Выбрать подход" }), {
    target: { value: "1" },
  });
  await waitFor(() => expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50"));
  fireEvent.change(screen.getByRole("combobox", { name: "Выбрать подход" }), {
    target: { value: "0" },
  });
  expect(screen.queryByLabelText("Тренировочный день")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Дата")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Упражнение")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Тип подхода 1")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Тип нагрузки 1")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Выбрать подход/ })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Выбрать подход" })).toHaveValue("0");
  expect(screen.getByRole("progressbar", { name: "Прогресс подходов" })).toHaveAttribute(
    "aria-valuenow",
    "0",
  );
  const weightInput = screen.getByLabelText("Вес подхода 1");
  const repsInput = screen.getByLabelText("Повторения подхода 1");
  const rirInput = screen.getByLabelText("RIR подхода 1");
  const inputRow = weightInput.closest(".grid-cols-3");
  expect(inputRow).toBeTruthy();
  expect(repsInput.closest(".grid-cols-3")).toBe(inputRow);
  expect(rirInput.closest(".grid-cols-3")).toBe(inputRow);
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  expect(screen.getByRole("list", { name: "Записанные подходы" })).toHaveTextContent(
    "1. 40.00 кг × 8 · RIR 2",
  );
  const recordButton = screen.getByRole("button", { name: "Записать подход" });
  const recordedSets = screen.getByRole("list", { name: "Записанные подходы" });
  expect(recordButton.compareDocumentPosition(recordedSets)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50");
  expect(screen.getByText("Подход 2 из 3")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Выбрать подход" })).toHaveValue("1");
  expect(screen.getByRole("progressbar", { name: "Прогресс подходов" })).toHaveAttribute(
    "aria-valuenow",
    "33.33333333333333",
  );

  fireEvent.click(screen.getByRole("button", { name: "Обычный" }));
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("40.00");
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50");
  view.unmount();
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Фокус" }));
  fireEvent.click(await screen.findByRole("button", { name: "Начать тренировку" }));
  expect(screen.getByRole("progressbar", { name: "Прогресс подходов" })).toHaveAttribute(
    "aria-valuenow",
    "33.33333333333333",
  );
});

it("keeps program order on skip and lets the user return to an unfinished exercise", async () => {
  addSecondExercise();
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Фокус" }));
  fireEvent.click(screen.getByRole("button", { name: "Начать тренировку" }));
  expect(screen.getByText("Жим")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Скип" }));
  expect(screen.getByRole("heading", { name: "Тяга" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Упражнения · 0 из 2" }));
  fireEvent.click(screen.getByRole("button", { name: /Жим/ }));
  expect(screen.getByRole("heading", { name: "Жим" })).toBeInTheDocument();
  expect(fake.state.rows.program_exercises.map((exercise) => exercise.position)).toEqual([0, 1]);
});

it("keeps each Focus Mode set's manual values independent while navigating and resizing the plan", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Фокус" }));
  fireEvent.click(screen.getByRole("button", { name: "Начать тренировку" }));
  await screen.findByLabelText("Вес подхода 1");
  fireEvent.change(screen.getByLabelText("Вес подхода 1"), { target: { value: "51.25" } });
  fireEvent.change(screen.getByLabelText("Повторения подхода 1"), { target: { value: "9" } });
  fireEvent.change(screen.getByLabelText("RIR подхода 1"), { target: { value: "2" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Выбрать подход" }), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("Вес подхода 2"), { target: { value: "62.5" } });
  fireEvent.change(screen.getByLabelText("Повторения подхода 2"), { target: { value: "7" } });
  fireEvent.change(screen.getByLabelText("RIR подхода 2"), { target: { value: "1" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Выбрать подход" }), {
    target: { value: "0" },
  });
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("51.25");
  expect(screen.getByLabelText("Повторения подхода 1")).toHaveValue("9");
  expect(screen.getByLabelText("RIR подхода 1")).toHaveValue("2");
  fireEvent.click(screen.getByRole("button", { name: "Добавить подход" }));
  expect(screen.getByLabelText("Вес подхода 4")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Убрать последний подход" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Выбрать подход" }), {
    target: { value: "1" },
  });
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("62.5");
  expect(screen.getByLabelText("Повторения подхода 2")).toHaveValue("7");
  expect(screen.getByLabelText("RIR подхода 2")).toHaveValue("1");
});

it("keeps recorded-set progress while editing the next set", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Фокус" }));
  fireEvent.click(screen.getByRole("button", { name: "Начать тренировку" }));
  await screen.findByLabelText("Вес подхода 1");
  fireEvent.change(screen.getByLabelText("Вес подхода 1"), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText("Повторения подхода 1"), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText("RIR подхода 1"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  fireEvent.change(screen.getByLabelText("Вес подхода 2"), { target: { value: "47.5" } });

  expect(screen.getByRole("list", { name: "Записанные подходы" })).toHaveTextContent(
    "1. 40 кг × 8 · RIR 2",
  );
  expect(screen.getByText("Подход 2 из 3")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "Прогресс подходов" })).toHaveAttribute(
    "aria-valuenow",
    "33.33333333333333",
  );
});

it("saves once after the final set, offers the next unfinished exercise, and finishes without another save", async () => {
  addSecondExercise();
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Фокус" }));
  fireEvent.click(screen.getByRole("button", { name: "Начать тренировку" }));
  await screen.findByLabelText("Вес подхода 1");
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  await screen.findByRole("heading", { name: "Тяга" });
  expect(fake.state.saveRpc).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Упражнения · 1 из 2" }));
  expect(screen.getByRole("button", { name: /Жим/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Упражнения · 1 из 2" }));
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  await screen.findByRole("heading", { name: "Тренировка завершена" });
  expect(fake.state.saveRpc).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Завершить и вернуться" }));
  expect(screen.getByLabelText("Упражнение")).toBeInTheDocument();
  expect(fake.state.saveRpc).toHaveBeenCalledTimes(2);
});
