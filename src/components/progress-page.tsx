import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  METRICS,
  PERIODS,
  dailySeries,
  toISO,
  weekComparison,
  weekRange,
  type Metric,
} from "@/lib/workout";
import { daysQuery, entriesQuery, programQuery } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { LoadError, Loading } from "@/components/query-feedback";

const selectCls =
  "h-12 w-full rounded-md border border-input bg-card px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("ru-RU");
const NO_DATA: never[] = [];

export function ProgressPage() {
  const { userId } = useUserSession();
  const programResult = useQuery(programQuery(userId));
  const daysResult = useQuery(daysQuery(userId));
  const program = programResult.data ?? NO_DATA;
  const days = daysResult.data ?? NO_DATA;
  const [exerciseId, setExerciseId] = useState("");
  const [period, setPeriod] = useState<number>(30);
  const [metric, setMetric] = useState<Metric>("weight");
  useEffect(() => {
    if (!exerciseId && program[0]) setExerciseId(program[0].id);
  }, [program, exerciseId]);

  const today = new Date();
  const periodStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - (period - 1),
  );
  const prevWeekStart = weekRange(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7),
  )[0];
  const since = [toISO(periodStart), prevWeekStart].sort()[0]!;
  const entriesResult = useQuery({
    ...entriesQuery(userId, exerciseId, since),
    enabled: !!exerciseId && programResult.isSuccess && daysResult.isSuccess,
  });
  const entries = entriesResult.data ?? NO_DATA;

  const periodISO = toISO(periodStart);
  const series = useMemo(
    () =>
      dailySeries(
        entries.filter((e) => e.performed_on >= periodISO),
        metric,
      ),
    [entries, periodISO, metric],
  );
  const cmp = weekComparison(entries, metric, today);
  const unit = METRICS.find((m) => m.id === metric)!.unit;

  if (programResult.isError || daysResult.isError)
    return (
      <LoadError
        onRetry={() => {
          void programResult.refetch();
          void daysResult.refetch();
        }}
      >
        Не удалось загрузить программу для просмотра истории.
      </LoadError>
    );
  if (programResult.isPending || daysResult.isPending)
    return <Loading>Загрузка программы…</Loading>;
  if (!program.length)
    return <p className="py-4 text-sm text-muted-foreground">В программе пока нет упражнений.</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Прогресс</h1>
      <select
        aria-label="Упражнение"
        className={selectCls}
        value={exerciseId}
        onChange={(e) => setExerciseId(e.target.value)}
      >
        {program.some((p) => p.day_id === null) && (
          <optgroup label="Без назначенного дня">
            {program
              .filter((p) => p.day_id === null)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived_at ? " (архив)" : ""}
                </option>
              ))}
          </optgroup>
        )}
        {days.map((d) => (
          <optgroup key={d.id} label={d.name + (d.archived_at ? " (архив)" : "")}>
            {program
              .filter((p) => p.day_id === d.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived_at ? " (архив)" : ""}
                </option>
              ))}
          </optgroup>
        ))}
      </select>

      <Segment
        items={PERIODS.map((p) => ({ id: String(p), label: `${p} дн` }))}
        value={String(period)}
        onChange={(v) => setPeriod(Number(v))}
      />
      <Segment
        items={METRICS.map((m) => ({ id: m.id, label: m.label }))}
        value={metric}
        onChange={(v) => setMetric(v as Metric)}
      />

      {!exerciseId || entriesResult.isPending ? (
        <Loading>Загрузка истории…</Loading>
      ) : entriesResult.isError ? (
        <LoadError onRetry={() => void entriesResult.refetch()}>
          Не удалось загрузить историю тренировок.
        </LoadError>
      ) : (
        <>
          <div className="h-56 rounded-2xl bg-card p-3">
            {series.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Нет записей за период
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => d.slice(5).split("-").reverse().join(".")}
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                    }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                    formatter={(v: number) => [`${fmt(v)} ${unit}`, ""]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--chart-1)"
                    strokeWidth={2.5}
                    fill="url(#g)"
                    dot={{ r: 3, fill: "var(--chart-1)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <section className="rounded-2xl bg-card p-4">
            <h2 className="text-sm font-bold text-muted-foreground">Эта неделя vs прошлая</h2>
            {cmp.current === null && cmp.previous === null ? (
              <p className="mt-3 text-sm text-muted-foreground">Нет записей для сравнения</p>
            ) : (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Stat label="Эта" value={cmp.current} unit={unit} />
                <Stat label="Прошлая" value={cmp.previous} unit={unit} />
                <div>
                  <div className="text-xs text-muted-foreground">Разница</div>
                  <div
                    className={`num mt-1 text-lg font-bold ${cmp.delta === null ? "text-muted-foreground" : cmp.delta >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {cmp.delta === null ? "—" : `${cmp.delta > 0 ? "+" : ""}${fmt(cmp.delta)}`}
                  </div>
                  {cmp.pct !== null && (
                    <div className="num text-xs text-muted-foreground">
                      {cmp.pct > 0 ? "+" : ""}
                      {fmt(cmp.pct)}%
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-card p-4">
            <h2 className="text-sm font-bold text-muted-foreground">Записи</h2>
            {entries.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Записей пока нет</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {[...entries]
                  .reverse()
                  .slice(0, 20)
                  .map((e) => (
                    <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        <span className="num">{e.performed_on.split("-").reverse().join(".")}</span>{" "}
                        <span className="text-muted-foreground">· {e.day_name ?? "—"}</span>
                      </span>
                      <span className="num font-semibold">
                        {fmt(e.weight)} кг × {e.reps.join("/")}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="num mt-1 text-lg font-bold">
        {value === null ? "—" : fmt(value)}
        <span className="ml-1 text-xs text-muted-foreground">{value !== null && unit}</span>
      </div>
    </div>
  );
}

function Segment({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-secondary p-1">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => onChange(i.id)}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${value === i.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}
