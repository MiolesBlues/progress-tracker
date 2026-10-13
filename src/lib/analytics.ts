import { dailySeries, entryValue, toISO, weekRange, type EntryLike, type Metric } from "./workout";

export interface HistoryEntry extends EntryLike {
  id: string;
  user_id: string;
  exercise_id: string;
  created_at: string;
  rir: number | null;
  day_name: string | null;
  notes: string | null;
}

export const compareEntries = (a: HistoryEntry, b: HistoryEntry) =>
  a.performed_on.localeCompare(b.performed_on) ||
  Date.parse(a.created_at) - Date.parse(b.created_at) ||
  timestampMicros(a.created_at) - timestampMicros(b.created_at) ||
  a.id.localeCompare(b.id);

// PostgreSQL preserves microseconds, Date.parse only milliseconds. Do not lose this tie-break.
function timestampMicros(timestamp: string) {
  return Number(
    (timestamp.match(/\.(\d+)(?:Z|[+-]\d\d:?\d\d)$/)?.[1] ?? "").padEnd(6, "0").slice(3, 6),
  );
}

export function previousSessions(entries: HistoryEntry[], selected: HistoryEntry) {
  const earlier = entries
    .filter(
      (e) =>
        e.user_id === selected.user_id &&
        e.exercise_id === selected.exercise_id &&
        compareEntries(e, selected) < 0,
    )
    .sort(compareEntries);
  // Local calendar construction avoids UTC conversion moving a date across a week boundary.
  const date = new Date(`${selected.performed_on}T12:00:00`);
  date.setDate(date.getDate() - 7);
  const week = weekRange(date);
  const previousWeek = earlier.filter(
    (e) => e.performed_on >= week[0] && e.performed_on <= week[1],
  );
  return { session: earlier.at(-1) ?? null, week: previousWeek.at(-1) ?? null, weekRange: week };
}

export function compareSessions(selected: HistoryEntry, previous: HistoryEntry | null) {
  if (
    !previous ||
    previous.user_id !== selected.user_id ||
    previous.exercise_id !== selected.exercise_id ||
    compareEntries(previous, selected) >= 0
  )
    return null;
  const weightDelta = selected.weight - previous.weight;
  const warnings: string[] = [];
  // Any set-count change affects volume; >=2 RIR is a material effort difference.
  if (selected.reps.length !== previous.reps.length)
    warnings.push("Разное число подходов: условия несопоставимы.");
  if (selected.rir !== null && previous.rir !== null && Math.abs(selected.rir - previous.rir) >= 2)
    warnings.push("RIR отличается на 2 или больше: условия несопоставимы.");
  if (selected.rir === null || previous.rir === null)
    warnings.push("RIR указан не в обеих записях; усилие нельзя сопоставить полностью.");
  return {
    weightDelta,
    weightPct: previous.weight === 0 ? null : (weightDelta / previous.weight) * 100,
    repsDelta: entryValue(selected, "reps") - entryValue(previous, "reps"),
    volumeDelta: entryValue(selected, "volume") - entryValue(previous, "volume"),
    warnings,
  };
}

export function chartRange(period: number | "all", end: string): [string, string] {
  if (period === "all") return ["0001-01-01", end];
  const start = new Date(`${end}T12:00:00`);
  start.setDate(start.getDate() - period + 1);
  return [toISO(start), end];
}

export function chartSeries(
  entries: HistoryEntry[],
  metric: Metric,
  period: number | "all",
  end: string,
) {
  const [start, upper] = chartRange(period, end);
  return dailySeries(
    entries.filter((e) => e.performed_on >= start && e.performed_on <= upper),
    metric,
  );
}
