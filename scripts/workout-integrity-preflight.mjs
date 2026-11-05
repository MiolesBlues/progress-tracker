import { readFileSync } from "node:fs";

export const workoutIntegritySql = readFileSync(
  new URL("./workout-integrity-preflight.sql", import.meta.url),
  "utf8",
);

const checks = {
  missing_operation_snapshot: "existing entries lack a required per-set retry snapshot",
  invalid_operation_snapshot: "original set snapshot is malformed or differs from its save payload",
  legacy_fields_mismatch: "legacy entry fields differ from the original save payload",
  invalid_current_sets: "current sets have invalid ownership, values, count or ordering",
  legacy_value_mismatch: "untouched legacy set values differ from their original snapshot",
  missing_original_sets: "original sets are missing without an owner deletion tombstone",
  tombstone_conflicts: "deleted set identifiers are present in current sets",
};

// Only fixed diagnostics leave the query: never emit personal rows or snapshots.
export function workoutIntegrityFailures(counters) {
  return Object.entries(checks).flatMap(([name, message]) => {
    if (!Number.isSafeInteger(counters?.[name]) || counters[name] < 0)
      throw new Error("Workout integrity assertions did not return valid counters");
    return counters[name] === 0 ? [] : [message];
  });
}
