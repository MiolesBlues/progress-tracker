import { useSyncExternalStore } from "react";

const prefix = "app:archive-settings:v1:";
const changed = "archive-preferences-changed";
const DELETE_ENABLED = 1;
const SHOW_ARCHIVE = 2;
const AUTO_ADVANCE_DISABLED = 4;
const memory = new Map<string, number>();

function read(userId: string | null): number {
  if (!userId || typeof window === "undefined") return 0;
  try {
    if (memory.has(userId)) return memory.get(userId)!;
    const value = Number(localStorage.getItem(`${prefix}${userId}`));
    return Number.isInteger(value)
      ? value & (DELETE_ENABLED | SHOW_ARCHIVE | AUTO_ADVANCE_DISABLED)
      : 0;
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

export function useUserPreferences(userId: string | null) {
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
    autoAdvance: !(bits & AUTO_ADVANCE_DISABLED),
    setDeletionEnabled: (value: boolean) => write(userId, DELETE_ENABLED, value),
    setShowArchive: (value: boolean) => write(userId, SHOW_ARCHIVE, value),
    setAutoAdvance: (value: boolean) => write(userId, AUTO_ADVANCE_DISABLED, !value),
    available: !!userId,
  };
}

export function useArchivePreferences(userId: string | null) {
  const preferences = useUserPreferences(userId);
  return {
    deletionEnabled: preferences.deletionEnabled,
    showArchive: preferences.showArchive,
    setDeletionEnabled: preferences.setDeletionEnabled,
    setShowArchive: preferences.setShowArchive,
    available: preferences.available,
  };
}

export function useWorkoutPreferences(userId: string | null) {
  const preferences = useUserPreferences(userId);
  return {
    autoAdvance: preferences.autoAdvance,
    setAutoAdvance: preferences.setAutoAdvance,
    available: preferences.available,
  };
}
