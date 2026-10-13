import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { daysQuery, programQuery } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { WorkoutForm } from "@/components/workout-form";
import { Loading, LoadError } from "@/components/query-feedback";

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
  function select(dayId: string, exerciseId: string) {
    setSelection({ dayId, exerciseId });
    try {
      localStorage.setItem(selectionKey, JSON.stringify({ dayId, exerciseId }));
    } catch {
      /* Draft storage errors are shown by the form. */
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
        Не удалось загрузить программу тренировки.
      </LoadError>
    );
  if (programResult.isPending || daysResult.isPending)
    return <Loading>Загрузка программы…</Loading>;
  const days = daysResult.data.filter((day) => !day.archived_at);
  const day = days.find((item) => item.id === selection.dayId) ?? days[0];
  const exercises = programResult.data.filter(
    (exercise) => exercise.day_id === day?.id && !exercise.archived_at,
  );
  const current =
    exercises.find((exercise) => exercise.id === selection.exerciseId) ?? exercises[0];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Тренировка</h1>
      <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
        {days.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => select(item.id, "")}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${day?.id === item.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            {item.name}
          </button>
        ))}
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
          <p className="text-xs text-muted-foreground">
            План: {current.target_sets ?? "—"} × {current.target_reps ?? "—"}. Фактические подходы
            укажите ниже.
          </p>
          <WorkoutForm
            key={`${userId}:${current.id}:${day.id}`}
            exercise={current}
            dayId={day.id}
          />
        </>
      )}
    </div>
  );
}
