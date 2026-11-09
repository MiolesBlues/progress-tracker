import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, Pencil, X } from "lucide-react";
import {
  daysQuery,
  entriesPageQuery,
  entriesQuery,
  lastEntryQuery,
  programQuery,
  userKeys,
} from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { effectiveSets, toISO, workoutMetrics } from "@/lib/workout";
import { LoadError, Loading } from "@/components/query-feedback";
import { Button } from "@/components/ui/button";
import { useI18n, setsCount, translateKnown } from "@/lib/i18n";
import { useArchivePreferences } from "@/lib/archive-preferences";
import { ArrowDownUp, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { decimal } from "@/lib/workout-input";
import { SaveWorkoutError } from "@/lib/save-workout";
import { editWorkoutSet, WorkoutEditConflict, type WorkoutSetEdit } from "@/lib/edit-workout-set";
import { toast } from "sonner";
import type { HistoryEntry } from "@/lib/analytics";
import { MAX_REPS, MAX_WEIGHT } from "@/lib/workout-input";
import { PageCard, PageCardHeading } from "@/components/ui/page-card";

const selectCls = "h-12 min-w-0 w-full rounded-md border border-input bg-card px-3 text-foreground";
type Period = "today" | 7 | 30 | "all";
type Sort = "recent" | "weight-desc" | "weight-asc";
const UNASSIGNED = "unassigned";
const PAGE_SIZE = 20;
const SORT_PREFERENCE_PREFIX = "app:entries-sort:v1:";

function readSortPreference(userId: string): Sort {
  try {
    const value = localStorage.getItem(`${SORT_PREFERENCE_PREFIX}${userId}`);
    return value === "recent" || value === "weight-desc" || value === "weight-asc"
      ? value
      : "recent";
  } catch {
    return "recent";
  }
}

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
      <PageCard>
        <LoadError
          onRetry={() => {
            void daysResult.refetch();
            void programResult.refetch();
          }}
        >
          {t("Не удалось загрузить программу для выбора записей.")}
        </LoadError>
      </PageCard>
    );
  if (daysResult.isPending || programResult.isPending)
    return (
      <PageCard>
        <Loading>{t("Загрузка программы…")}</Loading>
      </PageCard>
    );

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
      <PageCard className="space-y-5">
        <PageCardHeading>{t("Записи")}</PageCardHeading>
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
                    exerciseName={
                      dayExercises.find((exercise) => exercise.id === exerciseId)?.name ?? ""
                    }
                    dayNames={dayNames}
                  />
                ) : (
                  <p>{t("Выберите упражнение")}</p>
                )}
              </>
            )}
          </>
        )}
      </PageCard>
    </div>
  );
}

function ExerciseEntries({
  userId,
  exerciseId,
  exerciseName,
  dayNames,
}: {
  userId: string;
  exerciseId: string;
  exerciseName: string;
  dayNames: Map<string, string>;
}) {
  const { t, number, date, language } = useI18n();
  const today = toISO(new Date());
  const [period, setPeriod] = useState<Period>(30);
  const [sort, setSort] = useState<Sort>(() => readSortPreference(userId));
  const [page, setPage] = useState(0);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(() => new Set());
  const since =
    period === "today" ? today : period === "all" ? "0001-01-01" : daysAgo(period - 1, today);
  const recentPage = useQuery(entriesPageQuery(userId, exerciseId, since, today, page, PAGE_SIZE));
  const completeHistory = useQuery(
    entriesQuery(userId, exerciseId, "0001-01-01", today, sort !== "recent"),
  );
  const result = sort === "recent" ? recentPage : completeHistory;
  const displaySort = sort !== "recent" && completeHistory.data ? sort : "recent";
  if (result.isError)
    return (
      <LoadError onRetry={() => void result.refetch()}>
        {t("Не удалось загрузить записи упражнения.")}
      </LoadError>
    );
  if (result.isPending && !(sort !== "recent" && recentPage.data))
    return <Loading>{t("Загрузка записей…")}</Loading>;

  const filtered = displaySort === "recent" ? recentPage.data!.entries : completeHistory.data!;
  const recentOrder = (a: (typeof filtered)[number], b: (typeof filtered)[number]) =>
    b.performed_on.localeCompare(a.performed_on) ||
    b.created_at.localeCompare(a.created_at) ||
    b.id.localeCompare(a.id);
  const sortedRecords = [...filtered].sort((a, b) => {
    if (displaySort === "weight-desc")
      return (
        workoutMetrics(b).maxWorkingWeight - workoutMetrics(a).maxWorkingWeight || recentOrder(a, b)
      );
    if (displaySort === "weight-asc")
      return (
        workoutMetrics(a).maxWorkingWeight - workoutMetrics(b).maxWorkingWeight || recentOrder(a, b)
      );
    return recentOrder(a, b);
  });
  const records =
    displaySort === "recent"
      ? sortedRecords
      : sortedRecords.filter((entry) => entry.performed_on >= since && entry.performed_on <= today);
  const recordCount = displaySort === "recent" ? recentPage.data!.count : records.length;
  const pages = Math.max(1, Math.ceil(recordCount / PAGE_SIZE));
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
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="min-w-0 font-bold">{t("Записи · {count}", { count: recordCount })}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 shrink-0"
              aria-label={t("Сортировка записей")}
            >
              <ArrowDownUp aria-hidden="true" className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="bottom"
            sideOffset={4}
            collisionPadding={8}
            className="w-52 max-w-[calc(100vw-1rem)] p-1 duration-150 motion-reduce:animate-none motion-reduce:transition-none"
          >
            {(
              [
                ["recent", t("Сначала новые")],
                ["weight-desc", t("Вес: по убыванию")],
                ["weight-asc", t("Вес: по возрастанию")],
              ] as const
            ).map(([value, label]) => (
              <DropdownMenuItem
                key={value}
                role="menuitemradio"
                aria-checked={sort === value}
                onSelect={() => {
                  setSort(value);
                  setPage(0);
                  try {
                    localStorage.setItem(`${SORT_PREFERENCE_PREFIX}${userId}`, value);
                  } catch {
                    // Sorting remains available for this session when storage is unavailable.
                  }
                }}
                className="min-h-11 gap-3 px-3"
              >
                <span>{label}</span>
                {sort === value && <Check aria-hidden="true" className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!records.length ? (
        <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground">
          {t("За выбранный период записей нет.")}
        </p>
      ) : (
        <ul className="min-w-0 divide-y divide-border/60">
          {(displaySort === "recent"
            ? records
            : records.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)
          ).map((entry) => (
            <li key={entry.id} className="min-w-0 py-1 text-sm">
              <button
                type="button"
                aria-expanded={expandedEntries.has(entry.id)}
                aria-controls={`entry-sets-${entry.id}`}
                onClick={() =>
                  setExpandedEntries((current) => {
                    const next = new Set(current);
                    if (next.has(entry.id)) next.delete(entry.id);
                    else next.add(entry.id);
                    return next;
                  })
                }
                className="flex min-h-11 w-full min-w-0 items-center gap-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{exerciseName}</span>
                  <span className="block truncate text-xs text-muted-foreground tabular-nums">
                    {setsCount(effectiveSets(entry).length, language)} ·{" "}
                    {t("Макс. рабочий вес {weight}", {
                      weight: `${number(workoutMetrics(entry).maxWorkingWeight, 2)} ${t("кг")}`,
                    })}
                  </span>
                </span>
                <span className="max-w-[35%] truncate text-right text-xs text-muted-foreground">
                  {date(entry.performed_on)} ·{" "}
                  {(entry.day_id ? dayNames.get(entry.day_id) : undefined) ||
                    entry.day_name?.trim() ||
                    t("Без назначенного дня")}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-250 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${expandedEntries.has(entry.id) ? "rotate-180" : ""}`}
                />
              </button>
              <div
                id={`entry-sets-${entry.id}`}
                aria-hidden={!expandedEntries.has(entry.id)}
                className={`grid transition-[grid-template-rows,opacity] duration-250 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${expandedEntries.has(entry.id) ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 border-t border-border/50 py-2 text-xs">
                    <span className="text-muted-foreground">{t("SET")}</span>
                    <span className="text-muted-foreground">{t("WEIGHT")}</span>
                    <span className="text-muted-foreground">{t("REPS")}</span>
                    <span className="text-muted-foreground">RIR</span>
                    <span />
                    {effectiveSets(entry).map((set) => (
                      <HistorySetRow
                        key={`${entry.id}:${set.position}`}
                        entryId={entry.id}
                        exerciseId={exerciseId}
                        set={set}
                      />
                    ))}
                  </div>
                  {entry.notes?.trim() && (
                    <p className="break-words border-t border-border/40 py-2 text-xs text-muted-foreground">
                      {entry.notes}
                    </p>
                  )}
                </div>
              </div>
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

function HistorySetRow({
  entryId,
  exerciseId,
  set,
}: {
  entryId: string;
  exerciseId: string;
  set: NonNullable<HistoryEntry["sets"]>[number];
}) {
  const { t, number, language } = useI18n();
  const { userId, signal, isCurrent } = useUserSession();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [baseRevision, setBaseRevision] = useState(set.revision);
  const [pending, setPending] = useState<WorkoutSetEdit | null>(null);
  const [values, setValues] = useState({
    weight: set.weightExact ?? String(set.weight),
    reps: String(set.reps),
    rir: set.rir === null ? "" : String(set.rir),
  });
  async function save() {
    if (!set.id || saving || !isCurrent()) return;
    setError("");
    setSaving(true);
    try {
      const weight = values.weight.trim().replace(",", ".");
      decimal(weight, "Вес", MAX_WEIGHT, 2);
      if (
        !/^\d+$/.test(values.reps) ||
        !Number.isSafeInteger(Number(values.reps)) ||
        Number(values.reps) > MAX_REPS
      )
        throw new Error("Укажите целое количество повторений.");
      const rirText = values.rir.trim().replace(",", ".");
      if (rirText) decimal(rirText, "RIR", 10, 1);
      if (!Number.isSafeInteger(baseRevision) || baseRevision === undefined || baseRevision < 0)
        throw new SaveWorkoutError(
          "Версия подхода недоступна. Обновите запись после обновления базы.",
          true,
        );
      const operation = pending ?? {
        operationId: crypto.randomUUID(),
        entryId,
        expectedRevision: baseRevision,
        set: {
          id: set.id,
          position: set.position,
          weight,
          reps: Number(values.reps),
          rir: rirText || null,
          set_type: set.set_type,
          load_type: set.load_type,
        },
      };
      setPending(operation);
      await editWorkoutSet(operation, signal);
      if (!isCurrent()) return;
      setEditing(false);
      setPending(null);
      toast.success(t("Подход обновлён"), { id: `set-updated-${set.id}`, duration: 2500 });
      void queryClient.invalidateQueries({ queryKey: userKeys.entries(userId, exerciseId) });
      void queryClient.invalidateQueries({ queryKey: userKeys.lastEntry(userId, exerciseId) });
    } catch (reason) {
      if (isCurrent()) {
        const message = reason instanceof Error ? reason.message : "Не удалось изменить подход.";
        setError(translateKnown(language, message));
        if (reason instanceof SaveWorkoutError && reason.rejected) setPending(null);
        if (
          reason instanceof WorkoutEditConflict ||
          (reason instanceof Error && /больше недоступен/.test(reason.message))
        ) {
          void queryClient.invalidateQueries({ queryKey: userKeys.entries(userId, exerciseId) });
          void queryClient.invalidateQueries({ queryKey: userKeys.lastEntry(userId, exerciseId) });
        }
      }
    } finally {
      if (isCurrent()) setSaving(false);
    }
  }
  return (
    <div className="col-span-5 grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 border-t border-border/30 py-1 text-xs">
      <span className="tabular-nums">
        {set.position}
        {set.set_type === "warmup" ? " · W" : ""}
      </span>
      {editing ? (
        <Input
          aria-label={t("Вес подхода {number}", { number: set.position })}
          disabled={saving || !!pending}
          inputMode="decimal"
          value={values.weight}
          onChange={(event) => setValues({ ...values, weight: event.target.value })}
          className="num h-9 min-w-0 px-1"
        />
      ) : (
        <span className="tabular-nums">
          {number(set.weight, 2)} {t("кг")}
        </span>
      )}
      {editing ? (
        <Input
          aria-label={t("Повторения подхода {number}", { number: set.position })}
          disabled={saving || !!pending}
          inputMode="numeric"
          value={values.reps}
          onChange={(event) => setValues({ ...values, reps: event.target.value })}
          className="num h-9 min-w-0 px-1"
        />
      ) : (
        <span className="tabular-nums">{set.reps}</span>
      )}
      {editing ? (
        <Input
          aria-label={t("RIR подхода {number}", { number: set.position })}
          disabled={saving || !!pending}
          inputMode="decimal"
          value={values.rir}
          onChange={(event) => setValues({ ...values, rir: event.target.value })}
          className="num h-9 min-w-0 px-1"
        />
      ) : (
        <span className="tabular-nums">{set.rir === null ? "—" : number(set.rir)}</span>
      )}
      {set.id &&
        (editing ? (
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("Сохранить подход {number}", { number: set.position })}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "…" : <Check className="h-4 w-4" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("Отмена редактирования подхода")}
              disabled={saving || !!pending}
              onClick={() => {
                setValues({
                  weight: set.weightExact ?? String(set.weight),
                  reps: String(set.reps),
                  rir: set.rir === null ? "" : String(set.rir),
                });
                setEditing(false);
                setPending(null);
                setError("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={t("Изменить подход {number}", { number: set.position })}
            onClick={() => {
              setValues({
                weight: set.weightExact ?? String(set.weight),
                reps: String(set.reps),
                rir: set.rir === null ? "" : String(set.rir),
              });
              setEditing(true);
              setBaseRevision(set.revision);
              setError("");
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ))}
      {error && (
        <p role="alert" className="col-span-5 text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
