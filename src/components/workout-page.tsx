import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { daysQuery, programQuery } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { toISO } from "@/lib/workout";
import { WorkoutForm } from "@/components/workout-form";
import { Loading, LoadError } from "@/components/query-feedback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function exerciseCount(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? "упражнений"
      : last === 1
        ? "упражнение"
        : last >= 2 && last <= 4
          ? "упражнения"
          : "упражнений";
  return `${count} ${noun}`;
}

export function WorkoutPage() {
  const { userId } = useUserSession();
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
  const [workoutDate, setWorkoutDate] = useState(() => toISO(new Date()));
  const [completedDay, setCompletedDay] = useState<{ dayId: string; date: string } | null>(null);
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
    setWorkoutDate(date);
    const selectedExerciseId = selection.exerciseId || exercises[0]?.id;
    if (selection.dayId !== dayId || selectedExerciseId !== exerciseId) return false;
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
  if (programResult.isError || daysResult.isError)
    return (
      <LoadError
        onRetry={() => {
          void programResult.refetch();
          void daysResult.refetch();
        }}
      >
        Не удалось загрузить программу тренировки.
      </LoadError>
    );
  if (programResult.isPending || daysResult.isPending)
    return <Loading>Загрузка программы…</Loading>;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Тренировка</h1>
      <div className="min-w-0 space-y-2">
        <label id="training-day-label" className="block text-sm font-medium">
          Тренировочный день
        </label>
        <Select
          value={day?.id ?? ""}
          onValueChange={(dayId) => select(dayId, "")}
          disabled={!days.length}
        >
          <SelectTrigger
            aria-label="Тренировочный день"
            aria-labelledby="training-day-label"
            className="h-12 min-w-0 bg-card text-foreground"
          >
            <SelectValue placeholder="Нет активных дней" />
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
                    {item.name} · {exerciseCount(count)}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      {!day && (
        <p>
          Нет активных дней.{" "}
          <Link to="/program" className="text-primary">
            Добавьте или восстановите день
          </Link>
        </p>
      )}
      {day && !current && (
        <p>
          В этом дне нет активных упражнений.{" "}
          <Link to="/program" className="text-primary">
            Добавьте упражнение
          </Link>
        </p>
      )}
      {current && day && (
        <>
          <label className="block space-y-2 text-sm">
            Упражнение
            <select
              aria-label="Упражнение"
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
          {completedDay?.dayId === day.id && completedDay.date === workoutDate && (
            <p role="status" className="text-xs text-muted-foreground">
              Все упражнения этого дня пройдены. Можно выбрать упражнение для дополнительной сессии.
            </p>
          )}
          <WorkoutForm
            key={`${userId}:${current.id}:${day.id}`}
            exercise={current}
            dayId={day.id}
            initialDate={workoutDate}
            onDateChange={setWorkoutDate}
            onSaved={afterSaved}
          />
        </>
      )}
    </div>
  );
}
