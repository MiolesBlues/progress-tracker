export const DAYS = [
  { id: "upper1", label: "Upper 1" },
  { id: "lower1", label: "Lower 1" },
  { id: "upper2", label: "Upper 2" },
  { id: "lower2", label: "Lower 2" },
] as const;
export type DayId = (typeof DAYS)[number]["id"];

export type Metric = "weight" | "reps" | "volume";
export const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: "weight", label: "Вес", unit: "кг" },
  { id: "reps", label: "Повторения", unit: "" },
  { id: "volume", label: "Объём", unit: "кг" },
];
export const PERIODS = [7, 30, 90, 365] as const;

export interface EntryLike {
  performed_on: string; // YYYY-MM-DD
  weight: number;
  reps: number[];
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

export function entryValue(e: EntryLike, m: Metric): number {
  const r = sum(e.reps);
  if (m === "weight") return Number(e.weight);
  if (m === "reps") return r;
  return Number(e.weight) * r;
}

/** Aggregate a set of entries: weight = max, reps/volume = total. Null when empty. */
export function aggregate(entries: EntryLike[], m: Metric): number | null {
  if (entries.length === 0) return null;
  const vals = entries.map((e) => entryValue(e, m));
  return m === "weight" ? Math.max(...vals) : sum(vals);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Monday-based calendar week containing `d`: [start, end] ISO dates inclusive. */
export function weekRange(d: Date): [string, string] {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  const start = new Date(x);
  start.setDate(x.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [toISO(start), toISO(end)];
}

export function weekComparison(entries: EntryLike[], m: Metric, today: Date) {
  const [cs, ce] = weekRange(today);
  const prevDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const [ps, pe] = weekRange(prevDay);
  const inRange = (s: string, e: string) => entries.filter((x) => x.performed_on >= s && x.performed_on <= e);
  const current = aggregate(inRange(cs, ce), m);
  const previous = aggregate(inRange(ps, pe), m);
  const delta = current !== null && previous !== null ? current - previous : null;
  const pct = delta !== null && previous ? (delta / previous) * 100 : null;
  return { current, previous, delta, pct };
}

/** Per-date series for chart, sorted ascending. */
export function dailySeries(entries: EntryLike[], m: Metric) {
  const by = new Map<string, EntryLike[]>();
  for (const e of entries) by.set(e.performed_on, [...(by.get(e.performed_on) ?? []), e]);
  return [...by.keys()].sort().map((date) => ({ date, value: aggregate(by.get(date)!, m)! }));
}

/** Prefill for the log form: last logged session wins, else the program's starting weight/example reps. */
export function prefillFor(
  ex: { working_weight: number | null; example_reps: number[] | null; target_sets: number | null } | undefined,
  last: { weight: number | string; reps: number[] } | null | undefined,
): { weight: string; reps: string[] } {
  if (last) return { weight: String(Number(last.weight)), reps: last.reps.map(String) };
  const sets = ex?.target_sets ?? ex?.example_reps?.length ?? 3;
  const reps = ex?.example_reps?.length ? ex.example_reps.map(String) : Array.from({ length: sets }, () => "");
  return { weight: ex?.working_weight == null ? "" : String(ex.working_weight), reps };
}
