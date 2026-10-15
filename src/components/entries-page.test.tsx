import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fake, resetFake } from "@/test/supabase-mock";
import { toISO } from "@/lib/workout";
import { EntriesPage } from "./entries-page";
import { navigationTabs } from "@/lib/navigation";

vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()),
  useUserSession: () => ({ userId: "A" }),
}));

let qc: QueryClient;
function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toISO(date);
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

beforeEach(() => {
  resetFake();
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
    { ...entry("squat-entry", dateDaysAgo(0), 80, [5]), exercise_id: "squat", day_name: "Ноги" },
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
  expect(within(diary).getByText(`${dateDaysAgo(0)} · Верх тела`)).toBeInTheDocument();
  expect(within(diary).getByText("50 кг · 8 / 8 / 7")).toBeInTheDocument();
  expect(within(diary).getAllByText(/RIR 2/).length).toBeGreaterThan(0);
  expect(within(diary).getByText("Хорошее самочувствие")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("День записей"), { target: { value: "day-2" } });
  await waitFor(() => expect(screen.getByLabelText("Упражнение записей")).toHaveValue("squat"));
  expect(await screen.findByText("80 кг · 5")).toBeInTheDocument();
});

it("filters diary entries by date and sorts weights in both directions", async () => {
  mount();
  const diary = await screen.findByRole("region", { name: "Дневник записей упражнения" });
  expect(within(diary).getByRole("heading", { name: "Записи · 3" })).toBeInTheDocument();

  fireEvent.click(within(diary).getByRole("button", { name: "Сегодня" }));
  expect(within(diary).getByRole("heading", { name: "Записи · 1" })).toBeInTheDocument();
  expect(within(diary).getByText("50 кг · 8 / 8 / 7")).toBeInTheDocument();
  expect(within(diary).queryByText("45 кг · 8 / 8")).not.toBeInTheDocument();

  fireEvent.click(within(diary).getByRole("button", { name: "7 дней" }));
  expect(within(diary).getByRole("heading", { name: "Записи · 2" })).toBeInTheDocument();
  expect(within(diary).queryByText("40 кг · 10")).not.toBeInTheDocument();

  fireEvent.click(within(diary).getByRole("button", { name: "Всё время" }));
  fireEvent.change(within(diary).getByLabelText("Сортировка записей"), {
    target: { value: "weight-asc" },
  });
  await waitFor(() => {
    expect(within(diary).getAllByRole("listitem")[0]).toHaveTextContent("35 кг");
  });
  fireEvent.change(within(diary).getByLabelText("Сортировка записей"), {
    target: { value: "weight-desc" },
  });
  await waitFor(() => {
    expect(within(diary).getAllByRole("listitem")[0]).toHaveTextContent("50 кг");
  });
});

it.each([false, true])(
  "B07 reads archived legacy history without backfill (no days: %s)",
  async (noDays) => {
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
    expect(await screen.findByText("65 кг · 8 / 7")).toBeInTheDocument();
    expect(screen.getByText(`${dateDaysAgo(0)} · Историческое название`)).toBeInTheDocument();
    expect(
      fake.state.rows.program_exercises!.find((row) => row.id === "legacy")?.day_id,
    ).toBeNull();
    expect(fake.state.calls.every((call) => call.operation === "select")).toBe(true);
  },
);

it("B08 limits the DOM to 20 entries while loading every server page and resetting controls", async () => {
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
  expect(fake.state.calls.filter((call) => call.table === "workout_entries")).toHaveLength(9);
  fireEvent.click(within(diary).getByRole("button", { name: "Далее" }));
  expect(within(diary).getByText("Страница 2 из 60")).toBeInTheDocument();
  fireEvent.change(within(diary).getByLabelText("Сортировка записей"), {
    target: { value: "weight-desc" },
  });
  expect(within(diary).getByText("Страница 1 из 60")).toBeInTheDocument();
  expect(within(diary).getAllByRole("listitem")[0]).toHaveTextContent(/1\s199 кг/);
  fireEvent.click(within(diary).getByRole("button", { name: "Далее" }));
  fireEvent.click(within(diary).getByRole("button", { name: "Сегодня" }));
  expect(within(diary).getByText("Страница 1 из 60")).toBeInTheDocument();
  fireEvent.change(within(diary).getByLabelText("Сортировка записей"), {
    target: { value: "weight-asc" },
  });
  expect(within(diary).getAllByRole("listitem")[0]).toHaveTextContent("0 кг");
  expect(within(diary).getAllByRole("listitem")).toHaveLength(20);
});
