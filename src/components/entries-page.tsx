import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { daysQuery, entriesQuery, programQuery } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { toISO } from "@/lib/workout";
import { LoadError, Loading } from "@/components/query-feedback";
import { Button } from "@/components/ui/button";

const selectCls = "h-12 min-w-0 w-full rounded-md border border-input bg-card px-3 text-foreground";
type Period = "today" | 7 | 30 | "all";
type Sort = "recent" | "weight-desc" | "weight-asc";

function daysAgo(days: number, today: string) {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - days);
  return toISO(date);
}

export function EntriesPage() {
  const { userId } = useUserSession();
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
        Не удалось загрузить программу для выбора записей.
      </LoadError>
    );
  if (daysResult.isPending || programResult.isPending)
    return <Loading>Загрузка программы…</Loading>;

  const days = daysResult.data;
  const exercises = programResult.data;
  const dayId = days.some((day) => day.id === chosenDay)
    ? chosenDay
    : (days.find((day) => !day.archived_at)?.id ?? days[0]?.id ?? "");
  const dayExercises = exercises.filter((exercise) => exercise.day_id === dayId);
  const exerciseId = dayExercises.some((exercise) => exercise.id === chosenExercise)
    ? chosenExercise
    : (dayExercises[0]?.id ?? "");

  return (
    <div className="min-w-0 space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Записи</h1>
      {!days.length ? (
        <p>Сначала добавьте тренировочный день и упражнения в программе.</p>
      ) : (
        <>
          <label className="block min-w-0 space-y-1 text-sm">
            Тренировочный день
            <select
              aria-label="День записей"
              className={selectCls}
              value={dayId}
              onChange={(event) => {
                setChosenDay(event.target.value);
                setChosenExercise("");
              }}
            >
              {days.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.name}
                  {day.archived_at ? " (архив)" : ""}
                </option>
              ))}
            </select>
          </label>
          {!dayExercises.length ? (
            <p>В этом дне пока нет упражнений с записями.</p>
          ) : (
            <>
              <label className="block min-w-0 space-y-1 text-sm">
                Упражнение
                <select
                  aria-label="Упражнение записей"
                  className={selectCls}
                  value={exerciseId}
                  onChange={(event) => setChosenExercise(event.target.value)}
                >
                  {dayExercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                      {exercise.archived_at ? " (архив)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <ExerciseEntries
                key={`${userId}:${exerciseId}`}
                userId={userId}
                exerciseId={exerciseId}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function ExerciseEntries({ userId, exerciseId }: { userId: string; exerciseId: string }) {
  const today = toISO(new Date());
  const result = useQuery(entriesQuery(userId, exerciseId, "0001-01-01", today));
  const [period, setPeriod] = useState<Period>(30);
  const [sort, setSort] = useState<Sort>("recent");
  if (result.isError)
    return (
      <LoadError onRetry={() => void result.refetch()}>
        Не удалось загрузить записи упражнения.
      </LoadError>
    );
  if (result.isPending) return <Loading>Загрузка записей…</Loading>;

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

  return (
    <section className="min-w-0 space-y-4" aria-label="Дневник записей упражнения">
      <div className="space-y-2">
        <span className="text-sm">Период</span>
        <div className="flex flex-wrap gap-2" aria-label="Фильтр по дате">
          {(
            [
              ["today", "Сегодня"],
              [7, "7 дней"],
              [30, "30 дней"],
              ["all", "Всё время"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={period === value ? "default" : "secondary"}
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <label className="block min-w-0 space-y-1 text-sm">
        Сортировка
        <select
          aria-label="Сортировка записей"
          className={selectCls}
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
        >
          <option value="recent">Сначала новые</option>
          <option value="weight-desc">Вес: по убыванию</option>
          <option value="weight-asc">Вес: по возрастанию</option>
        </select>
      </label>
      <h2 className="font-bold">Записи · {records.length}</h2>
      {!records.length ? (
        <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground">
          За выбранный период записей нет.
        </p>
      ) : (
        <ul className="min-w-0 space-y-3">
          {records.map((entry) => (
            <li key={entry.id} className="min-w-0 space-y-1 rounded-xl bg-card p-4 text-sm">
              <p className="break-words font-semibold">
                {entry.performed_on} · {entry.day_name ?? "Без названия дня"}
              </p>
              <p className="num break-all text-base font-bold">
                {entry.weight.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг ·{" "}
                {entry.reps.join(" / ")}
              </p>
              <p className="text-muted-foreground">
                {entry.reps.length} {entry.reps.length === 1 ? "подход" : "подхода"}
                {entry.rir !== null && ` · RIR ${entry.rir}`}
              </p>
              {entry.notes?.trim() && <p className="break-words">{entry.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
