import { pendingRpc } from "@/lib/pending-rpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { daysQuery, programQuery, userKeys, type Day, type Exercise } from "@/lib/queries";
import { exercisePatch, nextPosition, programName } from "@/lib/program";
import { useUserSession } from "@/lib/session";
import { MAX_DAYS } from "@/lib/workout";
import { useI18n, translateKnown } from "@/lib/i18n";
import { useArchivePreferences } from "@/lib/archive-preferences";
import { removeExerciseDrafts } from "@/lib/workout-draft";
import {
  clearArchiveDeletionPending,
  markArchiveDeletionPending,
  readPendingArchiveDeletions,
} from "@/lib/archive-deletion";
import { ArchiveDeleteDialog } from "@/components/archive-delete-dialog";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Result = { error: { message: string; code?: string } | null };
type Run = (action: () => PromiseLike<Result>) => Promise<boolean>;
const selectCls = "h-12 w-full min-w-0 rounded-md border border-input bg-card px-3 text-foreground";

export function ProgramManager() {
  const { t, language } = useI18n();
  const { userId, signal, isCurrent } = useUserSession();
  const { deletionEnabled } = useArchivePreferences(userId);
  const qc = useQueryClient();
  const daysResult = useQuery(daysQuery(userId));
  const programResult = useQuery(programQuery(userId));
  const deletionCapability = useQuery({
    queryKey: [...userKeys.all(userId), "archive-deletion-capability"],
    enabled: deletionEnabled,
    retry: false,
    queryFn: async ({ signal: querySignal }) => {
      const result = await supabase.rpc("archive_deletion_capabilities").abortSignal(querySignal);
      if (result.error) throw result.error;
      return result.data === true;
    },
  });
  const canDeleteArchived = deletionEnabled && deletionCapability.data === true;
  const days = useMemo(() => daysResult.data ?? [], [daysResult.data]);
  const exercises = useMemo(() => programResult.data ?? [], [programResult.data]);
  const active = days.filter((day) => !day.archived_at);
  const selectionKey = `program:day:v1:${userId}`;
  const [selected, setSelected] = useState(() => {
    try {
      return localStorage.getItem(selectionKey) ?? "";
    } catch {
      return "";
    }
  });
  const [newDay, setNewDay] = useState("");
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseSets, setNewExerciseSets] = useState("3");
  const [newExerciseReps, setNewExerciseReps] = useState("");
  const [newExerciseDayId, setNewExerciseDayId] = useState("");
  const [addingExercise, setAddingExercise] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [managingDays, setManagingDays] = useState(false);
  const [archiveExpandedByUser, setArchiveExpandedByUser] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [exerciseError, setExerciseError] = useState("");
  const running = useRef(false);
  const selectedDay = active.find((day) => day.id === selected) ?? active[0];
  const dayId = selectedDay?.id ?? "";
  const archiveExpanded = archiveExpandedByUser[userId] ?? false;
  const currentExercises = exercises.filter((ex) => ex.day_id === dayId && !ex.archived_at);
  const unassigned = exercises.filter((ex) => ex.day_id === null);

  useEffect(() => {
    if (
      !programResult.isSuccess ||
      !programResult.isFetchedAfterMount ||
      !daysResult.isFetchedAfterMount ||
      !isCurrent()
    )
      return;
    const pending = readPendingArchiveDeletions(userId);
    for (const deletion of pending) {
      const stillExists =
        deletion.kind === "exercise"
          ? exercises.some((exercise) => exercise.id === deletion.id)
          : days.some((day) => day.id === deletion.id);
      if (stillExists) continue;
      if (deletion.kind === "exercise") {
        try {
          removeExerciseDrafts(userId, deletion.id);
        } catch {
          continue;
        }
      }
      clearArchiveDeletionPending(userId, deletion);
      if (deletion.kind === "exercise") {
        void qc.cancelQueries({ queryKey: userKeys.entries(userId, deletion.id) }).then(() => {
          if (!isCurrent()) return;
          qc.removeQueries({ queryKey: userKeys.entries(userId, deletion.id) });
          qc.removeQueries({ queryKey: userKeys.lastEntry(userId, deletion.id) });
        });
      }
    }
  }, [
    days,
    daysResult.isFetchedAfterMount,
    exercises,
    isCurrent,
    programResult.isFetchedAfterMount,
    programResult.isSuccess,
    qc,
    userId,
  ]);

  function selectDay(id: string) {
    setSelected(id);
    try {
      localStorage.setItem(selectionKey, id);
    } catch {
      /* The selection still works for this visit if storage is unavailable. */
    }
  }
  useEffect(() => {
    if (!daysResult.isSuccess || selected === dayId) return;
    setSelected(dayId);
    try {
      localStorage.setItem(selectionKey, dayId);
    } catch {
      /* Optional preference; no workout or draft data is changed. */
    }
  }, [daysResult.isSuccess, dayId, selected, selectionKey]);

  const run = async (action: Parameters<Run>[0], onError = setError): Promise<boolean> => {
    if (running.current || !isCurrent()) return false;
    running.current = true;
    setBusy(true);
    onError("");
    try {
      const result = await action();
      if (!isCurrent()) return false;
      if (result.error) {
        const message = result.error.message;
        if (message.includes("7 активных дней"))
          throw new Error(t("Можно иметь не более 7 активных дней."));
        if (message.includes("хотя бы один активный день"))
          throw new Error(t("Нужен хотя бы один активный день."));
        if (result.error.code === "22023" || result.error.code === "PGRST116")
          throw new Error(t("Программа изменилась. Обновите страницу и повторите действие."));
        throw new Error(
          t("Не удалось сохранить изменения. Проверьте соединение и повторите попытку."),
        );
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: userKeys.days(userId) }),
        qc.invalidateQueries({ queryKey: userKeys.program(userId) }),
      ]);
      return isCurrent();
    } catch (err) {
      if (isCurrent())
        onError(err instanceof Error ? err.message : t("Не удалось сохранить изменения"));
      return false;
    } finally {
      running.current = false;
      if (isCurrent()) setBusy(false);
    }
  };

  async function deleteArchived(
    kind: "day" | "exercise",
    id: string,
  ): Promise<"success" | "rejected" | "unknown" | "unavailable"> {
    if (running.current || !isCurrent()) return "unknown";
    if (!canDeleteArchived) return "unavailable";
    running.current = true;
    setBusy(true);
    try {
      const table = kind === "day" ? "program_days" : "program_exercises";
      const { data: owned, error: ownershipError } = await supabase
        .from(table)
        .select("id, archived_at")
        .eq("id", id)
        .eq("user_id", userId)
        .abortSignal(signal)
        .maybeSingle();
      if (!isCurrent()) return "unknown";
      if (ownershipError) return "unknown";
      const pending = readPendingArchiveDeletions(userId).some(
        (item) => item.kind === kind && item.id === id,
      );
      if (!owned) {
        if (!pending) return "rejected";
        return await finishConfirmedDeletion(kind, id);
      }
      if (!owned.archived_at) return "rejected";
      markArchiveDeletionPending(userId, { kind, id });
      const result =
        kind === "day"
          ? await supabase.rpc("delete_archived_program_day", { _day_id: id }).abortSignal(signal)
          : await supabase
              .rpc("delete_archived_program_exercise", { _exercise_id: id })
              .abortSignal(signal);
      if (!isCurrent()) return "unknown";
      if (!result.error && result.data === true) return await finishConfirmedDeletion(kind, id);

      const { data: after, error: reconcileError } = await supabase
        .from(table)
        .select("id")
        .eq("id", id)
        .eq("user_id", userId)
        .abortSignal(signal)
        .maybeSingle();
      if (!isCurrent()) return "unknown";
      if (reconcileError) return "unknown";
      if (!after) return await finishConfirmedDeletion(kind, id);
      if (result.error?.code === "22023" || result.error?.code === "42501") {
        clearArchiveDeletionPending(userId, { kind, id });
        return "rejected";
      }
      return "unknown";
    } catch {
      return "unknown";
    } finally {
      running.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  async function finishConfirmedDeletion(
    kind: "day" | "exercise",
    id: string,
  ): Promise<"success" | "unknown"> {
    if (!isCurrent()) return "unknown";
    if (kind === "day") {
      qc.setQueryData<Day[]>(userKeys.days(userId), (old) => old?.filter((day) => day.id !== id));
      qc.setQueryData<Exercise[]>(userKeys.program(userId), (old) =>
        old?.map((exercise) => (exercise.day_id === id ? { ...exercise, day_id: null } : exercise)),
      );
      toast.success(t("День удалён, упражнения и история сохранены"));
    } else {
      try {
        removeExerciseDrafts(userId, id);
      } catch {
        return "unknown";
      }
      qc.setQueryData<Exercise[]>(userKeys.program(userId), (old) =>
        old?.filter((exercise) => exercise.id !== id),
      );
      await qc.cancelQueries({ queryKey: userKeys.entries(userId, id) });
      await qc.cancelQueries({ queryKey: userKeys.lastEntry(userId, id) });
      qc.removeQueries({ queryKey: userKeys.entries(userId, id) });
      qc.removeQueries({ queryKey: userKeys.lastEntry(userId, id) });
      setEditing(null);
      toast.success(t("Упражнение и его история удалены"));
    }
    clearArchiveDeletionPending(userId, { kind, id });
    await qc.invalidateQueries({ queryKey: userKeys.all(userId) });
    return isCurrent() ? "success" : "unknown";
  }

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
    if (busy) return;
    if (!newExerciseDayId) {
      setError(t("Выберите активный тренировочный день перед добавлением упражнения."));
      return;
    }
    const targetDay = days.find((day) => day.id === newExerciseDayId);
    if (!targetDay || targetDay.archived_at) {
      setError(t("Выбранный тренировочный день больше недоступен. Выберите активный день заново."));
      return;
    }
    if (!newExerciseSets.trim() || !newExerciseReps.trim()) {
      setError(t("Укажите число подходов и целевой диапазон повторений."));
      return;
    }
    let values: ReturnType<typeof exercisePatch>;
    try {
      values = exercisePatch(
        {
          name: newExerciseName,
          dayId: newExerciseDayId,
          sets: newExerciseSets,
          reps: newExerciseReps,
          weight: "",
        },
        days,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Проверьте данные упражнения."));
      return;
    }
    const targetSets = Number(newExerciseSets);
    const targetReps = values.target_reps ?? null;
    const name = programName(values.name ?? "", 100);
    const ok = await run(async () => {
      const dayLookup = supabase
        .from("program_days")
        .select("id, archived_at")
        .eq("id", newExerciseDayId)
        .eq("user_id", userId)
        .abortSignal(signal);
      const { data: latestDay, error: dayError } = await dayLookup.maybeSingle();
      if (dayError) return { error: dayError };
      if (!latestDay || latestDay.archived_at)
        throw new Error(
          t("Выбранный тренировочный день больше недоступен. Упражнение не создано."),
        );
      return supabase
        .from("program_exercises")
        .insert({
          user_id: userId,
          day_id: newExerciseDayId,
          name,
          position: nextPosition(exercises.filter((ex) => ex.day_id === newExerciseDayId)),
          target_sets: targetSets,
          target_reps: targetReps,
        })
        .abortSignal(signal);
    });
    if (!ok) return;
    setAddingExercise(false);
    setNewExerciseName("");
    setNewExerciseSets("3");
    setNewExerciseReps("");
    setNewExerciseDayId("");
    toast.success(t("Упражнение добавлено"));
  }
  const updateDay = async (id: string, patch: { name?: string; archived_at?: string | null }) => {
    const result = await supabase
      .from("program_days")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .abortSignal(signal)
      .single();
    if (!result.error && result.data && isCurrent())
      qc.setQueryData<Day[]>(userKeys.days(userId), (old) =>
        old?.map((day) => (day.id === id ? { ...day, ...patch } : day)),
      );
    return result;
  };
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
    return <p role="status">{t("Загрузка программы…")}</p>;
  if (daysResult.isError || programResult.isError)
    return (
      <div role="alert">
        {t("Не удалось загрузить программу.")}{" "}
        <Button
          onClick={() => {
            void daysResult.refetch();
            void programResult.refetch();
          }}
        >
          {t("Повторить")}
        </Button>
      </div>
    );

  function summary(ex: Exercise) {
    if (ex.target_sets && ex.target_reps)
      return `${ex.target_sets} × ${ex.target_reps.replace("-", "–")}`;
    if (ex.target_sets) return t("{count} подх.", { count: ex.target_sets });
    if (ex.target_reps) return t("{count} повт.", { count: ex.target_reps.replace("-", "–") });
    return t("Цель не задана");
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
          aria-label={t("Редактировать: {name}", { name: ex.name })}
          disabled={busy}
          onClick={() => {
            setExerciseError("");
            setManagingDays(false);
            setEditing(ex.id);
          }}
          className="shrink-0"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={
            ex.archived_at
              ? t("Восстановить: {name}", { name: ex.name })
              : t("В архив: {name}", { name: ex.name })
          }
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
        {canDeleteArchived && ex.archived_at && (
          <ArchiveDeleteDialog
            kind="exercise"
            id={ex.id}
            name={ex.name}
            userId={userId}
            disabled={busy}
            onConfirm={() => deleteArchived("exercise", ex.id)}
          />
        )}
      </div>
    );
  }
  const editingEx = exercises.find((ex) => ex.id === editing);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("Программа")}</h1>
      {error && !managingDays && !addingExercise && (
        <p role="alert" className="break-words rounded-xl border border-destructive p-3 text-sm">
          {translateKnown(language, error)}
        </p>
      )}
      {deletionEnabled &&
        (deletionCapability.isSuccess || deletionCapability.isError) &&
        !canDeleteArchived && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("Удаление пока недоступно на сервере.")}
          </p>
        )}
      <Sheet
        open={managingDays}
        onOpenChange={(open) => {
          setError("");
          setManagingDays(open);
        }}
      >
        <section
          aria-label={t("Тренировочные дни")}
          className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
        >
          <div className="min-w-0">
            <h2 className="font-bold">{t("Тренировочные дни")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("{count} из {max}", { count: active.length, max: MAX_DAYS })}
            </p>
          </div>
          <SheetTrigger asChild>
            <Button variant="secondary" className="h-11 shrink-0">
              <Pencil className="h-4 w-4" />
              {t("Изменить дни")}
            </Button>
          </SheetTrigger>
        </section>
        <SheetContent
          side="bottom"
          className="flex h-dvh flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:ml-auto sm:h-[90dvh] sm:max-w-xl sm:rounded-t-lg [&>button]:hidden"
        >
          <SheetHeader className="safe-top shrink-0 border-b px-4 pb-4 text-left sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle>{t("Тренировочные дни")}</SheetTitle>
              <SheetClose asChild>
                <Button className="h-11 shrink-0" disabled={busy}>
                  {t("Готово")}
                </Button>
              </SheetClose>
            </div>
            <SheetDescription>
              {t("{count} из {max} активных дней", { count: active.length, max: MAX_DAYS })}
            </SheetDescription>
          </SheetHeader>
          <div className="safe-bottom min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pt-4 sm:px-6">
            {error && (
              <p
                role="alert"
                className="break-words rounded-lg border border-destructive p-3 text-sm"
              >
                {translateKnown(language, error)}
              </p>
            )}
            <SortableList
              items={active}
              disabled={busy}
              handleLabel={(day) => t("Переместить день {name}", { name: day.name })}
              draggingClassName="rounded-lg bg-card shadow-lg ring-2 ring-primary"
              onReorder={(ids) =>
                void run(() =>
                  pendingRpc("reorder_program_days", { _ids: ids }).abortSignal(signal),
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
                  deleteControl={null}
                />
              )}
            />
            <form onSubmit={addDay} className="flex flex-wrap gap-2 border-t pt-4">
              <Input
                aria-label={t("Название нового дня")}
                value={newDay}
                onChange={(event) => setNewDay(event.target.value)}
                maxLength={60}
                placeholder={t("Новый день")}
                className="h-12 min-w-0 flex-1 basis-40"
                disabled={busy || active.length >= MAX_DAYS}
              />
              <Button
                type="submit"
                className="h-12 shrink-0"
                disabled={busy || !newDay.trim() || active.length >= MAX_DAYS}
              >
                {t("Добавить день")}
              </Button>
            </form>
            {active.length >= MAX_DAYS && (
              <p className="text-sm text-muted-foreground">
                {t("Можно иметь не более 7 активных дней.")}
              </p>
            )}
            {days.some((day) => day.archived_at) && (
              <details className="space-y-3">
                <summary className="cursor-pointer py-2 font-bold">{t("Архив дней")}</summary>
                {days
                  .filter((day) => day.archived_at)
                  .map((day) => (
                    <div key={day.id}>
                      <DayEditor
                        day={day}
                        busy={busy}
                        run={run}
                        save={(patch) => updateDay(day.id, patch)}
                        canArchive={false}
                        canRestore={active.length < MAX_DAYS}
                        deleteControl={
                          canDeleteArchived ? (
                            <ArchiveDeleteDialog
                              kind="day"
                              id={day.id}
                              name={day.name}
                              userId={userId}
                              exerciseCount={exercises.filter((ex) => ex.day_id === day.id).length}
                              disabled={busy}
                              onConfirm={() => deleteArchived("day", day.id)}
                            />
                          ) : null
                        }
                      />
                      {exercises.some((ex) => ex.day_id === day.id) && (
                        <details className="space-y-2 pt-2">
                          <summary className="cursor-pointer py-2 text-sm">
                            {t("Упражнения архивного дня")}
                          </summary>
                          {exercises
                            .filter((ex) => ex.day_id === day.id)
                            .map((ex) => (
                              <div key={ex.id}>{compactRow(ex)}</div>
                            ))}
                        </details>
                      )}
                    </div>
                  ))}
              </details>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <section aria-label={t("Упражнения")} className="space-y-3">
        <h2 className="font-bold">{t("Упражнения")}</h2>
        <Select
          value={dayId}
          disabled={busy || !active.length || addingExercise}
          onValueChange={selectDay}
        >
          <SelectTrigger
            aria-label={t("День для упражнений")}
            className="h-12 w-full min-w-0 bg-card text-left [&>span]:min-w-0 [&>span]:truncate"
          >
            <SelectValue placeholder={t("Нет активных дней")} />
          </SelectTrigger>
          <SelectContent
            position="popper"
            align="start"
            collisionPadding={8}
            className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1rem)]"
          >
            {active.map((day) => (
              <SelectItem key={day.id} value={day.id} className="min-h-10 whitespace-normal py-2">
                <span className="block min-w-0 break-words leading-snug">
                  {day.name} ·{" "}
                  {t("{count} упр.", {
                    count: exercises.filter((ex) => ex.day_id === day.id && !ex.archived_at).length,
                  })}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!active.length && (
          <p className="text-sm text-muted-foreground">
            {t("Нет активных дней. Создайте или восстановите день через «Изменить дни».")}
          </p>
        )}
        <SortableList
          items={currentExercises}
          disabled={busy}
          handleLabel={(exercise) => t("Переместить упражнение {name}", { name: exercise.name })}
          onReorder={(ids) =>
            void run(() =>
              pendingRpc("reorder_program_exercises", { _day_id: dayId, _ids: ids }).abortSignal(
                signal,
              ),
            )
          }
          render={(ex, handle) => compactRow(ex, handle)}
        />
        {!currentExercises.length && (
          <p className="text-sm text-muted-foreground">{t("Упражнений пока нет.")}</p>
        )}
        {selectedDay && !selectedDay.archived_at && (
          <Button
            type="button"
            className="h-12 w-full"
            disabled={busy || addingExercise}
            onClick={() => {
              setError("");
              setNewExerciseDayId(dayId);
              setAddingExercise(true);
            }}
          >
            {t("Добавить упражнение")}
          </Button>
        )}
        {selectedDay && (
          <section className="space-y-3">
            <button
              type="button"
              aria-expanded={archiveExpanded}
              className="w-full cursor-pointer py-2 text-left font-bold"
              onClick={() =>
                setArchiveExpandedByUser((openByUser) => ({
                  ...openByUser,
                  [userId]: !archiveExpanded,
                }))
              }
            >
              {t("Архив упражнений")}
            </button>
            {archiveExpanded && (
              <div className="space-y-3">
                {exercises
                  .filter((ex) => ex.day_id === dayId && ex.archived_at)
                  .map((ex) => (
                    <div key={ex.id}>{compactRow(ex)}</div>
                  ))}
                {!exercises.some((ex) => ex.day_id === dayId && ex.archived_at) && (
                  <p className="text-sm text-muted-foreground">
                    {t("Архивированных упражнений нет")}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </section>

      {unassigned.length > 0 && (
        <section aria-label={t("Упражнения без дня")} className="space-y-3 rounded-xl border p-3">
          <h2 className="font-bold">
            {t("Без назначенного дня · {count}", { count: unassigned.length })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "Эти упражнения сохранены без привязки к дню. Выберите день вручную и сохраните. История останется без изменений.",
            )}
          </p>
          {unassigned.map((ex) => (
            <div key={ex.id}>{compactRow(ex)}</div>
          ))}
        </section>
      )}
      <Sheet open={!!editingEx} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t("Редактирование упражнения")}</SheetTitle>
          </SheetHeader>
          {editingEx && (
            <ExerciseEditor
              key={editingEx.id + editingEx.day_id}
              exercise={editingEx}
              days={days}
              busy={busy}
              error={exerciseError}
              run={async (action) => {
                const ok = await run(action, setExerciseError);
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
      <Sheet
        open={addingExercise}
        onOpenChange={(open) => {
          if (!busy) setAddingExercise(open);
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:mx-auto sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle>{t("Добавить упражнение")}</SheetTitle>
            <SheetDescription>
              {t("Упражнение будет добавлено в выбранный тренировочный день.")}
            </SheetDescription>
          </SheetHeader>
          <form
            aria-label={t("Новое упражнение")}
            onSubmit={addExercise}
            className="space-y-4 pt-3"
          >
            {error && (
              <p
                role="alert"
                className="break-words rounded-xl border border-destructive p-3 text-sm"
              >
                {translateKnown(language, error)}
              </p>
            )}
            <label className="block space-y-1 text-sm">
              {t("Название упражнения")}
              <Input
                aria-label={t("Название упражнения")}
                value={newExerciseName}
                onChange={(event) => setNewExerciseName(event.target.value)}
                maxLength={100}
                required
                autoFocus
                disabled={busy}
                className="h-12"
              />
            </label>
            <label className="block space-y-1 text-sm">
              {t("Количество подходов")}
              <Input
                aria-label={t("Количество подходов")}
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                step={1}
                value={newExerciseSets}
                onChange={(event) => setNewExerciseSets(event.target.value)}
                required
                disabled={busy}
                className="h-12"
              />
            </label>
            <label className="block space-y-1 text-sm">
              {t("Целевой диапазон повторений")}
              <Input
                aria-label={t("Целевой диапазон повторений")}
                value={newExerciseReps}
                onChange={(event) => setNewExerciseReps(event.target.value)}
                placeholder="8–12"
                maxLength={30}
                required
                disabled={busy}
                className="h-12"
              />
            </label>
            <Button
              type="submit"
              className="h-12 w-full"
              disabled={
                busy || !newExerciseName.trim() || !newExerciseSets || !newExerciseReps.trim()
              }
            >
              {t("Сохранить")}
            </Button>
          </form>
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
  deleteControl: ReactNode;
};
function DayEditor({
  day,
  handle,
  busy,
  run,
  save,
  canArchive,
  canRestore,
  deleteControl,
}: DayEditorProps) {
  const { t } = useI18n();
  const [name, setName] = useState(day.name);
  const [editing, setEditing] = useState(false);
  async function rename(event: FormEvent) {
    event.preventDefault();
    if (await run(() => save({ name: programName(name, 60) }))) setEditing(false);
  }
  const archiveLabel = day.archived_at ? t("Восстановить день") : t("Архивировать день");
  const archiveDisabled = busy || (day.archived_at ? !canRestore : !canArchive);
  return (
    <div
      role="group"
      aria-label={t("День: {name}", { name: day.name })}
      className="rounded-lg bg-card px-2 py-1.5"
    >
      <div className="flex min-w-0 items-center gap-1">
        {handle}
        {editing ? (
          <form onSubmit={rename} className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              aria-label={t("Название дня")}
              value={name}
              maxLength={60}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              className="h-9 min-w-0 flex-1"
              autoFocus
            />
            <Button type="submit" className="h-9 shrink-0" disabled={busy || !name.trim()}>
              {t("Сохранить")}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              aria-label={t("Отменить переименование")}
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
              aria-label={t("Переименовать день: {name}", { name: day.name })}
              disabled={busy}
              onClick={() => {
                setName(day.name);
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {deleteControl}
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
        <p className="text-xs text-muted-foreground">{t("Нужен хотя бы один активный день.")}</p>
      )}
    </div>
  );
}

type ExerciseEditorProps = {
  exercise: Exercise;
  days: Day[];
  busy: boolean;
  error: string;
  run: Run;
  save: (patch: TablesUpdate<"program_exercises">) => PromiseLike<Result>;
  nextPosition: (dayId: string) => number;
};
function ExerciseEditor({
  exercise: ex,
  days,
  busy,
  error,
  run,
  save,
  nextPosition: positionFor,
}: ExerciseEditorProps) {
  const { t, language } = useI18n();
  const [name, setName] = useState(ex.name);
  const [dayId, setDayId] = useState(ex.day_id ?? "");
  const [sets, setSets] = useState(String(ex.target_sets ?? ""));
  const [reps, setReps] = useState(ex.target_reps ?? "");
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() => {
      if (dayId !== ex.day_id && dayId && days.find((day) => day.id === dayId)?.archived_at)
        throw new Error(t("Перенос возможен только в активный день"));
      const patch = exercisePatch({ name, dayId, sets, reps, weight: "" }, days);
      delete patch.working_weight;
      if (patch.day_id !== ex.day_id && patch.day_id) patch.position = positionFor(patch.day_id);
      return save(patch);
    });
  }
  return (
    <form
      aria-label={t("Упражнение: {name}", { name: ex.name })}
      onSubmit={submit}
      className="space-y-3 pt-2"
    >
      {error && (
        <p
          id="exercise-editor-error"
          role="alert"
          className="break-words rounded-xl border border-destructive p-3 text-sm"
        >
          {translateKnown(language, error)}
        </p>
      )}
      <label className="block space-y-1 text-xs">
        {t("Название упражнения")}
        <Input
          value={name}
          aria-describedby={error ? "exercise-editor-error" : undefined}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          className="h-12"
          disabled={busy}
        />
      </label>
      <label className="block space-y-1 text-xs">
        {t("Тренировочный день")}
        <select
          className={selectCls}
          aria-describedby={error ? "exercise-editor-error" : undefined}
          value={dayId}
          onChange={(event) => setDayId(event.target.value)}
          disabled={busy}
        >
          {!ex.day_id && <option value="">{t("Без назначенного дня")}</option>}
          {days
            .filter((day) => !day.archived_at || day.id === ex.day_id)
            .map((day) => (
              <option key={day.id} value={day.id}>
                {day.name}
                {day.archived_at ? t(" (архив)") : ""}
              </option>
            ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs">
          {t("Подходы")}
          <Input
            inputMode="numeric"
            aria-describedby={error ? "exercise-editor-error" : undefined}
            value={sets}
            onChange={(event) => setSets(event.target.value)}
            disabled={busy}
            className="h-12"
            placeholder="—"
          />
        </label>
        <label className="space-y-1 text-xs">
          {t("Повторения")}
          <Input
            value={reps}
            aria-describedby={error ? "exercise-editor-error" : undefined}
            onChange={(event) => setReps(event.target.value)}
            disabled={busy}
            className="h-12"
            placeholder="8–12"
          />
        </label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !name.trim()}>
          {t("Сохранить")}
        </Button>
      </div>
    </form>
  );
}
