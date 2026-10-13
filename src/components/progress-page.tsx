import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { METRICS, PERIODS, toISO, type Metric } from "@/lib/workout";
import {
  chartRange,
  chartSeries,
  compareSessions,
  previousSessions,
  type HistoryEntry,
} from "@/lib/analytics";
import { daysQuery, entriesQuery, programQuery } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { LoadError, Loading } from "@/components/query-feedback";
import { Button } from "./ui/button";

const selectCls = "h-12 min-w-0 w-full rounded-md border border-input bg-card px-3 text-foreground";
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const signed = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)}`;
const PAGE_SIZE = 20;

export function ProgressPage() {
  const { userId } = useUserSession();
  const programResult = useQuery(programQuery(userId));
  const daysResult = useQuery(daysQuery(userId));
  const [chosenExercise, setExercise] = useState("");
  const exerciseId = chosenExercise || programResult.data?.[0]?.id || "";
  return (
    <div className="min-w-0 space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Прогресс</h1>
      {programResult.isError || daysResult.isError ? (
        <LoadError
          onRetry={() => {
            void programResult.refetch();
            void daysResult.refetch();
          }}
        >
          Не удалось загрузить программу для просмотра истории.
        </LoadError>
      ) : programResult.isPending || daysResult.isPending ? (
        <Loading>Загрузка программы…</Loading>
      ) : !programResult.data.length ? (
        <p>В программе пока нет упражнений.</p>
      ) : (
        <>
          <label className="block text-sm">
            Упражнение
            <select
              aria-label="Упражнение"
              className={selectCls}
              value={exerciseId}
              onChange={(e) => setExercise(e.target.value)}
            >
              {programResult.data.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ·{" "}
                  {daysResult.data.find((d) => d.id === e.day_id)?.name ?? "Без назначенного дня"}
                  {e.archived_at ? " (архив)" : ""}
                </option>
              ))}
            </select>
          </label>
          <ExerciseHistory
            key={`${userId}:${exerciseId}`}
            userId={userId}
            exerciseId={exerciseId}
          />
        </>
      )}
    </div>
  );
}

function ExerciseHistory({ userId, exerciseId }: { userId: string; exerciseId: string }) {
  const [period, setPeriod] = useState<number | "all">(30);
  const [metric, setMetric] = useState<Metric>("weight");
  const [selectedId, setSelected] = useState("");
  const [page, setPage] = useState(0);
  const today = toISO(new Date());
  const result = useQuery(entriesQuery(userId, exerciseId, "0001-01-01", today));
  if (result.isError)
    return (
      <LoadError onRetry={() => void result.refetch()}>
        {result.error instanceof Error &&
        (result.error.message.startsWith("В истории есть некорректные") ||
          result.error.message.startsWith("История"))
          ? result.error.message
          : "Не удалось загрузить историю тренировок. Расчёты недоступны до полной загрузки."}
      </LoadError>
    );
  if (result.isPending) return <Loading>Загрузка полной истории…</Loading>;
  const entries = result.data;
  const selected = entries.find((e) => e.id === selectedId) ?? entries.at(-1);
  const previous = selected ? previousSessions(entries, selected) : null;
  const series = chartSeries(entries, metric, period, today);
  const [from, to] = chartRange(period, today);
  const history = entries.filter((e) => e.performed_on >= from && e.performed_on <= to).reverse();
  const lastPage = Math.max(0, Math.ceil(history.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const unit = METRICS.find((m) => m.id === metric)!.unit;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1" aria-label="Период графика">
        {[...PERIODS, "all" as const].map((p) => (
          <Button
            key={p}
            variant={period === p ? "default" : "secondary"}
            aria-pressed={period === p}
            onClick={() => {
              setPeriod(p);
              setPage(0);
            }}
          >
            {p === "all" ? "Всё время" : `${p} дн`}
          </Button>
        ))}
      </div>
      <label className="block text-sm">
        Показатель
        <select
          aria-label="Показатель"
          className={selectCls}
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric)}
        >
          {METRICS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        {period === "all" ? "Вся история" : from} — {to}. За день: максимальный вес; повторения и
        объём суммируются. Будущие записи исключены.
      </p>
      <div className="h-56 min-w-0 rounded-2xl bg-card p-3" aria-label="График тренировок">
        {!series.length ? (
          <p>Нет записей за период</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5).split("-").reverse().join(".")}
                fontSize={11}
              />
              <YAxis fontSize={11} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", borderRadius: 12 }}
                formatter={(v: number) => [`${fmt(v)} ${unit}`, ""]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--chart-1)"
                fill="var(--chart-1)"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {selected ? (
        <>
          <label className="block text-sm">
            Тренировка для сравнения
            <select
              aria-label="Тренировка для сравнения"
              className={selectCls}
              value={selected.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {[...entries].reverse().map((e, index) => (
                <option key={e.id} value={e.id}>
                  {e.performed_on} · {fmt(e.weight)} кг · {e.reps.length} подх. · запись{" "}
                  {entries.length - index}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            Сравнения относятся к выбранной записи и не зависят от периода графика. Несколько сессий
            в день упорядочены по времени создания и ID.
          </p>
          <Comparison
            title="С предыдущей сессией"
            selected={selected}
            previous={previous!.session}
          />
          <Comparison
            title="С прошлой календарной неделей"
            selected={selected}
            previous={previous!.week}
            description={`Последняя сессия того же упражнения за ${previous!.weekRange[0]} — ${previous!.weekRange[1]} (пн–вс).`}
          />
          <p className="text-xs text-muted-foreground">
            Объём — вес × сумма повторений. Изменение объёма само по себе не доказывает рост силы.
            Вес 0 учитывается, процент относительно 0 не определяется.
          </p>
        </>
      ) : (
        <p>Записей пока нет</p>
      )}
      <section className="rounded-2xl bg-card p-4">
        <h2 className="font-bold">Записи за период ({history.length})</h2>
        <ul className="divide-y divide-border">
          {history.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((e) => (
            <li key={e.id} className="min-w-0 py-3 text-sm">
              <button className="w-full min-w-0 text-left" onClick={() => setSelected(e.id)}>
                <span className="block break-words">
                  {e.performed_on} · {e.day_name ?? "Без названия дня"}
                </span>
                <span className="num block break-all font-semibold">
                  {fmt(e.weight)} кг × {e.reps.join("/")}
                </span>
                <span className="text-muted-foreground">
                  {e.reps.length} подх. · RIR {e.rir === null ? "—" : fmt(e.rir)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!history.length ? (
          <p className="text-sm">Нет записей за период</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="secondary"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Назад
            </Button>
            <span className="text-xs">
              {currentPage + 1} / {lastPage + 1}
            </span>
            <Button
              variant="secondary"
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              Далее
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function Comparison({
  title,
  description,
  selected,
  previous,
}: {
  title: string;
  description?: string;
  selected: HistoryEntry;
  previous: HistoryEntry | null;
}) {
  const comparison = compareSessions(selected, previous);
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4">
      <h2 className="font-bold">{title}</h2>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {!comparison || !previous ? (
        <p className="text-sm text-muted-foreground">Нет прошлой записи для сравнения</p>
      ) : (
        <>
          <p className="text-xs">
            {previous.performed_on} → {selected.performed_on}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt>Рабочий вес</dt>
              <dd>
                {fmt(previous.weight)} → {fmt(selected.weight)} кг (
                {comparison.weightPct === null ? "—" : `${signed(comparison.weightPct)}%`})
              </dd>
            </div>
            <div>
              <dt>Сумма повторений</dt>
              <dd>{signed(comparison.repsDelta)}</dd>
            </div>
            <div>
              <dt>Объём, кг × повт.</dt>
              <dd>{signed(comparison.volumeDelta)}</dd>
            </div>
            <div>
              <dt>Подходы</dt>
              <dd>
                {previous.reps.length} → {selected.reps.length}
              </dd>
            </div>
            <div>
              <dt>RIR</dt>
              <dd>
                {previous.rir === null ? "—" : fmt(previous.rir)} →{" "}
                {selected.rir === null ? "—" : fmt(selected.rir)}
              </dd>
            </div>
          </dl>
          {comparison.warnings.map((w) => (
            <p key={w} role="note" className="text-sm text-amber-400">
              {w}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
