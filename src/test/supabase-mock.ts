import { vi } from "vitest";

export type Row = Record<string, unknown> & {
  id?: string;
  position?: number;
  user_id?: string;
  archived_at?: string | null;
  day_id?: string | null;
};
const fake = vi.hoisted(() => {
  type Response = {
    data: Row[] | Row | null;
    error: { message: string } | null;
    count?: number | null;
  };
  const state = {
    rows: {
      program_days: [] as Row[],
      program_exercises: [] as Row[],
      workout_entries: [] as Row[],
      workout_entry_sets: [] as Row[],
    } as Record<string, Row[]> & {
      program_days: Row[];
      program_exercises: Row[];
      workout_entries: Row[];
      workout_entry_sets: Row[];
    },
    calls: [] as {
      table: string;
      operation: string;
      values: Row;
      filters: Row;
      signal?: AbortSignal;
    }[],
    authChange: null as ((event: string, session: { user: { id: string } } | null) => void) | null,
    userId: null as string | null,
    nextError: null as string | null,
    deletionCapability: true,
    readErrors: {} as Record<string, string>,
    delaySelect: null as { table: string; filters: Row; promise: Promise<Response> } | null,
    saveRpc: vi.fn(
      async (
        args: Record<string, unknown>,
      ): Promise<{ data: string | null; error: { code: string; message: string } | null }> => ({
        data: String(args["_id"]),
        error: null,
      }),
    ),
    delayMutation: null as Promise<void> | null,
    sequence: 0,
    maxRows: Infinity,
    rpc: vi.fn(
      async (
        name: string,
        args: { _ids?: string[]; _day_id?: string; _exercise_id?: string } = {},
      ) => {
        if (name === "archive_deletion_capabilities")
          return { data: state.deletionCapability, error: null };
        if (state.nextError) {
          const message = state.nextError;
          state.nextError = null;
          return { error: { message } };
        }
        if (name === "delete_archived_program_day") {
          const day = state.rows.program_days.find(
            (row) => row.id === args._day_id && row.user_id === state.userId,
          );
          if (!day) return { data: false, error: null };
          if (!day.archived_at)
            return { data: null, error: { message: "Only archived objects may be deleted" } };
          state.rows.program_exercises.forEach((row) => {
            if (row.user_id === state.userId && row.day_id === day.id) row.day_id = null;
          });
          state.rows.workout_entries.forEach((row) => {
            if (row.user_id === state.userId && row.day_id === day.id) row.day_id = null;
          });
          state.rows.program_days.splice(state.rows.program_days.indexOf(day), 1);
          return { data: true, error: null };
        }
        if (name === "delete_archived_program_exercise") {
          const exercise = state.rows.program_exercises.find(
            (row) => row.id === args._exercise_id && row.user_id === state.userId,
          );
          if (!exercise) return { data: false, error: null };
          if (!exercise.archived_at)
            return { data: null, error: { message: "Only archived objects may be deleted" } };
          state.rows.workout_entries = state.rows.workout_entries.filter(
            (row) => !(row.user_id === state.userId && row["exercise_id"] === exercise.id),
          );
          state.rows.program_exercises.splice(state.rows.program_exercises.indexOf(exercise), 1);
          return { data: true, error: null };
        }
        const table = name === "reorder_program_days" ? "program_days" : "program_exercises";
        args._ids!.forEach((id, position) => {
          const row = state.rows[table]!.find((item) => item.id === id);
          if (row) row.position = position;
        });
        return { error: null };
      },
    ),
  };
  function from(table: string) {
    let operation = "select";
    let values: Row = {};
    const filters: Row = {};
    const arrayFilters: { key: string; values: unknown[] }[] = [];
    const orders: { key: string; ascending: boolean }[] = [];
    const bounds: { key: string; value: string; lower: boolean }[] = [];
    let rangeFrom = 0;
    let rangeTo = Infinity;
    let single = false;
    let signal: AbortSignal | undefined;
    async function execute(): Promise<Response> {
      state.calls.push({ table, operation, values, filters, ...(signal ? { signal } : {}) });
      if (operation === "select" && state.readErrors[table])
        return { data: null, error: { message: state.readErrors[table]! } };
      if (
        operation === "select" &&
        state.delaySelect?.table === table &&
        Object.entries(state.delaySelect.filters).every(([key, value]) => filters[key] === value)
      ) {
        const delayed = state.delaySelect.promise;
        state.delaySelect = null;
        return delayed;
      }
      if (state.nextError) {
        const message = state.nextError;
        state.nextError = null;
        return { data: null, error: { message } };
      }
      const rows = state.rows[table]!;
      let found = rows.filter(
        (row) =>
          Object.entries(filters).every(([key, value]) => row[key] === value) &&
          arrayFilters.every(({ key, values }) => values.includes(row[key])) &&
          bounds.every(({ key, value, lower }) =>
            lower ? String(row[key]) >= value : String(row[key]) <= value,
          ),
      );
      if (operation === "insert") {
        const row = {
          id: `new-${++state.sequence}`,
          archived_at: null,
          target_sets: null,
          target_reps: null,
          working_weight: null,
          example_reps: null,
          ...values,
        };
        rows.push(row);
        found = [row];
      } else if (operation === "update") found.forEach((row) => Object.assign(row, values));
      found = [...found].sort((a, b) => {
        for (const { key, ascending } of orders) {
          if (a[key] !== b[key])
            return (
              String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true }) *
              (ascending ? 1 : -1)
            );
        }
        return 0;
      });
      if (operation !== "select" && state.delayMutation) {
        const delay = state.delayMutation;
        state.delayMutation = null;
        await delay;
      }
      const count = found.length;
      found = found.slice(rangeFrom, Math.min(rangeTo + 1, rangeFrom + state.maxRows));
      return {
        data: single ? (found[0] ?? null) : found.map((row) => ({ ...row })),
        count,
        error: null,
      };
    }
    const builder = {
      select: (_columns?: string) => builder,
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return builder;
      },
      in: (key: string, values: unknown[]) => {
        arrayFilters.push({ key, values });
        return builder;
      },
      gte: (key: string, value: string) => {
        bounds.push({ key, value, lower: true });
        return builder;
      },
      lte: (key: string, value: string) => {
        bounds.push({ key, value, lower: false });
        return builder;
      },
      range: (from: number, to: number) => {
        rangeFrom = from;
        rangeTo = to;
        return builder;
      },
      order: (key: string, options?: { ascending?: boolean }) => {
        orders.push({ key, ascending: options?.ascending ?? true });
        return builder;
      },
      limit: (count: number) => {
        rangeTo = count - 1;
        return builder;
      },
      insert: (row: Row) => {
        operation = "insert";
        values = row;
        return builder;
      },
      update: (row: Row) => {
        operation = "update";
        values = row;
        return builder;
      },
      abortSignal: (value: AbortSignal) => {
        signal = value;
        return builder;
      },
      single: () => {
        single = true;
        return builder;
      },
      maybeSingle: () => {
        single = true;
        return builder;
      },
      then: (resolve: (result: Response) => unknown, reject?: (error: unknown) => unknown) =>
        execute().then(resolve, reject),
    };
    return builder;
  }
  return { ...state, from, state };
});
export { fake };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fake.from,
    rpc: (name: string, args: { _ids?: string[] } & Record<string, unknown> = {}) => ({
      abortSignal: () =>
        name === "save_workout_entry" || name === "save_workout_entry_sets"
          ? fake.state.saveRpc(args)
          : fake.state.rpc(name, args),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        fake.state.rpc(name, args).then(resolve, reject),
    }),
    auth: {
      onAuthStateChange: (callback: typeof fake.state.authChange) => {
        fake.state.authChange = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));

export function authEvent(event: string, userId: string | null) {
  fake.state.userId = userId;
  fake.state.authChange?.(event, userId ? { user: { id: userId } } : null);
}
export function resetFake() {
  fake.state.userId = null;
  for (const key of Object.keys(fake.state.rows)) fake.state.rows[key] = [];
  fake.state.calls.length = 0;
  fake.state.nextError = null;
  fake.state.deletionCapability = true;
  fake.state.readErrors = {};
  fake.state.delaySelect = null;
  fake.state.saveRpc.mockReset();
  fake.state.saveRpc.mockImplementation(async (args) => {
    const id = String(args["_id"]);
    if (!fake.state.rows.workout_entries.some((row) => row.id === id)) {
      fake.state.rows.workout_entries.push({
        id,
        user_id: fake.state.userId ?? "",
        exercise_id: args["_exercise_id"],
        performed_on: args["_performed_on"],
        created_at: new Date().toISOString(),
        weight: args["_weight"],
        reps: args["_reps"],
        rir: args["_rir"],
        notes: args["_notes"],
      });
    }
    return { data: id, error: null };
  });
  fake.state.delayMutation = null;
  fake.state.sequence = 0;
  fake.state.maxRows = Infinity;
  fake.state.rpc.mockClear();
}
