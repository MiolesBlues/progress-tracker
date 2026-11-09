import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authEvent, fake, resetFake } from "@/test/supabase-mock";
import { AccountBoundary, SessionProvider } from "@/lib/session";
import { WorkoutPage } from "@/components/workout-page";
import { perSetDraftKey } from "@/lib/workout-draft";
import { userKeys } from "@/lib/queries";
import { toISO } from "@/lib/workout";

const USER = "11111111-1111-4111-8111-111111111111";
const DAY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EXERCISE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_EXERCISE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let client: QueryClient;

function offsetDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toISO(date);
}

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
      performed_on: offsetDate(-1),
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

function enterSet(index: number, weight: string, reps: string, rir = "") {
  fireEvent.change(screen.getByLabelText(`Вес подхода ${index}`), { target: { value: weight } });
  fireEvent.change(screen.getByLabelText(`Повторения подхода ${index}`), {
    target: { value: reps },
  });
  fireEvent.change(screen.getByLabelText(`RIR подхода ${index}`), { target: { value: rir } });
}

function enterThreeSets() {
  enterSet(1, "40.00", "8", "2.0");
  enterSet(2, "42.50", "8", "1.0");
  enterSet(3, "40.00", "6");
}

function enterFocusThreeSets() {
  const values = [
    ["40.00", "8", "2.0"],
    ["42.50", "8", "1.0"],
    ["40.00", "6", ""],
  ];
  values.forEach(([weight, reps, rir], index) => {
    fireEvent.change(screen.getByRole("combobox", { name: "Выбрать подход" }), {
      target: { value: String(index) },
    });
    enterSet(index + 1, weight!, reps!, rir!);
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Выбрать подход" }), {
    target: { value: "0" },
  });
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

function mockSetRects() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
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

it("starts a new workout with empty results and submits independent set values", async () => {
  mount();
  const firstWeightInput = await screen.findByLabelText("Вес подхода 1");
  await waitFor(() =>
    expect(
      client.getQueryState([...userKeys.lastEntry(USER, EXERCISE), toISO(new Date())])?.status,
    ).toBe("success"),
  );
  expect(firstWeightInput.closest("form")?.parentElement).toHaveClass(
    "rounded-2xl",
    "border-border",
    "bg-card",
    "p-4",
    "shadow-sm",
    "sm:p-5",
  );
  expect(screen.queryByLabelText(/Тип подхода/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Тип нагрузки/)).not.toBeInTheDocument();
  const dateDayRow = screen.getByRole("group", { name: "Дата и тренировочный день" });
  expect(dateDayRow.className).toContain("grid-cols-[minmax(0,45fr)_minmax(0,55fr)]");
  expect(dateDayRow.className).toContain("gap-2.5");
  expect(screen.getByLabelText("Дата").closest('[role="group"]')).toBe(dateDayRow);
  expect(
    screen.getByRole("combobox", { name: "Тренировочный день" }).closest('[role="group"]'),
  ).toBe(dateDayRow);
  expect(
    screen.queryByText(/План 3×6–8|Предыдущая тренировка загружена по подходам/),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Прошлые результаты по подходам")).not.toBeInTheDocument();
  for (let index = 1; index <= 3; index++) {
    expect(screen.getByLabelText(`Вес подхода ${index}`)).toHaveValue("");
    expect(screen.getByLabelText(`Повторения подхода ${index}`)).toHaveValue("");
    expect(screen.getByLabelText(`RIR подхода ${index}`)).toHaveValue("");
  }

  enterSet(1, "41.25", "8", "2");
  enterSet(2, "42.50", "10", "3");
  enterSet(3, "40.00", "6");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalled());
  const args = fake.state.saveRpc.mock.calls[0]?.[0];
  expect(args).toMatchObject({
    _exercise_id: EXERCISE,
    _day_id: DAY,
    _sets: [
      expect.objectContaining({ position: 1, weight: "41.25", reps: 8, rir: "2" }),
      expect.objectContaining({ position: 2, weight: "42.50", reps: 10, rir: "3" }),
      expect.objectContaining({ position: 3, weight: "40.00", reps: 6, rir: null }),
    ],
  });
  expect(new Set((args?.["_sets"] as { id: string }[]).map((set) => set.id)).size).toBe(3);
  await waitFor(() => {
    const tabId = sessionStorage.getItem("workout:draft:tab-id");
    const saved = JSON.parse(
      localStorage.getItem(`${perSetDraftKey(USER, EXERCISE)}:tab:${tabId}`) ?? "null",
    ) as { id: string; fields: { sets: { id: string }[] }; operation: unknown } | null;
    expect(saved).not.toBeNull();
    expect(saved?.operation).toBeNull();
    expect(saved?.id).not.toBe(args?.["_id"]);
    expect(saved?.fields.sets.map((set) => set.id)).not.toEqual(
      (args?.["_sets"] as { id: string }[]).map((set) => set.id),
    );
  });
});

it("restores saved sets for the selected workout date, without importing an earlier day", async () => {
  fake.state.rows.workout_entries[0]!["performed_on"] = toISO(new Date());
  mount();
  await screen.findByLabelText("Вес подхода 1");
  await waitFor(() => expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50"));
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("40.00");
  expect(screen.getByLabelText("Повторения подхода 1")).toHaveValue("8");
  expect(screen.getByLabelText("RIR подхода 1")).toHaveValue("2.0");
  expect(screen.getByLabelText("Вес подхода 3")).toHaveValue("40.00");
  expect(screen.getByLabelText("Повторения подхода 3")).toHaveValue("6");
  expect(screen.getByLabelText("RIR подхода 3")).toHaveValue("");
});

it("creates fresh entry and set UUIDs after saving even when history refresh fails", async () => {
  fake.state.readErrors["workout_entries"] = "history offline";
  mount();
  await screen.findByLabelText("Вес подхода 1");
  enterThreeSets();
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalledOnce());
  const args = fake.state.saveRpc.mock.calls[0]?.[0];
  const tabId = sessionStorage.getItem("workout:draft:tab-id");
  await waitFor(() => {
    const next = JSON.parse(
      localStorage.getItem(`${perSetDraftKey(USER, EXERCISE)}:tab:${tabId}`) ?? "null",
    ) as { id: string; fields: { sets: { id: string }[] }; operation: unknown } | null;
    expect(next?.operation).toBeNull();
    expect(next?.id).not.toBe(args?.["_id"]);
    expect(next?.fields.sets.map((set) => set.id)).not.toEqual(
      (args?.["_sets"] as { id: string }[]).map((set) => set.id),
    );
  });
});

it("opens the native date picker when the calendar icon is clicked", async () => {
  const previous = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "showPicker");
  const showPicker = vi.fn();
  Object.defineProperty(HTMLInputElement.prototype, "showPicker", {
    configurable: true,
    value: showPicker,
  });
  try {
    mount();
    await screen.findByLabelText("Дата");
    fireEvent.click(screen.getByRole("button", { name: "Открыть календарь" }));
    expect(showPicker).toHaveBeenCalledOnce();
  } finally {
    if (previous) Object.defineProperty(HTMLInputElement.prototype, "showPicker", previous);
    else
      Object.defineProperty(HTMLInputElement.prototype, "showPicker", {
        configurable: true,
        value: undefined,
      });
  }
});

it("reorders sets by keyboard without separating stable IDs from their values", async () => {
  mount();
  await screen.findByLabelText("Вес подхода 1");
  enterThreeSets();
  const draftKey = `${perSetDraftKey(USER, EXERCISE)}:tab:${sessionStorage.getItem("workout:draft:tab-id")}`;
  const draft = JSON.parse(localStorage.getItem(draftKey)!) as {
    fields: { sets: { id: string }[] };
  };
  const originalIds = draft.fields.sets.map((set) => set.id);

  const rectSpy = mockSetRects();
  try {
    const handle = screen.getByRole("button", { name: "Перетащить подход 1" });
    fireEvent.keyDown(handle, { key: "Space", code: "Space", keyCode: 32 });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.keyDown(handle, { key: "ArrowDown", code: "ArrowDown", keyCode: 40 });
    fireEvent.keyDown(handle, { key: "Space", code: "Space", keyCode: 32 });

    await waitFor(() => expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("42.50"));
    expect(screen.getByLabelText("Повторения подхода 1")).toHaveValue("8");
    expect(screen.getByLabelText("RIR подхода 1")).toHaveValue("1.0");
    expect(
      screen.queryByRole("button", { name: "Переместить подход вверх" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Переместить подход вниз" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalled());
    const args = fake.state.saveRpc.mock.calls[0]?.[0];
    const submittedSets = args?.["_sets"] as { id: string }[];
    expect(submittedSets.map((set) => set.id)).toEqual([
      originalIds[1],
      originalIds[0],
      originalIds[2],
    ]);
    expect(args?.["_sets"]).toMatchObject([
      expect.objectContaining({
        id: expect.any(String),
        position: 1,
        weight: "42.50",
        reps: 8,
        rir: "1.0",
      }),
      expect.objectContaining({
        id: expect.any(String),
        position: 2,
        weight: "40.00",
        reps: 8,
        rir: "2.0",
      }),
      expect.objectContaining({
        id: expect.any(String),
        position: 3,
        weight: "40.00",
        reps: 6,
        rir: null,
      }),
    ]);
  } finally {
    rectSpy.mockRestore();
  }
});

it("adds a new set with empty result fields", async () => {
  mount();
  await screen.findByLabelText("Вес подхода 1");
  enterThreeSets();
  fireEvent.click(screen.getByRole("button", { name: "Добавить подход" }));
  expect(screen.getByLabelText("Вес подхода 4")).toHaveValue("");
  expect(screen.getByLabelText("Повторения подхода 4")).toHaveValue("");
  expect(screen.getByLabelText("RIR подхода 4")).toHaveValue("");
  enterSet(4, "45", "6", "2");
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("40.00");
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(fake.state.saveRpc).toHaveBeenCalled());
  const args = fake.state.saveRpc.mock.calls[0]?.[0];
  expect((args?.["_sets"] as { set_type: string; load_type: string }[])[3]).toMatchObject({
    set_type: "working",
    load_type: "external",
  });
  expect((args?.["_sets"] as { weight: string }[])[3]?.weight).toBe("45");
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
  enterThreeSets();
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
  const retry = await screen.findByRole("button", { name: "Повторить сохранение" });
  fireEvent.click(retry);
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]).toEqual(requests[0]);
});

it("restores the user's per-set draft after remount without replacing neighboring values", async () => {
  const view = mount();
  await screen.findByLabelText("Вес подхода 1");
  fireEvent.change(screen.getByLabelText("Вес подхода 2"), { target: { value: "47.25" } });
  fireEvent.change(screen.getByLabelText("RIR подхода 3"), { target: { value: "0" } });
  view.unmount();
  mount();
  await waitFor(() => expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("47.25"));
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("");
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
  const modeSwitcher = screen.getByRole("group", { name: "Режим тренировки" });
  const workoutCard = modeSwitcher.closest("section");
  expect(workoutCard).not.toBeNull();
  expect(workoutCard).toContainElement(screen.getByLabelText("Дата"));
  expect(modeSwitcher.compareDocumentPosition(screen.getByLabelText("Дата"))).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(screen.getByRole("button", { name: "Обычный" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Фокус" })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Фокус" }));
  expect(screen.getAllByRole("group", { name: "Режим тренировки" })).toHaveLength(1);
  expect(modeSwitcher.closest("section")).toBe(workoutCard);
  expect(screen.getByRole("button", { name: "Фокус" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Тренировочный день")).toBeInTheDocument();
  expect(screen.queryByLabelText("Дата")).not.toBeInTheDocument();
  expect(
    screen.getByText(
      "Тренируйся без лишних отвлечений. Выполняй упражнения по очереди и записывай результаты сразу после каждого подхода.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Упражнение")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Focus Mode" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Вес подхода 1")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Начать тренировку" }));
  enterFocusThreeSets();
  expect(modeSwitcher.closest("section")).toBe(workoutCard);
  expect(screen.getByRole("region", { name: "Focus Mode" })).toHaveTextContent("Жим");
  expect(
    screen.getByText(
      "Тренируйся без лишних отвлечений. Выполняй упражнения по очереди и записывай результаты сразу после каждого подхода.",
    ),
  ).toBeInTheDocument();
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
  expect(screen.getAllByRole("group", { name: "Режим тренировки" })).toHaveLength(1);
  expect(modeSwitcher.closest("section")).toBe(workoutCard);
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("40.00");
  expect(screen.getByLabelText("Вес подхода 2")).toHaveValue("42.50");
  expect(screen.queryByText(/Тренируйся без лишних отвлечений/)).not.toBeInTheDocument();
  view.unmount();
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Фокус" }));
  fireEvent.click(await screen.findByRole("button", { name: "Начать тренировку" }));
  expect(screen.getByRole("progressbar", { name: "Прогресс подходов" })).toHaveAttribute(
    "aria-valuenow",
    "33.33333333333333",
  );
});

it("synchronizes the Focus training day with Standard mode and keeps the workout date", async () => {
  const secondDay = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const secondExercise = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  fake.state.rows.program_days.push({
    id: secondDay,
    user_id: USER,
    name: "Верх",
    position: 1,
    archived_at: null,
  });
  fake.state.rows.program_exercises.push({
    id: secondExercise,
    user_id: USER,
    day_id: secondDay,
    name: "Подтягивания",
    position: 0,
    target_sets: 3,
    target_reps: "6-8",
    working_weight: 0,
    example_reps: [8, 8, 6],
    archived_at: null,
  });

  mount();
  const date = await screen.findByLabelText("Дата");
  fireEvent.change(date, { target: { value: "2026-10-14" } });
  fireEvent.click(screen.getByRole("button", { name: "Фокус" }));

  const trainingDay = screen.getByRole("combobox", { name: "Тренировочный день" });
  expect(trainingDay).toHaveTextContent("Силовой");
  fireEvent.click(trainingDay);
  fireEvent.click(await screen.findByRole("option", { name: /Верх/ }));
  expect(trainingDay).toHaveTextContent("Верх");
  expect(screen.queryByLabelText("Дата")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Начать тренировку" }));
  expect(screen.getByRole("heading", { name: "Подтягивания" })).toBeInTheDocument();
  for (let index = 1; index <= 3; index++) {
    fireEvent.change(screen.getByRole("combobox", { name: "Выбрать подход" }), {
      target: { value: String(index - 1) },
    });
    expect(screen.getByLabelText(`Вес подхода ${index}`)).toHaveValue("");
    expect(screen.getByLabelText(`Повторения подхода ${index}`)).toHaveValue("");
    expect(screen.getByLabelText(`RIR подхода ${index}`)).toHaveValue("");
  }
  expect(screen.queryByLabelText("Дата")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Обычный" }));

  expect(screen.getByLabelText("Дата")).toHaveValue("2026-10-14");
  expect(screen.getByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent("Верх");
  expect(screen.queryByText(/Тренируйся без лишних отвлечений/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Фокус" }));
  expect(screen.getByRole("combobox", { name: "Тренировочный день" })).toHaveTextContent("Верх");
  expect(screen.queryByLabelText("Дата")).not.toBeInTheDocument();
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
  expect(screen.getByRole("combobox", { name: "Выбрать подход" })).toHaveValue("0");
  expect(screen.getByLabelText("Вес подхода 1")).toHaveValue("51.25");
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
  enterFocusThreeSets();
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  fireEvent.click(screen.getByRole("button", { name: "Записать подход" }));
  await screen.findByRole("heading", { name: "Тяга" });
  expect(fake.state.saveRpc).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Упражнения · 1 из 2" }));
  enterFocusThreeSets();
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
