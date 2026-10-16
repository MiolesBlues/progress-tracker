import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Target } from "lucide-react";
import { daysQuery, programQuery } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { useWorkoutPreferences } from "@/lib/archive-preferences";
import { toISO } from "@/lib/workout";
import { isWorkoutDate } from "@/lib/workout-input";
import { WorkoutForm } from "@/components/workout-form";
import { Button } from "@/components/ui/button";
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
  const focusOrderKey = `workout:focus-order:v1:${userId}`;
  const [focusOrder, setFocusOrder] = useState<Record<string, string[]>>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(focusOrderKey) ?? "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, string[]>)
        : {};
    } catch {
      return {};
    }
  });
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
  const focusExercises = [...exercises].sort((a, b) => {
    const order = focusOrder[day?.id ?? ""] ?? [];
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (
      (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi) ||
      a.position - b.position
    );
  });
  const current =
    exercises.find((exercise) => exercise.id === selection.exerciseId) ?? exercises[0];
  const executionExercises = focusMode ? focusExercises : exercises;
  const currentIndex = current
    ? executionExercises.findIndex((exercise) => exercise.id === current.id)
    : -1;

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
    if (!autoAdvance) return false;
    const sessionKey = `${dayId}:${date}`;
    const completedIds = new Set(savedExercises[sessionKey] ?? []);
    completedIds.add(exerciseId);
    setSavedExercises((current) => ({
      ...current,
      [sessionKey]: [...new Set([...(current[sessionKey] ?? []), exerciseId])],
    }));
    const index = executionExercises.findIndex((exercise) => exercise.id === exerciseId);
    const next = index >= 0 ? executionExercises[index + 1] : undefined;
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
  function moveFocusExercise(direction: -1 | 1) {
    if (!day || currentIndex < 0) return;
    const ids = focusExercises.map((exercise) => exercise.id);
    const target = currentIndex + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[currentIndex], ids[target]] = [ids[target]!, ids[currentIndex]!];
    const next = { ...focusOrder, [day.id]: ids };
    setFocusOrder(next);
    try {
      localStorage.setItem(focusOrderKey, JSON.stringify(next));
    } catch {
      /* The current order remains available for this view. */
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("Тренировка")}</h1>
        <Button
          type="button"
          variant={focusMode ? "default" : "outline"}
          aria-pressed={focusMode}
          onClick={() => setFocusMode((enabled) => !enabled)}
        >
          <Target aria-hidden="true" className="h-4 w-4" />
          {focusMode ? t("Обычный режим") : t("Focus Mode")}
        </Button>
      </div>
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
      {current && day && (
        <>
          {focusMode ? (
            <section
              key={current.id}
              className="space-y-3 rounded-2xl bg-card p-4 animate-in fade-in slide-in-from-right-2 duration-250 motion-reduce:animate-none motion-reduce:transition-none"
              aria-label={t("Текущее упражнение")}
            >
              <p className="text-xs text-muted-foreground">
                {day.name} ·{" "}
                {t("Упражнение {number} из {count}", {
                  number: currentIndex + 1,
                  count: focusExercises.length,
                })}
              </p>
              <h2 className="break-words text-xl font-bold">{current.name}</h2>
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={currentIndex <= 0}
                  onClick={() => select(day.id, focusExercises[currentIndex - 1]!.id)}
                >
                  {t("Предыдущее упражнение")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={currentIndex < 0 || currentIndex >= focusExercises.length - 1}
                  onClick={() => select(day.id, focusExercises[currentIndex + 1]!.id)}
                >
                  {t("Следующее упражнение")}
                </Button>
              </div>
              <div className="flex justify-end gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("Переместить упражнение для выполнения выше")}
                  disabled={currentIndex <= 0}
                  onClick={() => moveFocusExercise(-1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={t("Переместить упражнение для выполнения ниже")}
                  disabled={currentIndex >= focusExercises.length - 1}
                  onClick={() => moveFocusExercise(1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </section>
          ) : (
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
          {completedDay?.dayId === day.id && completedDay.date === workoutDate && (
            <p role="status" className="text-xs text-muted-foreground">
              {t(
                "Все упражнения этого дня пройдены. Можно выбрать упражнение для дополнительной сессии.",
              )}
            </p>
          )}
          <WorkoutForm
            key={`${userId}:${current.id}:${day.id}`}
            exercise={current}
            dayId={day.id}
            initialDate={workoutDate}
            onDateChange={changeDate}
            onSaved={afterSaved}
            focusMode={focusMode}
          />
        </>
      )}
    </div>
  );
}
