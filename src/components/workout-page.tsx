import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { daysQuery, programQuery } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { useWorkoutPreferences } from "@/lib/archive-preferences";
import { toISO } from "@/lib/workout";
import { isWorkoutDate } from "@/lib/workout-input";
import { WorkoutForm } from "@/components/workout-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loading, LoadError } from "@/components/query-feedback";
import { useI18n, exerciseCount } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function WorkoutPage() {
  const { t, language } = useI18n();
  const { userId } = useUserSession();
  const { autoAdvance } = useWorkoutPreferences(userId);
  const programResult = useQuery(programQuery(userId));
  const daysResult = useQuery(daysQuery(userId));
  const selectionKey = `workout:selection:v1:${userId}`;
  const [selection, setSelection] = useState<{ dayId: string; exerciseId: string }>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(selectionKey) ?? "null") as unknown;
      if (
        value &&
        typeof value === "object" &&
        "dayId" in value &&
        "exerciseId" in value &&
        typeof value.dayId === "string" &&
        typeof value.exerciseId === "string"
      )
        return { dayId: value.dayId, exerciseId: value.exerciseId };
    } catch {
      /* Selection is optional; the workout draft is read separately. */
    }
    return { dayId: "", exerciseId: "" };
  });
  const dateKey = `workout:date:v1:${userId}`;
  const [workoutDate, setWorkoutDate] = useState(() => {
    try {
      const saved = localStorage.getItem(dateKey);
      if (saved && isWorkoutDate(saved)) return saved;
    } catch {
      /* Date persistence is optional; exercise drafts remain separate. */
    }
    return toISO(new Date());
  });
  const [completedDay, setCompletedDay] = useState<{ dayId: string; date: string } | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [focusStarted, setFocusStarted] = useState(false);
  const activeFocus = focusMode && focusStarted;
  const [focusListOpen, setFocusListOpen] = useState(false);
  const [savedExercises, setSavedExercises] = useState<Record<string, string[]>>({});
  const days = useMemo(
    () => daysResult.data?.filter((day) => !day.archived_at) ?? [],
    [daysResult.data],
  );
  const activeExercises = useMemo(
    () => programResult.data?.filter((exercise) => !exercise.archived_at) ?? [],
    [programResult.data],
  );
  const day = days.find((item) => item.id === selection.dayId) ?? days[0];
  const exercises = activeExercises
    .filter((exercise) => exercise.day_id === day?.id)
    .sort((a, b) => a.position - b.position);
  const current =
    exercises.find((exercise) => exercise.id === selection.exerciseId) ?? exercises[0];
  const currentIndex = current ? exercises.findIndex((exercise) => exercise.id === current.id) : -1;
  const focusSessionKey = `${day?.id ?? ""}:${workoutDate}`;
  const completedExerciseIds = new Set(savedExercises[focusSessionKey] ?? []);
  const allExercisesCompleted =
    exercises.length > 0 && exercises.every((item) => completedExerciseIds.has(item.id));

  useEffect(() => {
    if (!daysResult.isSuccess || !programResult.isSuccess) return;
    const dayId = days.some((item) => item.id === selection.dayId)
      ? selection.dayId
      : (days[0]?.id ?? "");
    const exerciseId = activeExercises.some(
      (exercise) => exercise.day_id === dayId && exercise.id === selection.exerciseId,
    )
      ? selection.exerciseId
      : (activeExercises.find((exercise) => exercise.day_id === dayId)?.id ?? "");
    if (dayId === selection.dayId && exerciseId === selection.exerciseId) return;
    const next = { dayId, exerciseId };
    setSelection(next);
    try {
      localStorage.setItem(selectionKey, JSON.stringify(next));
    } catch {
      /* Selection remains available for this page view if storage is unavailable. */
    }
  }, [
    activeExercises,
    days,
    daysResult.isSuccess,
    programResult.isSuccess,
    selection,
    selectionKey,
  ]);

  function select(dayId: string, exerciseId: string) {
    setSelection({ dayId, exerciseId });
    try {
      localStorage.setItem(selectionKey, JSON.stringify({ dayId, exerciseId }));
    } catch {
      /* Draft storage errors are shown by the form. */
    }
  }
  function afterSaved(exerciseId: string, dayId: string, date: string) {
    const selectedExerciseId = selection.exerciseId || exercises[0]?.id;
    if (selection.dayId !== dayId || selectedExerciseId !== exerciseId) return false;
    if (activeFocus) {
      const sessionKey = `${dayId}:${date}`;
      const nextCompletedIds = new Set(savedExercises[sessionKey] ?? []);
      nextCompletedIds.add(exerciseId);
      const nextIds = [...nextCompletedIds];
      setSavedExercises((current) => ({ ...current, [sessionKey]: nextIds }));
      const index = exercises.findIndex((item) => item.id === exerciseId);
      const orderedCandidates = [...exercises.slice(index + 1), ...exercises.slice(0, index)];
      const next = orderedCandidates.find((item) => !nextCompletedIds.has(item.id));
      if (next) select(dayId, next.id);
      return true;
    }
    if (!autoAdvance) return false;
    const sessionKey = `${dayId}:${date}`;
    const completedIds = new Set(savedExercises[sessionKey] ?? []);
    completedIds.add(exerciseId);
    setSavedExercises((current) => ({
      ...current,
      [sessionKey]: [...new Set([...(current[sessionKey] ?? []), exerciseId])],
    }));
    const index = exercises.findIndex((exercise) => exercise.id === exerciseId);
    const next = index >= 0 ? exercises[index + 1] : undefined;
    if (next) {
      const nextSelection = { dayId, exerciseId: next.id };
      setSelection(nextSelection);
      try {
        localStorage.setItem(selectionKey, JSON.stringify(nextSelection));
      } catch {
        /* Keep the in-memory selection if storage is unavailable. */
      }
      setCompletedDay(null);
      return true;
    }
    if (exercises.every((exercise) => completedIds.has(exercise.id)))
      setCompletedDay({ dayId, date });
    return false;
  }
  function changeDate(date: string) {
    setWorkoutDate(date);
    try {
      if (isWorkoutDate(date)) localStorage.setItem(dateKey, date);
    } catch {
      /* The current session keeps its date even if optional persistence is unavailable. */
    }
  }
  function nextUnfinishedExercise(fromIndex: number) {
    if (!exercises.length) return undefined;
    const candidates = [...exercises.slice(fromIndex + 1), ...exercises.slice(0, fromIndex + 1)];
    return candidates.find((item) => !completedExerciseIds.has(item.id));
  }
  function skipCurrentExercise() {
    if (!day || currentIndex < 0) return;
    const next = nextUnfinishedExercise(currentIndex);
    if (next && next.id !== current?.id) {
      select(day.id, next.id);
      setFocusListOpen(false);
    }
  }
  if (programResult.isError || daysResult.isError)
    return (
      <LoadError
        onRetry={() => {
          void programResult.refetch();
          void daysResult.refetch();
        }}
      >
        {t("Не удалось загрузить программу тренировки.")}
      </LoadError>
    );
  if (programResult.isPending || daysResult.isPending)
    return <Loading>{t("Загрузка программы…")}</Loading>;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("Тренировка")}</h1>
      {!activeFocus && (
        <div
          className="grid grid-cols-2 rounded-xl bg-muted p-1"
          role="group"
          aria-label={t("Режим тренировки")}
        >
          <Button
            type="button"
            variant={!focusMode ? "secondary" : "ghost"}
            className="h-10"
            aria-pressed={!focusMode}
            onClick={() => {
              setFocusMode(false);
              setFocusStarted(false);
            }}
          >
            {t("Обычный")}
          </Button>
          <Button
            type="button"
            variant={focusMode ? "secondary" : "ghost"}
            className="h-10"
            aria-pressed={focusMode}
            onClick={() => {
              setFocusMode(true);
              setFocusStarted(false);
            }}
          >
            {t("Фокус")}
          </Button>
        </div>
      )}
      {!activeFocus && (
        <div className="min-w-0 space-y-2">
          <label id="training-day-label" className="block text-sm font-medium">
            {t("Тренировочный день")}
          </label>
          <Select
            value={day?.id ?? ""}
            onValueChange={(dayId) => select(dayId, "")}
            disabled={!days.length}
          >
            <SelectTrigger
              aria-label={t("Тренировочный день")}
              aria-labelledby="training-day-label"
              className="h-12 min-w-0 bg-card text-foreground"
            >
              <SelectValue placeholder={t("Нет активных дней")} />
            </SelectTrigger>
            <SelectContent
              position="popper"
              side="bottom"
              align="start"
              collisionPadding={8}
              className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1rem)]"
            >
              {days.map((item) => {
                const count = activeExercises.filter(
                  (exercise) => exercise.day_id === item.id,
                ).length;
                return (
                  <SelectItem
                    key={item.id}
                    value={item.id}
                    className="h-auto min-h-10 whitespace-normal py-2"
                  >
                    <span className="block min-w-0 whitespace-normal break-words leading-snug">
                      {item.name} · {exerciseCount(count, language)}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}
      {!day && (
        <p>
          {t("Нет активных дней.")}{" "}
          <Link to="/program" className="text-primary-text">
            {t("Добавьте или восстановите день")}
          </Link>
        </p>
      )}
      {day && !current && (
        <p>
          {t("В этом дне нет активных упражнений.")}{" "}
          <Link to="/program" className="text-primary-text">
            {t("Добавьте упражнение")}
          </Link>
        </p>
      )}
      {!focusMode && current && day && (
        <label className="block space-y-2 text-sm">
          {t("Упражнение")}
          <select
            aria-label={t("Упражнение")}
            className="h-12 w-full min-w-0 rounded-md border border-input bg-card px-3"
            value={current.id}
            onChange={(event) => select(day.id, event.target.value)}
          >
            {exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!focusMode && current && day && (
        <WorkoutForm
          key={`${userId}:${current.id}:${day.id}`}
          exercise={current}
          dayId={day.id}
          initialDate={workoutDate}
          onDateChange={changeDate}
          onSaved={afterSaved}
        />
      )}
      {focusMode && !focusStarted && day && (
        <section
          className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
          aria-label={t("Подготовка тренировки")}
        >
          <div className="space-y-2">
            <Label htmlFor="focus-date">{t("Дата")}</Label>
            <Input
              id="focus-date"
              type="date"
              value={workoutDate}
              onChange={(event) => changeDate(event.target.value)}
              className="h-12"
              required
            />
          </div>
          <Button
            type="button"
            className="h-14 w-full text-base font-semibold"
            disabled={!current}
            onClick={() => {
              setFocusStarted(true);
              setFocusListOpen(false);
            }}
          >
            {t("Начать тренировку")}
          </Button>
        </section>
      )}
      {focusMode && !focusStarted && !day && (
        <p className="text-sm text-muted-foreground">
          {t("Добавьте тренировочный день, чтобы начать.")}
        </p>
      )}
      {activeFocus && current && day && (
        <section
          key={`focus:${day.id}:${current.id}`}
          className="overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm animate-in fade-in zoom-in-95 duration-250 motion-reduce:animate-none motion-reduce:transition-none sm:p-5"
          aria-label={t("Focus Mode")}
        >
          <div
            className="mb-4 grid grid-cols-2 rounded-xl bg-muted p-1"
            role="group"
            aria-label={t("Режим тренировки")}
          >
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              aria-pressed={!focusMode}
              onClick={() => {
                setFocusMode(false);
                setFocusStarted(false);
                setFocusListOpen(false);
              }}
            >
              {t("Обычный")}
            </Button>
            <Button
              type="button"
              variant={focusMode ? "secondary" : "ghost"}
              className="h-10"
              aria-pressed={focusMode}
              onClick={() => setFocusMode(true)}
            >
              {t("Фокус")}
            </Button>
          </div>
          {allExercisesCompleted ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check aria-hidden="true" className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{t("Тренировка завершена")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("Все упражнения записаны")}</p>
              </div>
              <Button
                className="h-12 w-full"
                onClick={() => {
                  setFocusMode(false);
                  setFocusStarted(false);
                }}
              >
                {t("Завершить и вернуться")}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {day.name} ·{" "}
                    {t("Упражнение {number} из {count}", {
                      number: currentIndex + 1,
                      count: exercises.length,
                    })}
                  </p>
                  <h2 className="mt-1 break-words text-xl font-bold">{current.name}</h2>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 px-3"
                  disabled={
                    exercises.filter((item) => !completedExerciseIds.has(item.id)).length <= 1
                  }
                  onClick={skipCurrentExercise}
                >
                  {t("Скип")}
                </Button>
              </div>
              <div className="mt-3 border-b border-border pb-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 w-full justify-between px-2 text-sm"
                  aria-expanded={focusListOpen}
                  onClick={() => setFocusListOpen((open) => !open)}
                >
                  <span>
                    {t("Упражнения · {done} из {total}", {
                      done: completedExerciseIds.size,
                      total: exercises.length,
                    })}
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${focusListOpen ? "rotate-180" : ""}`}
                  />
                </Button>
                {focusListOpen && (
                  <div className="mt-2 space-y-1" aria-label={t("Все упражнения тренировки")}>
                    {exercises.map((item, index) => {
                      const done = completedExerciseIds.has(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={item.id === current.id ? "step" : undefined}
                          disabled={done}
                          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                          onClick={() => {
                            select(day.id, item.id);
                            setFocusListOpen(false);
                          }}
                        >
                          <span className="num w-6 text-xs text-muted-foreground">{index + 1}</span>
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                          {done && (
                            <Check aria-label={t("Выполнено")} className="h-4 w-4 text-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <WorkoutForm
                key={`${userId}:${current.id}:${day.id}`}
                exercise={current}
                dayId={day.id}
                initialDate={workoutDate}
                onDateChange={changeDate}
                onSaved={afterSaved}
                focusMode
              />
              <div className="mt-4 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-full"
                  onClick={() => {
                    setFocusMode(false);
                    setFocusStarted(false);
                  }}
                >
                  {t("Вернуться в обычный режим")}
                </Button>
              </div>
            </>
          )}
        </section>
      )}
      {completedDay &&
        completedDay.dayId === day?.id &&
        completedDay.date === workoutDate &&
        !activeFocus &&
        !focusMode && (
          <p role="status" className="text-xs text-muted-foreground">
            {t(
              "Все упражнения этого дня пройдены. Можно выбрать упражнение для дополнительной сессии.",
            )}
          </p>
        )}
    </div>
  );
}
