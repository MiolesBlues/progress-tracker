import { vi } from "vitest";

export type Row = Record<string, unknown> & {
  id?: string;
  position?: number;
  user_id?: string;
  archived_at?: string | null;
  day_id?: string | null;
};
const fake = vi.hoisted(() => {
  type Response = { data: Row[] | Row | null; error: { message: string } | null };
  const state = {
    rows: {
      program_days: [] as Row[],
      program_exercises: [] as Row[],
      workout_entries: [] as Row[],
    } as Record<string, Row[]> & {
      program_days: Row[];
      program_exercises: Row[];
      workout_entries: Row[];
    },
    calls: [] as {
      table: string;
      operation: string;
      values: Row;
      filters: Row;
      signal?: AbortSignal;
    }[],
    authChange: null as ((event: string, session: { user: { id: string } } | null) => void) | null,
    nextError: null as string | null,
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
    rpc: vi.fn(async (name: string, args: { _ids: string[]; _day_id?: string }) => {
      const table = name === "reorder_program_days" ? "program_days" : "program_exercises";
      args._ids.forEach((id, position) => {
        const row = state.rows[table]!.find((item) => item.id === id);
        if (row) row.position = position;
      });
      return { error: null };
    }),
  };
  function from(table: string) {
    let operation = "select";
    let values: Row = {};
    const filters: Row = {};
    const orders: string[] = [];
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
      let found = rows.filter((row) =>
        Object.entries(filters).every(([key, value]) => row[key] === value),
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
        for (const key of orders) {
          if (a[key] !== b[key]) return Number(a[key]) - Number(b[key]);
        }
        return 0;
      });
      if (operation !== "select" && state.delayMutation) {
        const delay = state.delayMutation;
        state.delayMutation = null;
        await delay;
      }
      return { data: single ? (found[0] ?? null) : found.map((row) => ({ ...row })), error: null };
    }
    const builder = {
      select: (_columns?: string) => builder,
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return builder;
      },
      gte: (_key: string, _value: unknown) => builder,
      order: (key: string) => {
        orders.push(key);
        return builder;
      },
      limit: (_count: number) => builder,
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
    rpc: (name: string, args: { _ids: string[] } & Record<string, unknown>) => ({
      abortSignal: () =>
        name === "save_workout_entry" ? fake.state.saveRpc(args) : fake.state.rpc(name, args),
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
  fake.state.authChange?.(event, userId ? { user: { id: userId } } : null);
}
export function resetFake() {
  for (const key of Object.keys(fake.state.rows)) fake.state.rows[key] = [];
  fake.state.calls.length = 0;
  fake.state.nextError = null;
  fake.state.readErrors = {};
  fake.state.delaySelect = null;
  fake.state.saveRpc.mockReset();
  fake.state.saveRpc.mockImplementation(async (args) => ({
    data: String(args["_id"]),
    error: null,
  }));
  fake.state.delayMutation = null;
  fake.state.sequence = 0;
  fake.state.rpc.mockClear();
}
