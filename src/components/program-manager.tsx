import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { daysQuery, programQuery, userKeys, type Day, type Exercise } from "@/lib/queries";
import { exercisePatch, movedIds, nextPosition, programName } from "@/lib/program";
import { useUserSession } from "@/lib/session";
import { MAX_DAYS } from "@/lib/workout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { error: { message: string; code?: string } | null };
type Run = (action: () => PromiseLike<Result>) => Promise<boolean>;
const selectCls = "h-12 w-full min-w-0 rounded-md border border-input bg-card px-3 text-foreground";

export function ProgramManager() {
  const { userId, signal, isCurrent } = useUserSession();
  const qc = useQueryClient();
  const daysResult = useQuery(daysQuery(userId));
  const programResult = useQuery(programQuery(userId));
  const days = daysResult.data ?? [];
  const exercises = programResult.data ?? [];
  const active = days.filter((day) => !day.archived_at);
  const [selected, setSelected] = useState("");
  const [newDay, setNewDay] = useState("");
  const [newExercise, setNewExercise] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedDay = days.find((day) => day.id === selected) ?? active[0] ?? days[0];
  const dayId = selectedDay?.id ?? "";
  const currentExercises = exercises.filter((ex) => ex.day_id === dayId && !ex.archived_at);
  const unassigned = exercises.filter((ex) => ex.day_id === null);

  const run: Run = async (action) => {
    if (busy || !isCurrent()) return false;
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (!isCurrent()) return false;
      if (result.error) {
        const message = result.error.message;
        if (message.includes("7 активных дней") || message.includes("хотя бы один активный день"))
          throw new Error(message);
        if (result.error.code === "22023" || result.error.code === "PGRST116")
          throw new Error("Программа изменилась. Обновите страницу и повторите действие.");
        throw new Error(
          "Не удалось сохранить изменения. Проверьте соединение и повторите попытку.",
        );
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: userKeys.days(userId) }),
        qc.invalidateQueries({ queryKey: userKeys.program(userId) }),
      ]);
      return isCurrent();
    } catch (err) {
      if (isCurrent())
        setError(err instanceof Error ? err.message : "Не удалось сохранить изменения");
      return false;
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  async function addDay(event: FormEvent) {
    event.preventDefault();
    if (active.length >= MAX_DAYS) return;
    if (
      await run(() =>
        supabase
          .from("program_days")
          .insert({ user_id: userId, name: programName(newDay, 60), position: nextPosition(days) })
          .abortSignal(signal),
      )
    )
      setNewDay("");
  }
  async function addExercise(event: FormEvent) {
    event.preventDefault();
    if (!selectedDay || selectedDay.archived_at) return;
    if (
      await run(() =>
        supabase
          .from("program_exercises")
          .insert({
            user_id: userId,
            day_id: dayId,
            name: programName(newExercise, 100),
            position: nextPosition(exercises.filter((ex) => ex.day_id === dayId)),
            target_sets: 3,
          })
          .abortSignal(signal),
      )
    )
      setNewExercise("");
  }
  const updateDay = (id: string, patch: { name?: string; archived_at?: string | null }) =>
    supabase
      .from("program_days")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .abortSignal(signal)
      .single();
  const updateExercise = (id: string, patch: TablesUpdate<"program_exercises">) =>
    supabase
      .from("program_exercises")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .abortSignal(signal)
      .single();

  if (daysResult.isPending || programResult.isPending)
    return <p role="status">Загрузка программы…</p>;
  if (daysResult.isError || programResult.isError)
    return (
      <div role="alert">
        Не удалось загрузить программу.{" "}
        <Button
          onClick={() => {
            void daysResult.refetch();
            void programResult.refetch();
          }}
        >
          Повторить
        </Button>
      </div>
    );

  function exerciseRow(ex: Exercise, index: number, ordered: Exercise[]) {
    return (
      <ExerciseEditor
        key={ex.id}
        exercise={ex}
        days={days}
        busy={busy}
        run={run}
        save={(patch) => updateExercise(ex.id, patch)}
        move={(direction) =>
          run(() =>
            supabase
              .rpc("reorder_program_exercises", {
                _day_id: dayId,
                _ids: movedIds(ordered, index, direction),
              })
              .abortSignal(signal),
          )
        }
        canUp={ex.day_id !== null && !ex.archived_at && index > 0}
        canDown={ex.day_id !== null && !ex.archived_at && index < ordered.length - 1}
        nextPosition={(target) => nextPosition(exercises.filter((item) => item.day_id === target))}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Программа</h1>
      {error && (
        <p role="alert" className="break-words rounded-xl border border-destructive p-3 text-sm">
          {error}
        </p>
      )}
      <section aria-label="Тренировочные дни" className="space-y-3">
        <h2 className="font-bold">
          Тренировочные дни · {active.length} из {MAX_DAYS}
        </h2>
        <p className="text-sm text-muted-foreground">
          Архив скрывает день из новых тренировок. Упражнения и история сохраняются.
        </p>
        {active.map((day, index) => (
          <DayEditor
            key={day.id}
            day={day}
            busy={busy}
            run={run}
            save={(patch) => updateDay(day.id, patch)}
            canArchive={active.length > 1}
            canRestore={false}
            canUp={index > 0}
            canDown={index < active.length - 1}
            move={(direction) =>
              run(() =>
                supabase
                  .rpc("reorder_program_days", { _ids: movedIds(active, index, direction) })
                  .abortSignal(signal),
              )
            }
          />
        ))}
        <form onSubmit={addDay} className="flex gap-2">
          <Input
            aria-label="Название нового дня"
            value={newDay}
            onChange={(event) => setNewDay(event.target.value)}
            maxLength={60}
            placeholder="Новый день"
            className="h-12 min-w-0"
            disabled={busy || active.length >= MAX_DAYS}
          />
          <Button
            type="submit"
            className="h-12"
            disabled={busy || !newDay.trim() || active.length >= MAX_DAYS}
          >
            Добавить день
          </Button>
        </form>
        {active.length >= MAX_DAYS && (
          <p className="text-sm text-muted-foreground">Можно иметь не более 7 активных дней.</p>
        )}
        {days.some((day) => day.archived_at) && (
          <details className="space-y-3">
            <summary className="cursor-pointer py-2 font-bold">Архив дней</summary>
            {days
              .filter((day) => day.archived_at)
              .map((day) => (
                <DayEditor
                  key={day.id}
                  day={day}
                  busy={busy}
                  run={run}
                  save={(patch) => updateDay(day.id, patch)}
                  canArchive={false}
                  canRestore={active.length < MAX_DAYS}
                  canUp={false}
                  canDown={false}
                  move={async () => false}
                />
              ))}
          </details>
        )}
      </section>

      <section aria-label="Упражнения" className="space-y-3">
        <h2 className="font-bold">Упражнения</h2>
        <select
          aria-label="День для упражнений"
          className={selectCls}
          value={dayId}
          disabled={busy || !days.length}
          onChange={(event) => setSelected(event.target.value)}
        >
          {!days.length && <option value="">Добавьте день</option>}
          {days.map((day) => (
            <option key={day.id} value={day.id}>
              {day.name}
              {day.archived_at ? " (архив)" : ""}
            </option>
          ))}
        </select>
        {selectedDay?.archived_at && (
          <p className="text-sm text-muted-foreground">
            День в архиве. Восстановите его для новых тренировок или перенесите упражнения в
            активный день.
          </p>
        )}
        {currentExercises.map((ex, index) => exerciseRow(ex, index, currentExercises))}
        {!currentExercises.length && (
          <p className="text-sm text-muted-foreground">Упражнений пока нет.</p>
        )}
        {selectedDay && !selectedDay.archived_at && (
          <form onSubmit={addExercise} className="flex gap-2">
            <Input
              aria-label="Название нового упражнения"
              value={newExercise}
              onChange={(event) => setNewExercise(event.target.value)}
              maxLength={100}
              placeholder="Новое упражнение"
              className="h-12 min-w-0"
              disabled={busy}
            />
            <Button type="submit" className="h-12" disabled={busy || !newExercise.trim()}>
              Добавить
            </Button>
          </form>
        )}
        {exercises.some((ex) => ex.day_id === dayId && ex.archived_at) && (
          <details className="space-y-3">
            <summary className="cursor-pointer py-2 font-bold">Архив упражнений</summary>
            {exercises
              .filter((ex) => ex.day_id === dayId && ex.archived_at)
              .map((ex) => exerciseRow(ex, 0, []))}
          </details>
        )}
      </section>

      {unassigned.length > 0 && (
        <section aria-label="Упражнения без дня" className="space-y-3 rounded-xl border p-3">
          <h2 className="font-bold">Без назначенного дня · {unassigned.length}</h2>
          <p className="text-sm text-muted-foreground">
            Эти упражнения сохранены без привязки к дню. Выберите день вручную и сохраните. История
            останется без изменений.
          </p>
          {unassigned.map((ex) => exerciseRow(ex, 0, []))}
        </section>
      )}
    </div>
  );
}

type DayEditorProps = {
  day: Day;
  busy: boolean;
  run: Run;
  save: (patch: { name?: string; archived_at?: string | null }) => PromiseLike<Result>;
  canArchive: boolean;
  canRestore: boolean;
  canUp: boolean;
  canDown: boolean;
  move: (direction: -1 | 1) => Promise<boolean>;
};
function DayEditor({
  day,
  busy,
  run,
  save,
  canArchive,
  canRestore,
  canUp,
  canDown,
  move,
}: DayEditorProps) {
  const [name, setName] = useState(day.name);
  return (
    <form
      aria-label={`День: ${day.name}`}
      className="space-y-2 rounded-xl bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() => save({ name: programName(name, 60) }));
      }}
    >
      <Input
        aria-label="Название дня"
        value={name}
        maxLength={60}
        disabled={busy}
        onChange={(event) => setName(event.target.value)}
        className="h-12"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" disabled={busy || !name.trim()}>
          Переименовать
        </Button>
        {!day.archived_at && (
          <>
            <Button
              type="button"
              variant="secondary"
              aria-label="День выше"
              disabled={busy || !canUp}
              onClick={() => void move(-1)}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-label="День ниже"
              disabled={busy || !canDown}
              onClick={() => void move(1)}
            >
              ↓
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy || (day.archived_at ? !canRestore : !canArchive)}
          onClick={() =>
            void run(() => save({ archived_at: day.archived_at ? null : new Date().toISOString() }))
          }
        >
          {day.archived_at ? "Восстановить день" : "В архив"}
        </Button>
      </div>
      {!day.archived_at && !canArchive && (
        <p className="text-xs text-muted-foreground">Нужен хотя бы один активный день.</p>
      )}
    </form>
  );
}

type ExerciseEditorProps = {
  exercise: Exercise;
  days: Day[];
  busy: boolean;
  run: Run;
  save: (patch: TablesUpdate<"program_exercises">) => PromiseLike<Result>;
  move: (direction: -1 | 1) => Promise<boolean>;
  canUp: boolean;
  canDown: boolean;
  nextPosition: (dayId: string) => number;
};
function ExerciseEditor({
  exercise: ex,
  days,
  busy,
  run,
  save,
  move,
  canUp,
  canDown,
  nextPosition: positionFor,
}: ExerciseEditorProps) {
  const [name, setName] = useState(ex.name);
  const [dayId, setDayId] = useState(ex.day_id ?? "");
  const [sets, setSets] = useState(String(ex.target_sets ?? ""));
  const [reps, setReps] = useState(ex.target_reps ?? "");
  const [weight, setWeight] = useState(String(ex.working_weight ?? ""));
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() => {
      if (dayId !== ex.day_id && dayId && days.find((day) => day.id === dayId)?.archived_at)
        throw new Error("Перенос возможен только в активный день");
      const patch = exercisePatch({ name, dayId, sets, reps, weight }, days);
      if (patch.day_id !== ex.day_id && patch.day_id) patch.position = positionFor(patch.day_id);
      return save(patch);
    });
  }
  return (
    <form
      aria-label={`Упражнение: ${ex.name}`}
      onSubmit={submit}
      className="space-y-3 rounded-xl bg-card p-3"
    >
      <label className="block space-y-1 text-xs">
        Название упражнения
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          className="h-12"
          disabled={busy}
        />
      </label>
      <label className="block space-y-1 text-xs">
        Тренировочный день
        <select
          className={selectCls}
          value={dayId}
          onChange={(event) => setDayId(event.target.value)}
          disabled={busy}
        >
          {!ex.day_id && <option value="">Без назначенного дня</option>}
          {days
            .filter((day) => !day.archived_at || day.id === ex.day_id)
            .map((day) => (
              <option key={day.id} value={day.id}>
                {day.name}
                {day.archived_at ? " (архив)" : ""}
              </option>
            ))}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1 text-xs">
          Вес, кг
          <Input
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
            disabled={busy}
            className="h-12"
            placeholder="—"
          />
        </label>
        <label className="space-y-1 text-xs">
          Подходы
          <Input
            inputMode="numeric"
            value={sets}
            onChange={(event) => setSets(event.target.value)}
            disabled={busy}
            className="h-12"
            placeholder="—"
          />
        </label>
        <label className="space-y-1 text-xs">
          Повторения
          <Input
            value={reps}
            onChange={(event) => setReps(event.target.value)}
            disabled={busy}
            className="h-12"
            placeholder="8–12"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>
          Сохранить
        </Button>
        {!ex.archived_at && (
          <>
            <Button
              type="button"
              variant="secondary"
              aria-label="Упражнение выше"
              disabled={busy || !canUp}
              onClick={() => void move(-1)}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-label="Упражнение ниже"
              disabled={busy || !canDown}
              onClick={() => void move(1)}
            >
              ↓
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(() => save({ archived_at: ex.archived_at ? null : new Date().toISOString() }))
          }
        >
          {ex.archived_at ? "Восстановить упражнение" : "В архив"}
        </Button>
      </div>
    </form>
  );
}
