import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { daysQuery, programQuery, userKeys, type Day, type Exercise } from "@/lib/queries";
import { exercisePatch, nextPosition, programName } from "@/lib/program";
import { useUserSession } from "@/lib/session";
import { MAX_DAYS } from "@/lib/workout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SortableList } from "@/components/Sortable";
import { Archive, ArchiveRestore, Pencil, X } from "lucide-react";

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
  const [editing, setEditing] = useState<string | null>(null);
  const [managingDays, setManagingDays] = useState(false);
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

  function summary(ex: Exercise) {
    if (ex.target_sets && ex.target_reps)
      return `${ex.target_sets} × ${ex.target_reps.replace("-", "–")}`;
    if (ex.target_sets) return `${ex.target_sets} подх.`;
    if (ex.target_reps) return `${ex.target_reps.replace("-", "–")} повт.`;
    return "Цель не задана";
  }
  function compactRow(ex: Exercise, handle?: ReactNode) {
    return (
      <div className="flex min-h-14 min-w-0 items-center gap-1 rounded-xl bg-card px-2 py-2">
        {handle}
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate font-semibold">{ex.name}</p>
          <p className="truncate text-xs text-muted-foreground">{summary(ex)}</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Редактировать: ${ex.name}`}
          disabled={busy}
          onClick={() => setEditing(ex.id)}
          className="shrink-0"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={ex.archived_at ? `Восстановить: ${ex.name}` : `В архив: ${ex.name}`}
          disabled={busy}
          onClick={() =>
            void run(() =>
              updateExercise(ex.id, {
                archived_at: ex.archived_at ? null : new Date().toISOString(),
              }),
            )
          }
          className="shrink-0 text-muted-foreground"
        >
          {ex.archived_at ? (
            <ArchiveRestore className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
        </Button>
      </div>
    );
  }
  const editingEx = exercises.find((ex) => ex.id === editing);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Программа</h1>
      {error && !managingDays && (
        <p role="alert" className="break-words rounded-xl border border-destructive p-3 text-sm">
          {error}
        </p>
      )}
      <Sheet open={managingDays} onOpenChange={setManagingDays}>
        <section
          aria-label="Тренировочные дни"
          className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
        >
          <div className="min-w-0">
            <h2 className="font-bold">Тренировочные дни</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {active.length} из {MAX_DAYS}
            </p>
          </div>
          <SheetTrigger asChild>
            <Button variant="secondary" className="h-11 shrink-0">
              <Pencil className="h-4 w-4" />
              Изменить дни
            </Button>
          </SheetTrigger>
        </section>
        <SheetContent
          side="bottom"
          className="flex h-dvh flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:ml-auto sm:h-[90dvh] sm:max-w-xl sm:rounded-t-lg [&>button]:hidden"
        >
          <SheetHeader className="safe-top shrink-0 border-b px-4 pb-4 text-left sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle>Тренировочные дни</SheetTitle>
              <SheetClose asChild>
                <Button className="h-11 shrink-0" disabled={busy}>
                  Готово
                </Button>
              </SheetClose>
            </div>
            <SheetDescription>
              {active.length} из {MAX_DAYS} активных дней
            </SheetDescription>
          </SheetHeader>
          <div className="safe-bottom min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pt-4 sm:px-6">
            {error && (
              <p
                role="alert"
                className="break-words rounded-lg border border-destructive p-3 text-sm"
              >
                {error}
              </p>
            )}
            <SortableList
              items={active}
              handleLabel={(day) => `Переместить день ${day.name}`}
              draggingClassName="rounded-lg bg-card shadow-lg ring-2 ring-primary"
              onReorder={(ids) =>
                void run(() =>
                  supabase.rpc("reorder_program_days", { _ids: ids }).abortSignal(signal),
                )
              }
              render={(day, handle) => (
                <DayEditor
                  day={day}
                  handle={handle}
                  busy={busy}
                  run={run}
                  save={(patch) => updateDay(day.id, patch)}
                  canArchive={active.length > 1}
                  canRestore={false}
                />
              )}
            />
            <form onSubmit={addDay} className="flex flex-wrap gap-2 border-t pt-4">
              <Input
                aria-label="Название нового дня"
                value={newDay}
                onChange={(event) => setNewDay(event.target.value)}
                maxLength={60}
                placeholder="Новый день"
                className="h-12 min-w-0 flex-1 basis-40"
                disabled={busy || active.length >= MAX_DAYS}
              />
              <Button
                type="submit"
                className="h-12 shrink-0"
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
                    />
                  ))}
              </details>
            )}
          </div>
        </SheetContent>
      </Sheet>

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
        <SortableList
          items={currentExercises}
          onReorder={(ids) =>
            void run(() =>
              supabase
                .rpc("reorder_program_exercises", { _day_id: dayId, _ids: ids })
                .abortSignal(signal),
            )
          }
          render={(ex, handle) => compactRow(ex, handle)}
        />
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
            <Button type="submit" className="h-12 shrink-0" disabled={busy || !newExercise.trim()}>
              Добавить упражнение
            </Button>
          </form>
        )}
        {exercises.some((ex) => ex.day_id === dayId && ex.archived_at) && (
          <details className="space-y-3">
            <summary className="cursor-pointer py-2 font-bold">Архив упражнений</summary>
            {exercises
              .filter((ex) => ex.day_id === dayId && ex.archived_at)
              .map((ex) => (
                <div key={ex.id}>{compactRow(ex)}</div>
              ))}
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
          {unassigned.map((ex) => (
            <div key={ex.id}>{compactRow(ex)}</div>
          ))}
        </section>
      )}
      <Sheet open={!!editingEx} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Редактирование упражнения</SheetTitle>
          </SheetHeader>
          {editingEx && (
            <ExerciseEditor
              key={editingEx.id + editingEx.day_id}
              exercise={editingEx}
              days={days}
              busy={busy}
              run={async (action) => {
                const ok = await run(action);
                if (ok) setEditing(null);
                return ok;
              }}
              save={(patch) => updateExercise(editingEx.id, patch)}
              nextPosition={(target) =>
                nextPosition(exercises.filter((item) => item.day_id === target))
              }
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type DayEditorProps = {
  day: Day;
  handle?: ReactNode;
  busy: boolean;
  run: Run;
  save: (patch: { name?: string; archived_at?: string | null }) => PromiseLike<Result>;
  canArchive: boolean;
  canRestore: boolean;
};
function DayEditor({ day, handle, busy, run, save, canArchive, canRestore }: DayEditorProps) {
  const [name, setName] = useState(day.name);
  const [editing, setEditing] = useState(false);
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (await run(() => save({ name: programName(name, 60) }))) setEditing(false);
  }
  const archiveLabel = day.archived_at ? "Восстановить день" : "Архивировать день";
  const archiveDisabled = busy || (day.archived_at ? !canRestore : !canArchive);
  return (
    <div role="group" aria-label={`День: ${day.name}`} className="rounded-lg bg-card px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1">
        {handle}
        {editing ? (
          <form onSubmit={rename} className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              aria-label="Название дня"
              value={name}
              maxLength={60}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              className="h-9 min-w-0 flex-1"
              autoFocus
            />
            <Button type="submit" className="h-9 shrink-0" disabled={busy || !name.trim()}>
              Сохранить
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              aria-label="Отменить переименование"
              disabled={busy}
              onClick={() => {
                setName(day.name);
                setEditing(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </form>
        ) : (
          <>
            <span className="min-w-0 flex-1 break-words py-1 text-sm font-medium">{day.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label={`Переименовать день: ${day.name}`}
              disabled={busy}
              onClick={() => {
                setName(day.name);
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label={`${archiveLabel}: ${day.name}`}
          title={archiveLabel}
          disabled={archiveDisabled}
          onClick={() =>
            void run(() => save({ archived_at: day.archived_at ? null : new Date().toISOString() }))
          }
        >
          {day.archived_at ? (
            <ArchiveRestore className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
        </Button>
      </div>
      {!day.archived_at && !canArchive && (
        <p className="text-xs text-muted-foreground">Нужен хотя бы один активный день.</p>
      )}
    </div>
  );
}

type ExerciseEditorProps = {
  exercise: Exercise;
  days: Day[];
  busy: boolean;
  run: Run;
  save: (patch: TablesUpdate<"program_exercises">) => PromiseLike<Result>;
  nextPosition: (dayId: string) => number;
};
function ExerciseEditor({
  exercise: ex,
  days,
  busy,
  run,
  save,
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
    <form aria-label={`Упражнение: ${ex.name}`} onSubmit={submit} className="space-y-3 pt-2">
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
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !name.trim()}>
          Сохранить
        </Button>
      </div>
    </form>
  );
}
