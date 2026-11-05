import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mock.rpc } }));
import { editWorkoutSet, WorkoutEditConflict, type WorkoutSetEdit } from "./edit-workout-set";
const operation: WorkoutSetEdit = {
  operationId: "operation",
  entryId: "entry",
  expectedRevision: 4,
  set: {
    id: "set",
    position: 1,
    weight: "50",
    reps: 8,
    rir: null,
    set_type: "working",
    load_type: "external",
  },
};
beforeEach(() => mock.rpc.mockReset());
it("sends the frozen revision and operation ID and requires a confirmed numeric revision", async () => {
  mock.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: 5, error: null }) });
  await expect(editWorkoutSet(operation, new AbortController().signal)).resolves.toBe(5);
  expect(mock.rpc).toHaveBeenCalledWith(
    "edit_workout_entry_set",
    expect.objectContaining({ _operation_id: "operation", _expected_revision: 4 }),
  );
  mock.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: true, error: null }) });
  await expect(editWorkoutSet(operation, new AbortController().signal)).rejects.toMatchObject({
    rejected: false,
  });
});
it("surfaces conflicts as definitive rejections without an automatic retry", async () => {
  mock.rpc.mockReturnValue({
    abortSignal: () => Promise.resolve({ data: null, error: { code: "40001" } }),
  });
  await expect(editWorkoutSet(operation, new AbortController().signal)).rejects.toBeInstanceOf(
    WorkoutEditConflict,
  );
  expect(mock.rpc).toHaveBeenCalledTimes(1);
});
it("preserves the same operation payload on a retry after a lost response", async () => {
  mock.rpc
    .mockReturnValueOnce({ abortSignal: () => Promise.reject(new Error("network")) })
    .mockReturnValueOnce({ abortSignal: () => Promise.resolve({ data: 5, error: null }) });
  await expect(editWorkoutSet(operation, new AbortController().signal)).rejects.toMatchObject({
    rejected: false,
  });
  await expect(editWorkoutSet(operation, new AbortController().signal)).resolves.toBe(5);
  expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
});
