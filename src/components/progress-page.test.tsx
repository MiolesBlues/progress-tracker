import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { authEvent, fake, resetFake } from "@/test/supabase-mock";
import { AccountBoundary, SessionProvider } from "@/lib/session";
import { ProgressPage } from "./progress-page";
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ data }: { data: unknown }) => (
    <div data-testid="series">{JSON.stringify(data)}</div>
  ),
  Area: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));
let qc: QueryClient;
beforeEach(() => {
  resetFake();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fake.state.rows.program_days = [
    { id: "day", user_id: "A", name: "Силовой", archived_at: "2020-01-01", position: 0 },
  ];
  fake.state.rows.program_exercises = [
    {
      id: "ex",
      user_id: "A",
      day_id: "day",
      name: "Жим",
      working_weight: null,
      position: 0,
      archived_at: "2020-01-01",
    },
  ];
});
afterEach(() => {
  cleanup();
  qc.clear();
});
function mount() {
  render(
    <QueryClientProvider client={qc}>
      <SessionProvider onIdentityChange={() => {}}>
        <AccountBoundary verifiedUserId="A">
          <ProgressPage />
        </AccountBoundary>
      </SessionProvider>
    </QueryClientProvider>,
  );
  act(() => authEvent("SIGNED_IN", "A"));
}
it("explains that invalid legacy results need review and leaves the saved data unchanged", async () => {
  const legacy = {
    id: "legacy",
    user_id: "A",
    exercise_id: "ex",
    performed_on: "2020-10-05",
    weight: 50,
    reps: [null, 8],
  };
  fake.state.rows.workout_entries = [legacy];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Архивная история" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("данные требуют отдельной проверки");
  expect(legacy.reps).toEqual([null, 8]);
  expect(screen.queryByLabelText("Тренировка для сравнения")).not.toBeInTheDocument();
});
const entry = (id: string, date: string, weight = 50) => ({
  id,
  user_id: "A",
  exercise_id: "ex",
  performed_on: date,
  created_at: `${date}T10:00:00Z`,
  weight,
  reps: [8, 8, 7, 6],
  rir: 2,
  notes: null,
  day_name: "Старое имя дня",
});
it("selects an older workout independently of graph period and preserves archived history", async () => {
  fake.state.maxRows = 1;
  fake.state.rows.workout_entries = [
    entry("week", "2020-09-27", 40),
    entry("early", "2020-09-28", 50),
    entry("selected", "2020-09-28", 55),
    entry("later", "2020-10-05", 80),
    entry("future", "2099-01-01", 100),
  ];
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Архивная история" }));
  const select = await screen.findByLabelText("Тренировка для сравнения");
  fireEvent.change(select, { target: { value: "selected" } });
  const sessions = screen
    .getByRole("heading", { name: "С предыдущей сессией" })
    .closest("section")!;
  expect(within(sessions).getByText(/50 → 55 кг/)).toHaveTextContent("+10%");
  const week = screen
    .getByRole("heading", { name: "С прошлой календарной неделей" })
    .closest("section")!;
  expect(within(week).getByText(/40 → 55 кг/)).toHaveTextContent("+37,5%");
  expect(within(week).getByText(/21\.09\.2020 — 27\.09\.2020/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Всё время" }));
  expect(screen.getByText("Записи за период (4)")).toBeInTheDocument();
  expect(screen.getByTestId("series")).not.toHaveTextContent("2099");
  expect(screen.getByLabelText("Тренировка для сравнения")).toHaveValue("selected");
});
it("shows every history page and never silently stops at twenty records", async () => {
  fake.state.rows.workout_entries = Array.from({ length: 23 }, (_, i) =>
    entry(String(i).padStart(3, "0"), "2020-10-05"),
  );
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Архивная история" }));
  await screen.findByLabelText("Тренировка для сравнения");
  fireEvent.click(screen.getByRole("button", { name: "Всё время" }));
  expect(screen.getByText("Записи за период (23)")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(20);
  fireEvent.click(screen.getByRole("button", { name: "Далее" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByText("2 / 2")).toBeInTheDocument();
});
it("load error hides all comparison percentages and offers Retry", async () => {
  fake.state.readErrors["workout_entries"] = "denied";
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Архивная история" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Расчёты недоступны");
  expect(screen.queryByLabelText("Тренировка для сравнения")).not.toBeInTheDocument();
  delete fake.state.readErrors["workout_entries"];
  fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
  expect(await screen.findByText("Записей пока нет")).toBeInTheDocument();
});

it("selects a day first, filters exercises, and never keeps the previous exercise's chart", async () => {
  fake.state.rows.program_days = [
    { id: "first", user_id: "A", name: "Push", archived_at: null, position: 0 },
    {
      id: "second",
      user_id: "A",
      name: "Очень длинное название тренировочного дня",
      archived_at: null,
      position: 1,
    },
  ];
  fake.state.rows.program_exercises = [
    { id: "ex-1", user_id: "A", day_id: "first", name: "Жим", archived_at: null, position: 0 },
    { id: "ex-2", user_id: "A", day_id: "second", name: "Тяга", archived_at: null, position: 0 },
  ];
  fake.state.rows.workout_entries = [
    { ...entry("one", "2020-10-05", 50), exercise_id: "ex-1" },
    { ...entry("two", "2020-10-05", 90), exercise_id: "ex-2" },
  ];
  mount();
  const day = await screen.findByLabelText("Тренировочный день");
  expect(day).toHaveValue("first");
  expect(screen.getByLabelText("Упражнение")).toHaveValue("ex-1");
  expect(screen.queryByRole("option", { name: /Жим · Push/ })).not.toBeInTheDocument();
  fireEvent.change(day, { target: { value: "second" } });
  expect(screen.getByLabelText("Упражнение")).toHaveValue("ex-2");
  expect(screen.queryByRole("option", { name: "Жим" })).not.toBeInTheDocument();
  expect(await screen.findByLabelText("Тренировка для сравнения")).toHaveValue("two");
});
