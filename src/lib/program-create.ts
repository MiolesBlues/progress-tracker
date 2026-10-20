export type ProgramCreateKind = "day" | "exercise";
export type ProgramCreatePayload = Record<string, string | number | null>;
export type PendingProgramCreate = {
  version: 1;
  userId: string;
  kind: ProgramCreateKind;
  id: string;
  payload: ProgramCreatePayload;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const key = (userId: string, kind: ProgramCreateKind) => `program:create:v1:${userId}:${kind}`;

export class ProgramCreateError extends Error {
  constructor(
    public readonly code: "unknown" | "conflict" | "rejected" | "storage",
    message: string,
  ) {
    super(message);
  }
}

export function readPendingProgramCreate(
  userId: string,
  kind: ProgramCreateKind,
): PendingProgramCreate | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key(userId, kind));
  } catch {
    throw new ProgramCreateError("storage", "Не удалось восстановить незавершённое создание.");
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as PendingProgramCreate).version !== 1 ||
      (parsed as PendingProgramCreate).userId !== userId ||
      (parsed as PendingProgramCreate).kind !== kind ||
      !uuid.test((parsed as PendingProgramCreate).id) ||
      !parsedPayload((parsed as PendingProgramCreate).payload)
    )
      throw new Error();
    return parsed as PendingProgramCreate;
  } catch {
    throw new ProgramCreateError("storage", "Не удалось восстановить незавершённое создание.");
  }
}

function parsedPayload(value: unknown): value is ProgramCreatePayload {
  return (
    !!value &&
    typeof value === "object" &&
    Object.values(value).every(
      (item) => item === null || typeof item === "string" || typeof item === "number",
    )
  );
}

export function prepareProgramCreate(
  userId: string,
  kind: ProgramCreateKind,
  payload: ProgramCreatePayload,
): PendingProgramCreate {
  const previous = readPendingProgramCreate(userId, kind);
  if (previous) {
    if (JSON.stringify(previous.payload) !== JSON.stringify(payload))
      throw new ProgramCreateError(
        "conflict",
        "Предыдущее создание ещё не подтверждено. Повторите его с сохранёнными значениями.",
      );
    return previous;
  }
  const operation: PendingProgramCreate = {
    version: 1,
    userId,
    kind,
    id: crypto.randomUUID(),
    payload: { ...payload },
  };
  try {
    localStorage.setItem(key(userId, kind), JSON.stringify(operation));
  } catch {
    throw new ProgramCreateError(
      "storage",
      "Не удалось сохранить операцию на устройстве. Запрос не отправлен.",
    );
  }
  return operation;
}

export function clearPendingProgramCreate(operation: PendingProgramCreate) {
  try {
    const stored = readPendingProgramCreate(operation.userId, operation.kind);
    if (stored?.id === operation.id) localStorage.removeItem(key(operation.userId, operation.kind));
  } catch {
    // Keeping a confirmed snapshot is safe: a later remount will reconcile its UUID.
  }
}

export function sameProgramCreatePayload(
  row: Record<string, unknown>,
  operation: PendingProgramCreate,
) {
  return (
    row["id"] === operation.id &&
    row["user_id"] === operation.userId &&
    Object.entries(operation.payload).every(([name, value]) => row[name] === value)
  );
}

export async function executeProgramCreate(
  operation: PendingProgramCreate,
  insert: () => PromiseLike<{ error: { code?: string; message: string } | null }>,
  read: () => PromiseLike<{
    row: Record<string, unknown> | null;
    error: { message: string } | null;
  }>,
) {
  let code: string | undefined;
  try {
    const result = await insert();
    if (!result.error) return;
    code = result.error.code;
  } catch {
    // A rejected fetch does not tell us whether Postgres committed the INSERT.
  }
  let existing: Awaited<ReturnType<typeof read>>;
  try {
    existing = await read();
  } catch {
    throw new ProgramCreateError(
      "unknown",
      "Результат создания не подтверждён. Повторите попытку.",
    );
  }
  if (existing.error)
    throw new ProgramCreateError(
      "unknown",
      "Результат создания не подтверждён. Повторите попытку.",
    );
  if (existing.row) {
    if (sameProgramCreatePayload(existing.row, operation)) return;
    throw new ProgramCreateError(
      "conflict",
      "Идентификатор создания уже занят другими данными. Объект не изменён.",
    );
  }
  if (["23514", "23503", "23502", "42501", "22023", "22P02"].includes(code ?? ""))
    throw new ProgramCreateError(
      "rejected",
      code === "22023"
        ? "Программа изменилась. Обновите страницу и повторите действие."
        : "Сервер отклонил создание. Проверьте данные и доступ.",
    );
  if (code === "23505")
    throw new ProgramCreateError(
      "conflict",
      "Идентификатор создания уже занят. Объект не изменён.",
    );
  throw new ProgramCreateError("unknown", "Результат создания не подтверждён. Повторите попытку.");
}
