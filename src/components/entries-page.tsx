import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { daysQuery, entriesQuery, programQuery } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { toISO } from "@/lib/workout";
import { LoadError, Loading } from "@/components/query-feedback";
import { Button } from "@/components/ui/button";
import { useI18n, setsCount } from "@/lib/i18n";
import { useArchivePreferences } from "@/lib/archive-preferences";

const selectCls = "h-12 min-w-0 w-full rounded-md border border-input bg-card px-3 text-foreground";
type Period = "today" | 7 | 30 | "all";
type Sort = "recent" | "weight-desc" | "weight-asc";
const UNASSIGNED = "unassigned";
const PAGE_SIZE = 20;

function daysAgo(days: number, today: string) {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - days);
  return toISO(date);
}

export function EntriesPage() {
  const { t } = useI18n();
  const { userId } = useUserSession();
  const { showArchive } = useArchivePreferences(userId);
  const daysResult = useQuery(daysQuery(userId));
  const programResult = useQuery(programQuery(userId));
  const [chosenDay, setChosenDay] = useState("");
  const [chosenExercise, setChosenExercise] = useState("");
  if (daysResult.isError || programResult.isError)
    return (
      <LoadError
        onRetry={() => {
          void daysResult.refetch();
          void programResult.refetch();
        }}
      >
        {t("Не удалось загрузить программу для выбора записей.")}
      </LoadError>
    );
  if (daysResult.isPending || programResult.isPending)
    return <Loading>{t("Загрузка программы…")}</Loading>;

  const dayNames = new Map(daysResult.data.map((day) => [day.id, day.name]));
  const days = showArchive ? daysResult.data : daysResult.data.filter((day) => !day.archived_at);
  const activeDayIds = new Set(days.map((day) => day.id));
  const exercises = showArchive
    ? programResult.data
    : programResult.data.filter(
        (exercise) =>
          !exercise.archived_at && !!exercise.day_id && activeDayIds.has(exercise.day_id),
      );
  const hasUnassigned = exercises.some((exercise) => exercise.day_id === null);
  const dayId = chosenDay
    ? days.some((day) => day.id === chosenDay) || (chosenDay === UNASSIGNED && hasUnassigned)
      ? chosenDay
      : ""
    : (days.find((day) => !day.archived_at)?.id ??
      days[0]?.id ??
      (hasUnassigned ? UNASSIGNED : ""));
  const dayExercises = exercises.filter(
    (exercise) => exercise.day_id === (dayId === UNASSIGNED ? null : dayId),
  );
  const exerciseId = !dayId
    ? ""
    : chosenExercise
      ? dayExercises.some((exercise) => exercise.id === chosenExercise)
        ? chosenExercise
        : ""
      : (dayExercises[0]?.id ?? "");

  return (
    <div className="min-w-0 space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("Записи")}</h1>
      {!days.length && !hasUnassigned ? (
        <p>{t("Сначала добавьте тренировочный день и упражнения в программе.")}</p>
      ) : (
        <>
          <label className="block min-w-0 space-y-1 text-sm">
            {t("Тренировочный день")}
            <select
              aria-label={t("День записей")}
              className={selectCls}
              value={dayId}
              onChange={(event) => {
                setChosenDay(event.target.value);
                setChosenExercise("");
              }}
            >
              {!dayId && <option value="">{t("Выберите тренировочный день")}</option>}
              {days.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.name}
                  {day.archived_at ? t(" (архив)") : ""}
                </option>
              ))}
              {hasUnassigned && <option value={UNASSIGNED}>{t("Без назначенного дня")}</option>}
            </select>
          </label>
          {!dayId ? (
            <p>{t("Выберите тренировочный день")}</p>
          ) : !dayExercises.length ? (
            <p>{t("В этом дне пока нет упражнений с записями.")}</p>
          ) : (
            <>
              <label className="block min-w-0 space-y-1 text-sm">
                {t("Упражнение")}
                <select
                  aria-label={t("Упражнение записей")}
                  className={selectCls}
                  value={exerciseId}
                  onChange={(event) => setChosenExercise(event.target.value)}
                >
                  {!exerciseId && <option value="">{t("Выберите упражнение")}</option>}
                  {dayExercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                      {exercise.archived_at ? t(" (архив)") : ""}
                    </option>
                  ))}
                </select>
              </label>
              {exerciseId ? (
                <ExerciseEntries
                  key={`${userId}:${exerciseId}`}
                  userId={userId}
                  exerciseId={exerciseId}
                  dayNames={dayNames}
                />
              ) : (
                <p>{t("Выберите упражнение")}</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ExerciseEntries({
  userId,
  exerciseId,
  dayNames,
}: {
  userId: string;
  exerciseId: string;
  dayNames: Map<string, string>;
}) {
  const { t, number, date, language } = useI18n();
  const today = toISO(new Date());
  const result = useQuery(entriesQuery(userId, exerciseId, "0001-01-01", today));
  const [period, setPeriod] = useState<Period>(30);
  const [sort, setSort] = useState<Sort>("recent");
  const [page, setPage] = useState(0);
  if (result.isError)
    return (
      <LoadError onRetry={() => void result.refetch()}>
        {t("Не удалось загрузить записи упражнения.")}
      </LoadError>
    );
  if (result.isPending) return <Loading>{t("Загрузка записей…")}</Loading>;

  const since =
    period === "today" ? today : period === "all" ? "0001-01-01" : daysAgo(period - 1, today);
  const filtered = result.data.filter(
    (entry) => entry.performed_on >= since && entry.performed_on <= today,
  );
  const recentOrder = (a: (typeof filtered)[number], b: (typeof filtered)[number]) =>
    b.performed_on.localeCompare(a.performed_on) ||
    b.created_at.localeCompare(a.created_at) ||
    b.id.localeCompare(a.id);
  const records = [...filtered].sort((a, b) => {
    if (sort === "weight-desc") return b.weight - a.weight || recentOrder(a, b);
    if (sort === "weight-asc") return a.weight - b.weight || recentOrder(a, b);
    return recentOrder(a, b);
  });
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const pageIndex = Math.min(page, pages - 1);

  return (
    <section className="min-w-0 space-y-4" aria-label={t("Дневник записей упражнения")}>
      <div className="space-y-2">
        <span className="text-sm">{t("Период")}</span>
        <div className="flex flex-wrap gap-2" aria-label={t("Фильтр по дате")}>
          {(
            [
              ["today", t("Сегодня")],
              [7, t("7 дней")],
              [30, t("30 дней")],
              ["all", t("Всё время")],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={period === value ? "default" : "secondary"}
              aria-pressed={period === value}
              onClick={() => {
                setPeriod(value);
                setPage(0);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <label className="block min-w-0 space-y-1 text-sm">
        {t("Сортировка")}
        <select
          aria-label={t("Сортировка записей")}
          className={selectCls}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as Sort);
            setPage(0);
          }}
        >
          <option value="recent">{t("Сначала новые")}</option>
          <option value="weight-desc">{t("Вес: по убыванию")}</option>
          <option value="weight-asc">{t("Вес: по возрастанию")}</option>
        </select>
      </label>
      <h2 className="font-bold">{t("Записи · {count}", { count: records.length })}</h2>
      {!records.length ? (
        <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground">
          {t("За выбранный период записей нет.")}
        </p>
      ) : (
        <ul className="min-w-0 space-y-3">
          {records.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE).map((entry) => (
            <li key={entry.id} className="min-w-0 space-y-1 rounded-xl bg-card p-4 text-sm">
              <p className="break-words font-semibold">
                {date(entry.performed_on)} ·{" "}
                {(entry.day_id ? dayNames.get(entry.day_id) : undefined) ||
                  entry.day_name?.trim() ||
                  t("Без назначенного дня")}
              </p>
              <p className="num break-all text-base font-bold">
                {number(entry.weight, 2)} {t("кг")} · {entry.reps.join(" / ")}
              </p>
              <p className="text-muted-foreground">
                {setsCount(entry.reps.length, language)}
                {entry.rir !== null && ` · RIR ${entry.rir}`}
              </p>
              {entry.notes?.trim() && <p className="break-words">{entry.notes}</p>}
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav
          aria-label={t("Страницы записей")}
          className="flex flex-wrap items-center justify-between gap-2 text-sm"
        >
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={pageIndex === 0}
            onClick={() => setPage(pageIndex - 1)}
          >
            {t("Назад")}
          </Button>
          <span aria-live="polite">
            {t("Страница {page} из {pages}", { page: pageIndex + 1, pages })}
          </span>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={pageIndex + 1 === pages}
            onClick={() => setPage(pageIndex + 1)}
          >
            {t("Далее")}
          </Button>
        </nav>
      )}
    </section>
  );
}
