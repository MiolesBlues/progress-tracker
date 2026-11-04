import { beforeEach, expect, it } from "vitest";
import {
  executeProgramCreate,
  prepareProgramCreate,
  readPendingProgramCreate,
} from "./program-create";

beforeEach(() => localStorage.clear());

it("persists one UUID and immutable payload across a remount and refuses payload changes", () => {
  const first = prepareProgramCreate("user-a", "day", { name: "Legs", position: 1 });
  const restored = readPendingProgramCreate("user-a", "day");
  expect(restored).toEqual(first);
  expect(prepareProgramCreate("user-a", "day", { name: "Legs", position: 1 }).id).toBe(first.id);
  expect(() => prepareProgramCreate("user-a", "day", { name: "Back", position: 1 })).toThrow(
    "Предыдущее создание ещё не подтверждено",
  );
});

it("isolates same display names between users with different object identities", () => {
  const a = prepareProgramCreate("user-a", "exercise", { name: "Bench press", target_sets: 3 });
  const b = prepareProgramCreate("user-b", "exercise", { name: "Bench press", target_sets: 3 });
  expect(a.id).not.toBe(b.id);
  expect(a.userId).not.toBe(b.userId);
});

it("retries a committed insert with the same UUID and accepts only the exact stored payload", async () => {
  const operation = prepareProgramCreate("user-a", "day", { name: "Legs", position: 1 });
  let row: Record<string, unknown> | null = null;
  let attempts = 0;
  const insert = async () => {
    attempts += 1;
    if (!row) {
      row = { id: operation.id, user_id: "user-a", ...operation.payload };
      throw new Error("lost response");
    }
    return { error: { code: "23505", message: "duplicate" } };
  };
  const read = async () => {
    if (attempts === 1) throw new Error("temporary read failure");
    return { row, error: null };
  };
  await expect(executeProgramCreate(operation, insert, read)).rejects.toMatchObject({
    code: "unknown",
  });
  await expect(executeProgramCreate(operation, insert, read)).resolves.toBeUndefined();
  expect(attempts).toBe(2);
  expect(row).toMatchObject({ id: operation.id, user_id: "user-a", name: "Legs" });
});

it("does not accept a row with the same UUID and different content", async () => {
  const operation = prepareProgramCreate("user-a", "day", { name: "Legs", position: 1 });
  await expect(
    executeProgramCreate(
      operation,
      async () => {
        throw new Error("lost response");
      },
      async () => ({
        row: { id: operation.id, user_id: "user-a", name: "Back", position: 1 },
        error: null,
      }),
    ),
  ).rejects.toMatchObject({ code: "conflict" });
});

it("keeps the actionable stale-program message for a server 22023 rejection", async () => {
  const operation = prepareProgramCreate("user-a", "exercise", { name: "Bench", target_sets: 3 });
  await expect(
    executeProgramCreate(
      operation,
      async () => ({ error: { code: "22023", message: "stale day" } }),
      async () => ({ row: null, error: null }),
    ),
  ).rejects.toMatchObject({
    code: "rejected",
    message: "Программа изменилась. Обновите страницу и повторите действие.",
  });
});
