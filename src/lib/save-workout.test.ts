import { beforeEach, expect, it, vi } from "vitest";

const pending = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/pending-rpc", () => ({ pendingRpc: pending.rpc }));

import { SaveWorkoutError, updateWorkoutSet } from "./save-workout";

const set = {
  id: "set-1",
  position: 1,
  weight: "50",
  reps: 8,
  rir: "2",
  set_type: "working" as const,
  load_type: "external" as const,
};

function result(data: unknown, error: { message: string; code?: string } | null = null) {
  pending.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data, error }) });
}

beforeEach(() => vi.resetAllMocks());

it("accepts only explicit RPC true as a successful set update", async () => {
  result(true);
  await expect(updateWorkoutSet("entry-1", set, new AbortController().signal)).resolves.toBe(true);
  result(false);
  await expect(
    updateWorkoutSet("entry-1", set, new AbortController().signal),
  ).rejects.toMatchObject({
    rejected: true,
    message: "Подход больше недоступен. История обновлена; проверьте запись.",
  });
});

it("keeps authorization and conflict failures explicit", async () => {
  result(null, { code: "42501", message: "denied" });
  await expect(
    updateWorkoutSet("entry-1", set, new AbortController().signal),
  ).rejects.toMatchObject({
    rejected: true,
  });
  result(null, { code: "22023", message: "conflict" });
  await expect(
    updateWorkoutSet("entry-1", set, new AbortController().signal),
  ).rejects.toMatchObject({
    rejected: false,
    message: "Операция конфликтует с уже сохранёнными значениями.",
  });
});

it("treats a lost response as unknown and allows an idempotent retry", async () => {
  pending.rpc
    .mockReturnValueOnce({ abortSignal: () => Promise.reject(new Error("connection lost")) })
    .mockReturnValueOnce({ abortSignal: () => Promise.resolve({ data: true, error: null }) });
  await expect(
    updateWorkoutSet("entry-1", set, new AbortController().signal),
  ).rejects.toBeInstanceOf(SaveWorkoutError);
  await expect(updateWorkoutSet("entry-1", set, new AbortController().signal)).resolves.toBe(true);
  expect(pending.rpc).toHaveBeenCalledTimes(2);
  expect(pending.rpc.mock.calls[0]).toEqual(pending.rpc.mock.calls[1]);
});
