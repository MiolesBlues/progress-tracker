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
import { effectiveSets, METRICS, PERIODS, toISO, workoutMetrics, type Metric } from "@/lib/workout";
import {
  chartRange,
  chartSeries,
  compareSessions,
  previousSessions,
  type HistoryEntry,
} from "@/lib/analytics";
import { daysQuery, entriesQuery, programQuery } from "@/lib/queries";
import { useI18n } from "@/lib/i18n";
import {
  resolveProgressSelection,
  UNASSIGNED_HISTORY_DAY,
  type ProgressMode,
} from "@/lib/progress-selection";
import { useUserSession } from "@/lib/session";
import { LoadError, Loading } from "@/components/query-feedback";
import { Button } from "./ui/button";

const selectCls = "h-12 min-w-0 w-full rounded-md border border-input bg-card px-3 text-foreground";
const PAGE_SIZE = 20;

export function ProgressPage() {
  const { t } = useI18n();
  const { userId } = useUserSession();
  const programResult = useQuery(programQuery(userId));
  const daysResult = useQuery(daysQuery(userId));
  const [mode, setMode] = useState<ProgressMode>("active");
  const [chosenDay, setDay] = useState("");
  const [chosenExercise, setExercise] = useState("");
  const days = daysResult.data ?? [];
  const exercises = programResult.data ?? [];
  const selection = resolveProgressSelection(days, exercises, mode, chosenDay, chosenExercise);
  const hasArchive =
    days.some((day) => day.archived_at) ||
    exercises.some((exercise) => exercise.archived_at || !exercise.day_id);
  return (
    <div className="min-w-0 space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("Прогресс")}</h1>
      {programResult.isError || daysResult.isError ? (
        <LoadError
          onRetry={() => {
            void programResult.refetch();
            void daysResult.refetch();
          }}
        >
          {t("Не удалось загрузить программу для просмотра истории.")}
        </LoadError>
      ) : programResult.isPending || daysResult.isPending ? (
        <Loading>{t("Загрузка программы…")}</Loading>
      ) : !days.length && !exercises.length ? (
        <p>{t("В программе пока нет упражнений.")}</p>
      ) : (
        <>
          {hasArchive && (
            <div className="flex flex-wrap gap-2" aria-label={t("Архивная история")}>
              {(["active", "archive"] as const).map((value) => (
                <Button
                  key={value}
                  variant={mode === value ? "default" : "secondary"}
                  aria-pressed={mode === value}
                  onClick={() => {
                    setMode(value);
                    setDay("");
                    setExercise("");
                  }}
                >
                  {value === "active" ? t("Активная программа") : t("Архивная история")}
                </Button>
              ))}
            </div>
          )}
          {selection.dayId ? (
            <>
              <label className="block min-w-0 space-y-1 text-sm">
                {t("Тренировочный день")}
                <select
                  aria-label={t("Тренировочный день")}
                  className={selectCls}
                  value={selection.dayId}
                  onChange={(event) => {
                    setDay(event.target.value);
                    setExercise("");
                  }}
                >
                  {selection.dayOptions.map((day) => (
                    <option key={day.id} value={day.id}>
                      {day.name}
                    </option>
                  ))}
                  {mode === "archive" && exercises.some((exercise) => !exercise.day_id) && (
                    <option value={UNASSIGNED_HISTORY_DAY}>{t("История без активного дня")}</option>
                  )}
                </select>
              </label>
              {selection.exerciseId ? (
                <>
                  <label className="block min-w-0 space-y-1 text-sm">
                    {t("Упражнение")}
                    <select
                      aria-label={t("Упражнение")}
                      className={selectCls}
                      value={selection.exerciseId}
                      onChange={(event) => setExercise(event.target.value)}
                    >
                      {selection.dayExercises.map((exercise) => (
                        <option key={exercise.id} value={exercise.id}>
                          {exercise.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ExerciseHistory
                    key={`${userId}:${selection.exerciseId}`}
                    userId={userId}
                    exerciseId={selection.exerciseId}
                  />
                </>
              ) : (
                <p>{t("Для выбранного дня нет упражнений.")}</p>
              )}
            </>
          ) : (
            <p>{mode === "active" ? t("Нет активных дней") : t("Выберите архивный день")}</p>
          )}
        </>
      )}
    </div>
  );
}

function ExerciseHistory({ userId, exerciseId }: { userId: string; exerciseId: string }) {
  const { t, number, date } = useI18n();
  const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;
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
        result.error.message.startsWith("В истории есть некорректные")
          ? t(
              "В истории есть некорректные старые результаты. Расчёты остановлены; данные требуют отдельной проверки.",
            )
          : t("Не удалось загрузить историю тренировок. Расчёты недоступны до полной загрузки.")}
      </LoadError>
    );
  if (result.isPending) return <Loading>{t("Загрузка полной истории…")}</Loading>;
  const entries = result.data;
  const selected = entries.find((e) => e.id === selectedId) ?? entries.at(-1);
  const previous = selected ? previousSessions(entries, selected) : null;
  const series = chartSeries(entries, metric, period, today);
  const [from, to] = chartRange(period, today);
  const history = entries.filter((e) => e.performed_on >= from && e.performed_on <= to).reverse();
  const lastPage = Math.max(0, Math.ceil(history.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const unit = METRICS.find((m) => m.id === metric)!.unit ? t("кг") : "";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1" aria-label={t("Период графика")}>
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
            {p === "all" ? t("Всё время") : t("{count} дн", { count: p })}
          </Button>
        ))}
      </div>
      <label className="block text-sm">
        {t("Показатель")}
        <select
          aria-label={t("Показатель")}
          className={selectCls}
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric)}
        >
          {METRICS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === "weight" ? t("Вес") : m.id === "reps" ? t("Повторения") : t("Объём")}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        {period === "all" ? t("Всё время") : date(from)} — {date(to)}.{" "}
        {t("За день: максимальный вес; повторения и объём суммируются. Будущие записи исключены.")}
      </p>
      <div className="h-56 min-w-0 rounded-2xl bg-card p-3" aria-label={t("График тренировок")}>
        {!series.length ? (
          <p>{t("Нет записей за период")}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => date(d).slice(0, 5)}
                fontSize={11}
              />
              <YAxis fontSize={11} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", borderRadius: 12 }}
                formatter={(v: number) => [`${number(v)} ${unit}`, ""]}
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
      {selected &&
        (() => {
          const metrics = workoutMetrics(selected);
          const bodyweightOnly = effectiveSets(selected).some(
            (set) => set.load_type === "bodyweight",
          );
          return (
            <section
              className="grid grid-cols-2 gap-2 text-sm"
              aria-label={t("Показатели подходов")}
            >
              <MetricCard
                label={t("Максимальный рабочий вес")}
                value={`${number(metrics.maxWorkingWeight)} ${t("кг")}`}
              />
              <MetricCard
                label={t("Лучший рабочий подход · внешнее отягощение")}
                value={
                  metrics.bestWorkingSet
                    ? `${number(metrics.bestWorkingSet.weight)} ${t("кг")} × ${metrics.bestWorkingSet.reps}`
                    : "—"
                }
              />
              <MetricCard
                label={t("Объём рабочих подходов")}
                value={`${number(metrics.workingVolume)} ${t("кг")}`}
              />
              <MetricCard
                label={t("Рабочие подходы")}
                value={`${metrics.workingSets} · ${metrics.workingReps} ${t("Повторения")}`}
              />
              <MetricCard
                label={t("История RIR")}
                value={metrics.rirHistory
                  .map((rir) => (rir === null ? "—" : number(rir)))
                  .join(" / ")}
              />
              {bodyweightOnly && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  {t(
                    "Для упражнений с собственным весом объём учитывает только добавленное отягощение, не массу тела.",
                  )}
                </p>
              )}
            </section>
          );
        })()}
      {selected ? (
        <>
          <label className="block text-sm">
            {t("Тренировка для сравнения")}
            <select
              aria-label={t("Тренировка для сравнения")}
              className={selectCls}
              value={selected.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {[...entries].reverse().map((e, index) => (
                <option key={e.id} value={e.id}>
                  {date(e.performed_on)} · {number(e.weight)} {t("кг")} ·{" "}
                  {t("{count} подх. · запись {number}", {
                    count: e.reps.length,
                    number: entries.length - index,
                  })}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            {t(
              "Сравнения относятся к выбранной записи и не зависят от периода графика. Несколько сессий в день упорядочены по времени создания и ID.",
            )}
          </p>
          <Comparison
            title={t("С предыдущей сессией")}
            selected={selected}
            previous={previous!.session}
          />
          <Comparison
            title={t("С прошлой календарной неделей")}
            selected={selected}
            previous={previous!.week}
            description={t("Последняя сессия того же упражнения за {from} — {to} (пн–вс).", {
              from: date(previous!.weekRange[0]),
              to: date(previous!.weekRange[1]),
            })}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Объём считается только по рабочим подходам: сумма веса × повторений. Сам по себе он не доказывает рост силы.",
            )}
          </p>
        </>
      ) : (
        <p>{t("Записей пока нет")}</p>
      )}
      <section className="rounded-2xl bg-card p-4">
        <h2 className="font-bold">{t("Записи за период ({count})", { count: history.length })}</h2>
        <ul className="divide-y divide-border">
          {history.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((e) => (
            <li key={e.id} className="min-w-0 py-3 text-sm">
              <button className="w-full min-w-0 text-left" onClick={() => setSelected(e.id)}>
                <span className="block break-words">
                  {date(e.performed_on)} · {e.day_name ?? t("Без названия дня")}
                </span>
                <span className="block text-muted-foreground">
                  {t("Рабочие подходы")}:{" "}
                  {effectiveSets(e)
                    .map(
                      (set) =>
                        `${set.position}. ${number(set.weight)} ${t("кг")} × ${set.reps} · RIR ${set.rir === null ? "—" : number(set.rir)}`,
                    )
                    .join("; ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!history.length ? (
          <p className="text-sm">{t("Нет записей за период")}</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="secondary"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("Назад")}
            </Button>
            <span className="text-xs">
              {currentPage + 1} / {lastPage + 1}
            </span>
            <Button
              variant="secondary"
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("Далее")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-semibold tabular-nums">{value}</p>
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
  const { t, number, date } = useI18n();
  const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;
  const comparison = compareSessions(selected, previous);
  const selectedMetrics = workoutMetrics(selected);
  const previousMetrics = previous ? workoutMetrics(previous) : null;
  return (
    <section className="space-y-3 rounded-2xl bg-card p-4">
      <h2 className="font-bold">{title}</h2>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {!comparison || !previous ? (
        <p className="text-sm text-muted-foreground">{t("Нет прошлой записи для сравнения")}</p>
      ) : (
        <>
          <p className="text-xs">
            {date(previous.performed_on)} → {date(selected.performed_on)}
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt>{t("Рабочий вес")}</dt>
              <dd>
                {number(previousMetrics!.maxWorkingWeight)} →{" "}
                {number(selectedMetrics.maxWorkingWeight)} {t("кг")} (
                {comparison.weightPct === null ? "—" : `${signed(comparison.weightPct)}%`})
              </dd>
            </div>
            <div>
              <dt>{t("Сумма повторений")}</dt>
              <dd>{signed(comparison.repsDelta)}</dd>
            </div>
            <div>
              <dt>{t("Объём, кг × повт.")}</dt>
              <dd>{signed(comparison.volumeDelta)}</dd>
            </div>
            <div>
              <dt>{t("Лучший рабочий подход · внешнее отягощение")}</dt>
              <dd>
                {previousMetrics!.bestWorkingSet
                  ? `${number(previousMetrics!.bestWorkingSet.weight)} ${t("кг")} × ${previousMetrics!.bestWorkingSet.reps}`
                  : "—"}{" "}
                →{" "}
                {selectedMetrics.bestWorkingSet
                  ? `${number(selectedMetrics.bestWorkingSet.weight)} ${t("кг")} × ${selectedMetrics.bestWorkingSet.reps}`
                  : "—"}{" "}
                ({signed(comparison.bestSetVolumeDelta)} {t("кг")})
              </dd>
            </div>
            <div>
              <dt>{t("Подходы")}</dt>
              <dd>
                {previousMetrics!.workingSets} → {selectedMetrics.workingSets}
              </dd>
            </div>
            <div>
              <dt>RIR</dt>
              <dd>
                {previousMetrics!.rirHistory
                  .map((rir) => (rir === null ? "—" : number(rir)))
                  .join(" / ")}{" "}
                →{" "}
                {selectedMetrics.rirHistory
                  .map((rir) => (rir === null ? "—" : number(rir)))
                  .join(" / ")}
              </dd>
            </div>
          </dl>
          {comparison.warnings.map((w) => (
            <p key={w} role="note" className="text-sm text-amber-400">
              {w === "Разное число подходов: условия несопоставимы."
                ? t("Разное число подходов: условия несопоставимы.")
                : w === "RIR отличается на 2 или больше: условия несопоставимы."
                  ? t("RIR отличается на 2 или больше: условия несопоставимы.")
                  : w === "RIR указан не в обеих записях; усилие нельзя сопоставить полностью."
                    ? t("RIR указан не в обеих записях; усилие нельзя сопоставить полностью.")
                    : t("Рабочие подходы или усилие отличаются: вывод о прогрессии ограничен.")}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
