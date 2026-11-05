import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fake, resetFake } from "@/test/supabase-mock";
import { toISO } from "@/lib/workout";
import { EntriesPage } from "./entries-page";
import { navigationTabs } from "@/lib/navigation";
import { userKeys, type Day } from "@/lib/queries";

vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()),
  useUserSession: () => ({
    userId: "A",
    signal: new AbortController().signal,
    isCurrent: () => true,
  }),
}));

let qc: QueryClient;
function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toISO(date);
}
function displayedDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}
function entry(id: string, date: string, weight: number, reps: number[]) {
  return {
    id,
    user_id: "A",
    exercise_id: "press",
    performed_on: date,
    created_at: `${date}T10:00:00Z`,
    weight,
    reps,
    rir: 2,
    notes: id === "today" ? "Хорошее самочувствие" : null,
    day_id: "day-1",
    day_name: "Верх тела",
  };
}
function mount() {
  render(
    <QueryClientProvider client={qc}>
      <EntriesPage />
    </QueryClientProvider>,
  );
}
function chooseSort(diary: HTMLElement, label: string) {
  fireEvent.pointerDown(within(diary).getByRole("button", { name: "Сортировка записей" }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole("menuitemradio", { name: label }));
}

beforeEach(() => {
  resetFake();
  localStorage.clear();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fake.state.rows.program_days = [
    { id: "day-1", user_id: "A", name: "Верх тела", position: 0, archived_at: null },
    { id: "day-2", user_id: "A", name: "Ноги", position: 1, archived_at: null },
  ];
  fake.state.rows.program_exercises = [
    {
      id: "press",
      user_id: "A",
      day_id: "day-1",
      name: "Жим лёжа",
      position: 0,
      archived_at: null,
    },
    {
      id: "squat",
      user_id: "A",
      day_id: "day-2",
      name: "Присед",
      position: 0,
      archived_at: null,
    },
  ];
  fake.state.rows.workout_entries = [
    entry("today", dateDaysAgo(0), 50, [8, 8, 7]),
    entry("week", dateDaysAgo(5), 45, [8, 8]),
    entry("month", dateDaysAgo(20), 40, [10]),
    entry("old", dateDaysAgo(45), 35, [12]),
    {
      ...entry("squat-entry", dateDaysAgo(0), 80, [5]),
      exercise_id: "squat",
      day_id: "day-2",
      day_name: "Ноги",
    },
  ];
});
afterEach(() => {
  cleanup();
  qc.clear();
});

it("keeps the records destination separate from progress in the dock navigation", () => {
  expect(navigationTabs.find((tab) => tab.label === "Записи")?.to).toBe("/entries");
  expect(navigationTabs.find((tab) => tab.label === "Прогресс")?.to).toBe("/progress");
});

it("selects a day and exercise and displays the exercise diary", async () => {
  mount();
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(screen.getByLabelText("День записей")).toHaveValue("day-1");
  expect(screen.getByLabelText("Упражнение записей")).toHaveValue("press");
  const latest = within(diary).getAllByRole("listitem")[0]!;
  expect(latest).toHaveTextContent("Жим лёжа");
  expect(latest).toHaveTextContent("3 подхода");
  expect(
    within(latest).getByText(`${displayedDate(dateDaysAgo(0))} · Верх тела`),
  ).toBeInTheDocument();
  fireEvent.click(within(latest).getByRole("button"));
  expect(latest).toHaveTextContent("50 кг");
  expect(latest).toHaveTextContent("RIR");
  expect(within(latest).getByText("Хорошее самочувствие")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("День записей"), { target: { value: "day-2" } });
  await waitFor(() => expect(screen.getByLabelText("Упражнение записей")).toHaveValue("squat"));
  expect(
    (await screen.findByRole("region", { name: "Дневник записей упражнения" })).querySelector("li"),
  ).toHaveTextContent("1 подход · Макс. рабочий вес 80 кг");
});

it("renders independent set weights, reps, RIR, and warm-up type from set history", async () => {
  fake.state.rows.workout_entries = [entry("set-entry", dateDaysAgo(0), 80, [8, 6])];
  fake.state.rows.workout_entry_sets = [
    {
      id: "set-1",
      user_id: "A",
      workout_entry_id: "set-entry",
      position: 1,
      weight: "40.00",
      reps: 8,
      rir: "2.0",
      set_type: "working",
      load_type: "external",
    },
    {
      id: "set-2",
      user_id: "A",
      workout_entry_id: "set-entry",
      position: 2,
      weight: "42.50",
      reps: 6,
      rir: null,
      set_type: "warmup",
      load_type: "external",
    },
  ];
  mount();
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  const item = within(diary).getAllByRole("listitem")[0]!;
  fireEvent.click(within(item).getByRole("button"));
  expect(item).toHaveTextContent("40 кг");
  expect(item).toHaveTextContent("42,5 кг");
  expect(item).toHaveTextContent("2");
  expect(item).toHaveTextContent("W");
});

it("edits one saved set through the owner-scoped per-set RPC", async () => {
  fake.state.rows.workout_entries = [entry("editable", dateDaysAgo(0), 50, [8])];
  fake.state.rows.workout_entry_sets = [
    {
      id: "set-to-edit",
      user_id: "A",
      workout_entry_id: "editable",
      position: 1,
      weight: "50.00",
      reps: 8,
      rir: "2.0",
      set_type: "working",
      load_type: "external",
    },
  ];
  mount();
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  const entryItem = within(diary).getAllByRole("listitem")[0]!;
  fireEvent.click(within(entryItem).getByRole("button"));
  fireEvent.click(within(entryItem).getByRole("button", { name: "Изменить подход 1" }));
  fireEvent.change(within(entryItem).getByLabelText("Вес подхода 1"), {
    target: { value: "52.25" },
  });
  fireEvent.change(within(entryItem).getByLabelText("Повторения подхода 1"), {
    target: { value: "9" },
  });
  fireEvent.change(within(entryItem).getByLabelText("RIR подхода 1"), { target: { value: "" } });
  fireEvent.click(within(entryItem).getByRole("button", { name: "Сохранить подход 1" }));
  await waitFor(() =>
    expect(fake.state.rpc).toHaveBeenCalledWith(
      "edit_workout_entry_set",
      expect.objectContaining({
        _entry_id: "editable",
        _set_id: "set-to-edit",
        _weight: "52.25",
        _reps: 9,
        _rir: null,
      }),
    ),
  );
  expect(fake.state.rows.workout_entries[0]).toMatchObject({ weight: 50, reps: [8] });
});

it("keeps the edit and input when the RPC reports that the set was deleted", async () => {
  fake.state.updateRpcResult = false;
  fake.state.rows.workout_entries = [entry("deleted-set", dateDaysAgo(0), 50, [8])];
  fake.state.rows.workout_entry_sets = [
    {
      id: "deleted-set-id",
      user_id: "A",
      workout_entry_id: "deleted-set",
      position: 1,
      weight: "50.00",
      reps: 8,
      rir: "2.0",
      set_type: "working",
      load_type: "external",
    },
  ];
  mount();
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  const item = within(diary).getAllByRole("listitem")[0]!;
  fireEvent.click(within(item).getByRole("button"));
  fireEvent.click(within(item).getByRole("button", { name: "Изменить подход 1" }));
  fireEvent.change(within(item).getByLabelText("Вес подхода 1"), { target: { value: "51.5" } });
  fireEvent.click(within(item).getByRole("button", { name: "Сохранить подход 1" }));
  expect(
    await within(item).findByText("Подход больше недоступен. История обновлена; проверьте запись."),
  ).toBeVisible();
  expect(within(item).getByLabelText("Вес подхода 1")).toHaveValue("51.5");
  expect(within(item).queryByText("Подход обновлён")).not.toBeInTheDocument();
});

it("keeps multiple workout records open and preserves set order and missing RIR", async () => {
  fake.state.rows.workout_entries = [
    { ...entry("today", dateDaysAgo(0), 39, [10, 10, 9, 8]), rir: null },
    { ...entry("week", dateDaysAgo(5), 42, [7, 6]), rir: null },
  ];
  mount();
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  const rows = within(diary).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  const toggles = rows.map((row) => within(row).getByRole("button"));
  expect(toggles[0]).toHaveClass("min-h-11");
  fireEvent.click(toggles[0]!);
  fireEvent.click(toggles[1]!);
  expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
  expect(toggles[1]).toHaveAttribute("aria-expanded", "true");
  const table = document.getElementById("entry-sets-today");
  expect(table).toHaveTextContent(/1\s*39 кг\s*10\s*—/);
  expect(table).toHaveTextContent(/2\s*39 кг\s*10\s*—/);
  expect(table).toHaveTextContent(/3\s*39 кг\s*9\s*—/);
  expect(table).toHaveTextContent(/4\s*39 кг\s*8\s*—/);
});

async function openEditableSet() {
  fake.state.rows.workout_entries = [entry("edit-race", dateDaysAgo(0), 50, [8])];
  fake.state.rows.workout_entry_sets = [
    {
      id: "race-set",
      user_id: "A",
      workout_entry_id: "edit-race",
      revision: 0,
      position: 1,
      weight: "50",
      reps: 8,
      rir: "2",
      set_type: "working",
      load_type: "external",
    },
  ];
  mount();
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  const item = within(diary).getAllByRole("listitem")[0]!;
  fireEvent.click(within(item).getByRole("button"));
  fireEvent.click(within(item).getByRole("button", { name: "Изменить подход 1" }));
  fireEvent.change(within(item).getByLabelText("Вес подхода 1"), { target: { value: "51.5" } });
  return item;
}

it("preserves unsaved values and the original base revision on a conflict/refetch", async () => {
  const item = await openEditableSet();
  fake.state.rows.workout_entry_sets[0]!["revision"] = 1;
  fake.state.rows.workout_entry_sets[0]!["weight"] = "70";
  fake.state.editErrorCode = "40001";
  fireEvent.click(within(item).getByRole("button", { name: "Сохранить подход 1" }));
  expect(await within(item).findByText(/Подход изменён в другом окне/)).toBeVisible();
  expect(within(item).getByLabelText("Вес подхода 1")).toHaveValue("51.5");
  expect(fake.state.rpc).toHaveBeenCalledTimes(1);
  expect(fake.state.rpc).toHaveBeenCalledWith(
    "edit_workout_entry_set",
    expect.objectContaining({ _expected_revision: 0 }),
  );
});

it("retries a lost edit response with the same UUID and frozen payload", async () => {
  const item = await openEditableSet();
  fake.state.rpc.mockRejectedValueOnce(new Error("lost response"));
  fireEvent.click(within(item).getByRole("button", { name: "Сохранить подход 1" }));
  expect(await within(item).findByText(/Результат изменения не подтверждён/)).toBeVisible();
  expect(within(item).getByLabelText("Вес подхода 1")).toBeDisabled();
  const first = fake.state.rpc.mock.calls[0];
  fireEvent.click(within(item).getByRole("button", { name: "Сохранить подход 1" }));
  await waitFor(() => expect(fake.state.rpc).toHaveBeenCalledTimes(2));
  expect(fake.state.rpc.mock.calls[1]).toEqual(first);
  await waitFor(() =>
    expect(within(item).queryByLabelText("Вес подхода 1")).not.toBeInTheDocument(),
  );
});

it("uses the current day name immediately after rename without changing historical snapshots", async () => {
  fake.state.rows.program_days![0]!["name"] = "Upper 1";
  fake.state.rows.workout_entries = [
    { ...entry("old-1", dateDaysAgo(0), 50, [8]), day_name: "Upper 1" },
    { ...entry("old-2", dateDaysAgo(5), 45, [7]), day_name: "Upper 1" },
  ];
  const persisted = structuredClone(fake.state.rows.workout_entries);
  mount();
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(diary).getByText(`${displayedDate(dateDaysAgo(0))} · Upper 1`)).toBeVisible();
  fake.state.rows.program_days![0]!["name"] = "Push";
  act(() =>
    qc.setQueryData<Day[]>(userKeys.days("A"), (old) =>
      old?.map((day) => (day.id === "day-1" ? { ...day, name: "Push" } : day)),
    ),
  );
  expect(await screen.findByRole("option", { name: "Push" })).toHaveValue("day-1");
  fireEvent.click(within(diary).getByRole("button", { name: "Всё время" }));
  expect(within(diary).getAllByText(/ · Push$/)).toHaveLength(2);
  expect(within(diary).queryByText(/ · Upper 1$/)).toBeNull();
  expect(fake.state.rows.workout_entries!.map((row) => row["day_name"])).toEqual([
    "Upper 1",
    "Upper 1",
  ]);
  expect(fake.state.rows.workout_entries).toEqual(persisted);
  expect(screen.getAllByRole("option", { name: "Push" })).toHaveLength(1);
});

it("shows a renamed day for an archived exercise when archive visibility is enabled", async () => {
  localStorage.setItem("app:archive-settings:v1:A", "2");
  fake.state.rows.program_days![0]!["name"] = "Push";
  fake.state.rows.program_exercises![0]!.archived_at = "2026-10-01";
  fake.state.rows.workout_entries = [
    { ...entry("archived", dateDaysAgo(0), 50, [8]), day_name: "Upper 1" },
  ];
  mount();
  expect(await screen.findByRole("option", { name: "Жим лёжа (архив)" })).toBeInTheDocument();
  expect(await screen.findByText(`${displayedDate(dateDaysAgo(0))} · Push`)).toBeInTheDocument();
  expect(fake.state.rows.workout_entries![0]!["day_name"]).toBe("Upper 1");
});

it("uses each entry's historical day UUID after an exercise moves", async () => {
  fake.state.rows.program_days![0]!["name"] = "Push";
  fake.state.rows.program_exercises![0]!.day_id = "day-2";
  fake.state.rows.workout_entries = [
    { ...entry("before-move", dateDaysAgo(0), 50, [8]), day_name: "Upper 1" },
    { ...entry("after-move", dateDaysAgo(0), 52, [7]), day_id: "day-2", day_name: "Ноги" },
  ];
  mount();
  fireEvent.change(await screen.findByLabelText("День записей"), {
    target: { value: "day-2" },
  });
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(diary).getByText(`${displayedDate(dateDaysAgo(0))} · Push`)).toBeInTheDocument();
  expect(within(diary).getByText(`${displayedDate(dateDaysAgo(0))} · Ноги`)).toBeInTheDocument();
  expect(fake.state.rows.workout_entries!.map((row) => row["day_id"])).toEqual(["day-1", "day-2"]);
});

it("uses a deleted day's snapshot and localizes a fully unassigned entry", async () => {
  localStorage.setItem("app:archive-settings:v1:A", "2");
  fake.state.rows.program_days = [];
  fake.state.rows.program_exercises![0]!.day_id = null;
  fake.state.rows.workout_entries = [
    {
      ...entry("deleted-day", dateDaysAgo(0), 50, [8]),
      day_id: "deleted-day-id",
      day_name: "Upper 1",
    },
    { ...entry("unknown-day", dateDaysAgo(0), 45, [7]), day_id: null, day_name: null },
  ];
  mount();
  fireEvent.change(await screen.findByLabelText("День записей"), {
    target: { value: "unassigned" },
  });
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(diary).getByText(`${displayedDate(dateDaysAgo(0))} · Upper 1`)).toBeVisible();
  expect(
    within(diary).getByText(`${displayedDate(dateDaysAgo(0))} · Без назначенного дня`),
  ).toBeVisible();
});

it("keeps different day UUIDs separate even when their names match", async () => {
  fake.state.rows.program_days![0]!["name"] = "Push";
  fake.state.rows.program_days![1]!["name"] = "Push";
  fake.state.rows.workout_entries = [
    { ...entry("first-day", dateDaysAgo(0), 50, [8]), day_name: "Old first" },
    {
      ...entry("second-day", dateDaysAgo(0), 80, [5]),
      exercise_id: "squat",
      day_id: "day-2",
      day_name: "Old second",
    },
  ];
  mount();
  const daySelector = await screen.findByLabelText("День записей");
  expect(
    screen.getAllByRole("option", { name: "Push" }).map((option) => option.getAttribute("value")),
  ).toEqual(["day-1", "day-2"]);
  expect(
    within(await screen.findByRole("region", { name: "Дневник записей упражнения" })).getAllByRole(
      "listitem",
    )[0],
  ).toHaveTextContent("50 кг");
  expect(screen.queryByText("80 кг · 5")).toBeNull();
  fireEvent.change(daySelector, { target: { value: "day-2" } });
  expect(
    within(await screen.findByRole("region", { name: "Дневник записей упражнения" })).getAllByRole(
      "listitem",
    )[0],
  ).toHaveTextContent("80 кг");
  expect(screen.queryByText("50 кг · 8")).toBeNull();
});

it("hides archived choices by default and does not show another exercise after hiding one", async () => {
  fake.state.rows.program_exercises!.push({
    ...fake.state.rows.program_exercises![0]!,
    id: "archived-press",
    name: "Архивный жим",
    archived_at: "2026-10-01",
  });
  fake.state.rows.workout_entries!.push({
    ...entry("archived-entry", dateDaysAgo(0), 90, [3]),
    exercise_id: "archived-press",
  });
  mount();
  expect(await screen.findByRole("combobox", { name: "Упражнение записей" })).toBeVisible();
  expect(screen.queryByRole("option", { name: /Архивный жим/ })).toBeNull();
  act(() => {
    localStorage.setItem("app:archive-settings:v1:A", "2");
    window.dispatchEvent(new Event("archive-preferences-changed"));
  });
  fireEvent.change(screen.getByLabelText("Упражнение записей"), {
    target: { value: "archived-press" },
  });
  expect(
    within(await screen.findByRole("region", { name: "Дневник записей упражнения" })).getAllByRole(
      "listitem",
    )[0],
  ).toHaveTextContent("90 кг");
  act(() => {
    localStorage.setItem("app:archive-settings:v1:A", "0");
    window.dispatchEvent(new Event("archive-preferences-changed"));
  });
  expect(screen.getAllByText("Выберите упражнение").length).toBeGreaterThan(0);
  expect(screen.queryByRole("region", { name: "Дневник записей упражнения" })).toBeNull();
});

it("filters diary entries by date and sorts weights in both directions", async () => {
  mount();
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(diary).getByRole("heading", { name: "Записи · 3" })).toBeInTheDocument();

  fireEvent.click(within(diary).getByRole("button", { name: "Сегодня" }));
  let updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(updatedDiary).getByRole("heading", { name: "Записи · 1" })).toBeInTheDocument();
  expect(within(updatedDiary).getAllByRole("listitem")[0]).toHaveTextContent("50 кг");
  expect(within(updatedDiary).getAllByRole("listitem")).toHaveLength(1);

  fireEvent.click(within(updatedDiary).getByRole("button", { name: "7 дней" }));
  updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(updatedDiary).getByRole("heading", { name: "Записи · 2" })).toBeInTheDocument();
  expect(within(updatedDiary).queryByText("40 кг · 10")).not.toBeInTheDocument();

  fireEvent.click(within(updatedDiary).getByRole("button", { name: "Всё время" }));
  updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  chooseSort(updatedDiary, "Вес: по возрастанию");
  updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  await waitFor(() => {
    expect(within(updatedDiary).getAllByRole("listitem")[0]).toHaveTextContent("35 кг");
  });
  chooseSort(updatedDiary, "Вес: по убыванию");
  updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  await waitFor(() => {
    expect(within(updatedDiary).getAllByRole("listitem")[0]).toHaveTextContent("50 кг");
  });
  chooseSort(updatedDiary, "Сначала новые");
  updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(updatedDiary).getAllByRole("listitem")[0]).toHaveTextContent("50 кг");
});

it("persists sort per user and marks the current choice with a check", async () => {
  mount();
  let diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  const trigger = within(diary).getByRole("button", { name: "Сортировка записей" });
  expect(trigger).toHaveClass("h-11", "w-11");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  expect(screen.getByRole("menuitemradio", { name: "Сначала новые" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Вес: по возрастанию" }));
  expect(localStorage.getItem("app:entries-sort:v1:A")).toBe("weight-asc");

  fireEvent.change(screen.getByLabelText("День записей"), { target: { value: "day-2" } });
  diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  fireEvent.pointerDown(within(diary).getByRole("button", { name: "Сортировка записей" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByRole("menuitemradio", { name: "Вес: по возрастанию" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

it.each([false, true])(
  "B07 reads archived legacy history without backfill (no days: %s)",
  async (noDays) => {
    localStorage.setItem("app:archive-settings:v1:A", "2");
    if (noDays) fake.state.rows.program_days = [];
    fake.state.rows.program_exercises!.push({
      id: "legacy",
      user_id: "A",
      day_id: null,
      name: "Старый жим",
      position: 2,
      archived_at: "2026-10-01",
    });
    fake.state.rows.workout_entries!.push({
      ...entry("legacy-entry", dateDaysAgo(0), 65, [8, 7]),
      exercise_id: "legacy",
      day_id: null,
      day_name: "Историческое название",
    });
    mount();
    await screen.findByRole("combobox", { name: "День записей" });
    fireEvent.change(screen.getByLabelText("День записей"), { target: { value: "unassigned" } });
    expect(
      within(
        await screen.findByRole("region", { name: "Дневник записей упражнения" }),
      ).getAllByRole("listitem")[0],
    ).toHaveTextContent("65 кг");
    expect(
      screen.getByText(`${displayedDate(dateDaysAgo(0))} · Историческое название`),
    ).toBeInTheDocument();
    expect(
      fake.state.rows.program_exercises!.find((row) => row.id === "legacy")?.day_id,
    ).toBeNull();
    expect(fake.state.calls.every((call) => call.operation === "select")).toBe(true);
  },
);

it("B08 fetches bounded Records pages and preserves exact full-history weight sorting", async () => {
  fake.state.maxRows = 137;
  fake.state.rows.workout_entries = Array.from({ length: 1200 }, (_, index) => ({
    ...entry(`entry-${String(index).padStart(4, "0")}`, dateDaysAgo(0), index, [8]),
    created_at: `${dateDaysAgo(0)}T10:00:${String(index % 60).padStart(2, "0")}Z`,
  }));
  mount();
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(diary).getByRole("heading", { name: "Записи · 1200" })).toBeInTheDocument();
  expect(within(diary).getAllByRole("listitem")).toHaveLength(20);
  expect(within(diary).getByText("Страница 1 из 60")).toBeInTheDocument();
  expect(fake.state.calls.filter((call) => call.table === "workout_entries")).toHaveLength(1);
  fireEvent.click(within(diary).getByRole("button", { name: "Далее" }));
  await screen.findByText("Страница 2 из 60");
  await waitFor(() =>
    expect(fake.state.calls.filter((call) => call.table === "workout_entries")).toHaveLength(2),
  );
  let updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  chooseSort(updatedDiary, "Вес: по убыванию");
  await waitFor(() =>
    expect(fake.state.calls.filter((call) => call.table === "workout_entries").length).toBe(12),
  );
  updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(updatedDiary).getByText("Страница 1 из 60")).toBeInTheDocument();
  expect(within(updatedDiary).getAllByRole("listitem")[0]).toHaveTextContent(/1\s199 кг/);
  fireEvent.click(within(updatedDiary).getByRole("button", { name: "Далее" }));
  await screen.findByText("Страница 2 из 60");
  updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  fireEvent.click(within(updatedDiary).getByRole("button", { name: "Сегодня" }));
  updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(updatedDiary).getByText("Страница 1 из 60")).toBeInTheDocument();
  chooseSort(updatedDiary, "Вес: по возрастанию");
  updatedDiary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(updatedDiary).getAllByRole("listitem")[0]).toHaveTextContent("0 кг");
  expect(within(updatedDiary).getAllByRole("listitem")).toHaveLength(20);
}, 15_000);
