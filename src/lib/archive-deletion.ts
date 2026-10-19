export type PendingArchiveDeletion = { kind: "day" | "exercise"; id: string };

const key = (userId: string) => `archive-delete:pending:v1:${userId}`;

export function readPendingArchiveDeletions(userId: string): PendingArchiveDeletion[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key(userId));
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is PendingArchiveDeletion =>
        !!item &&
        typeof item === "object" &&
        ((item as PendingArchiveDeletion).kind === "day" ||
          (item as PendingArchiveDeletion).kind === "exercise") &&
        typeof (item as PendingArchiveDeletion).id === "string",
    );
  } catch {
    return [];
  }
}

export function markArchiveDeletionPending(userId: string, deletion: PendingArchiveDeletion) {
  const existing = readPendingArchiveDeletions(userId).filter(
    (item) => item.kind !== deletion.kind || item.id !== deletion.id,
  );
  localStorage.setItem(key(userId), JSON.stringify([...existing, deletion]));
}

export function clearArchiveDeletionPending(userId: string, deletion: PendingArchiveDeletion) {
  const remaining = readPendingArchiveDeletions(userId).filter(
    (item) => item.kind !== deletion.kind || item.id !== deletion.id,
  );
  if (remaining.length) localStorage.setItem(key(userId), JSON.stringify(remaining));
  else localStorage.removeItem(key(userId));
}
