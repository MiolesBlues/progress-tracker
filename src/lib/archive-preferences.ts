import { useSyncExternalStore } from "react";

const prefix = "app:archive-settings:v1:";
const changed = "archive-preferences-changed";
const DELETE_ENABLED = 1;
const SHOW_ARCHIVE = 2;
const memory = new Map<string, number>();

function read(userId: string | null): number {
  if (!userId || typeof window === "undefined") return 0;
  try {
    if (memory.has(userId)) return memory.get(userId)!;
    const value = Number(localStorage.getItem(`${prefix}${userId}`));
    return Number.isInteger(value) ? value & (DELETE_ENABLED | SHOW_ARCHIVE) : 0;
  } catch {
    return 0;
  }
}

function write(userId: string | null, flag: number, enabled: boolean) {
  if (!userId || typeof window === "undefined") return;
  const next = enabled ? read(userId) | flag : read(userId) & ~flag;
  try {
    localStorage.setItem(`${prefix}${userId}`, String(next));
    memory.delete(userId);
  } catch {
    memory.set(userId, next);
  }
  window.dispatchEvent(new Event(changed));
}

export function useArchivePreferences(userId: string | null) {
  const bits = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener(changed, onStoreChange);
      window.addEventListener("storage", onStoreChange);
      return () => {
        window.removeEventListener(changed, onStoreChange);
        window.removeEventListener("storage", onStoreChange);
      };
    },
    () => read(userId),
    () => 0,
  );
  return {
    deletionEnabled: !!(bits & DELETE_ENABLED),
    showArchive: !!(bits & SHOW_ARCHIVE),
    setDeletionEnabled: (value: boolean) => write(userId, DELETE_ENABLED, value),
    setShowArchive: (value: boolean) => write(userId, SHOW_ARCHIVE, value),
    available: !!userId,
  };
}
