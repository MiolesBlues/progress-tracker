import { expect, expectTypeOf, it, vi } from "vitest";

const client = vi.hoisted(() => ({ access: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    get rpc() {
      client.access();
      return client.rpc;
    },
  },
}));

import { pendingRpc } from "./pending-rpc";

it("preserves the generated SDK signature and resolves the client only on invocation", () => {
  expect(client.access).not.toHaveBeenCalled();
  const builder = { abortSignal: vi.fn() };
  client.rpc.mockReturnValue(builder);
  const args = { _entry_id: "entry", _set_id: "set" };
  const options = { count: "exact" as const };
  expect(pendingRpc("delete_workout_entry_set", args, options)).toBe(builder);
  expect(client.rpc).toHaveBeenCalledWith("delete_workout_entry_set", args, options);
  expect(client.access).toHaveBeenCalledTimes(1);
});

// These examples are checked by tsc, never executed or sent to a backend.
function generatedContractExamples() {
  // @ts-expect-error unknown RPC names must fail
  pendingRpc("not_a_database_function", {});
  // @ts-expect-error a delete needs both parent and set IDs
  pendingRpc("delete_workout_entry_set", { _entry_id: "entry" });
  // @ts-expect-error UUID arguments cannot be numbers
  pendingRpc("delete_workout_entry_set", { _entry_id: 1, _set_id: "set" });
  // @ts-expect-error function arguments cannot be borrowed from another RPC
  pendingRpc("reorder_program_days", { _entry_id: "entry", _set_id: "set" });
  // @ts-expect-error unknown argument names must fail
  pendingRpc("delete_workout_entry_set", { _entry_id: "entry", _set_id: "set", _unknown: true });
  const result = pendingRpc("delete_workout_entry_set", {
    _entry_id: "entry",
    _set_id: "set",
  });
  type Result = Awaited<typeof result>;
  expectTypeOf<Result["data"]>().toEqualTypeOf<boolean | null>();
}
void generatedContractExamples;
