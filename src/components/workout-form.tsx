import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { CalendarDays, Minus, Plus } from "lucide-react";
import { lastEntryQuery, userKeys, type Exercise } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import {
  MAX_SETS,
  MAX_REPS,
  MAX_WEIGHT,
  decimal,
  validatePerSetWorkout,
  type PerSetWorkoutFields,
  type WorkoutSetFields,
} from "@/lib/workout-input";
import {
  newPerSetDraft,
  hasPerSetDraftInput,
  perSetDraftKey,
  readPerSetDraft,
  writePerSetDraft,
  removeSavedPerSetDraft,
  readDraft,
  hasDraftInput,
  removeSavedDraft,
  type PerSetWorkoutDraft,
  type WorkoutDraft,
} from "@/lib/workout-draft";
import { SaveWorkoutError, saveWorkout, saveWorkoutSets } from "@/lib/save-workout";
import { Loading, LoadError } from "@/components/query-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n, translateKnown } from "@/lib/i18n";
import { SortableList } from "@/components/Sortable";

type WorkoutFormProps = {
  exercise: Exercise;
  dayId: string;
  initialDate: string;
  onDateChange: (date: string) => void;
  onSaved: (exerciseId: string, dayId: string, date: string) => boolean;
  focusMode?: boolean;
  trainingDaySelector?: ReactNode;
  exerciseSelector?: ReactNode;
};

function newSet(position: number, weight = "", reps = "", rir = ""): WorkoutSetFields {
  return {
    id: crypto.randomUUID(),
    position,
    weight,
    reps,
    rir,
    set_type: "working",
    load_type: "external",
  };
}

export function WorkoutForm(props: WorkoutFormProps) {
  const { userId } = useUserSession();
  const [completedLegacyId, setCompletedLegacyId] = useState<string | null>(null);
  const legacy = useMemo(() => {
    try {
      return readDraft(userId, props.exercise.id, props.initialDate);
    } catch {
      return null;
    }
  }, [userId, props.exercise.id, props.initialDate]);
  const legacyDone = !!legacy && legacy.id === completedLegacyId;
  if (legacy?.operation && !legacyDone)
    return (
      <LegacyRetry {...props} draft={legacy} onCompleted={() => setCompletedLegacyId(legacy.id)} />
    );
  return <PerSetWorkoutForm {...props} legacyDraft={legacyDone ? null : legacy} />;
}

function LegacyRetry({
  exercise,
  dayId,
  initialDate,
  onSaved,
  trainingDaySelector,
  exerciseSelector,
  draft,
  onCompleted,
}: WorkoutFormProps & { draft: WorkoutDraft; onCompleted: () => void }) {
  const { t } = useI18n();
  const { userId, signal, isCurrent } = useUserSession();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  async function retry() {
    if (running.current || !draft.operation || !isCurrent()) return;
    running.current = true;
    setSaving(true);
    setError("");
    try {
      await saveWorkout(draft.operation.id, draft.operation.payload, signal);
      removeSavedDraft(
        userId,
        exercise.id,
        draft.operation.id,
        draft.operation.payload.performed_on,
      );
      await qc.cancelQueries({ queryKey: userKeys.lastEntry(userId, exercise.id) });
      if (!isCurrent()) return;
      void qc.invalidateQueries({ queryKey: userKeys.entries(userId, exercise.id) });
      void qc.invalidateQueries({ queryKey: userKeys.lastEntry(userId, exercise.id) });
      if (!onSaved(exercise.id, dayId, draft.operation.payload.performed_on)) onCompleted();
    } catch (reason) {
      if (isCurrent())
        setError(reason instanceof Error ? reason.message : "Не удалось подтвердить сохранение.");
    } finally {
      running.current = false;
      if (isCurrent()) setSaving(false);
    }
  }
  return (
    <div className="space-y-3">
      <div
        className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2.5"
        role="group"
        aria-label={t("Дата и тренировочный день")}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="legacy-retry-date" className="block max-sm:min-h-8 text-xs font-medium">
            {t("Дата")}
          </label>
          <div className="relative min-w-0">
            <Input
              id="legacy-retry-date"
              type="date"
              value={initialDate}
              className="box-border h-12 w-full min-w-0 max-w-full rounded-md border border-input bg-card px-3 text-sm [&::-webkit-calendar-picker-indicator]:opacity-0"
              disabled
            />
            <CalendarDays
              aria-hidden="true"
              className="pointer-events-none absolute right-[13px] top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>
        {trainingDaySelector}
      </div>
      {exerciseSelector}
      <section className="space-y-4" aria-label={t("Повтор сохранения старой записи")}>
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "Восстановлена незавершённая операция старого формата. Повтор отправит сохранённые значения без изменений.",
          )}
        </p>
        {error && (
          <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
            {error}
          </p>
        )}
        <Button
          type="button"
          disabled={saving}
          onClick={() => void retry()}
          className="h-14 w-full"
        >
          {saving ? t("Сохранение…") : t("Повторить сохранение")}
        </Button>
      </section>
    </div>
  );
}

function PerSetWorkoutForm({
  exercise,
  dayId,
  initialDate,
  onDateChange,
  onSaved,
  trainingDaySelector,
  exerciseSelector,
  legacyDraft,
  focusMode = false,
}: WorkoutFormProps & { legacyDraft: WorkoutDraft | null }) {
  const { t, language, date } = useI18n();
  const { userId, signal, isCurrent } = useUserSession();
  const qc = useQueryClient();
  const defaults = (): PerSetWorkoutFields => {
    const plannedSets = exercise.target_sets ?? exercise.example_reps?.length ?? 3;
    return {
      date: initialDate,
      notes: "",
      sets: Array.from({ length: plannedSets }, (_, index) => newSet(index + 1)),
    };
  };
  const [initial] = useState(() => {
    try {
      const saved = readPerSetDraft(userId, exercise.id, initialDate);
      if (saved) return { draft: saved, error: "" };
      const fields = legacyDraft
        ? {
            date: legacyDraft.fields.date,
            notes: legacyDraft.fields.notes,
            sets: legacyDraft.fields.reps.map((reps, index) =>
              newSet(index + 1, legacyDraft.fields.weight, reps, legacyDraft.fields.rir),
            ),
          }
        : defaults();
      const migrated = newPerSetDraft(userId, exercise.id, fields);
      if (legacyDraft)
        migrated.dirty = {
          date: legacyDraft.dirty.date,
          notes: legacyDraft.dirty.notes,
          sets: legacyDraft.dirty.weight || legacyDraft.dirty.reps || legacyDraft.dirty.rir,
        };
      return { draft: migrated, error: "" };
    } catch {
      return {
        draft: newPerSetDraft(userId, exercise.id, defaults()),
        error: "Не удалось прочитать черновик подходов. Сохранённые данные не изменены.",
      };
    }
  });
  const [draft, setDraft] = useState(initial.draft);
  const draftRef = useRef(draft);
  const [storageError, setStorageError] = useState(initial.error);
  const [blocked, setBlocked] = useState(!!initial.error);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeSetIndex, setActiveSetIndex] = useState(0);
  const setWeightRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const focusedSetId = draft.fields.sets[activeSetIndex]?.id;
  const running = useRef(false);
  const mounted = useRef(true);
  const lastResult = useQuery(lastEntryQuery(userId, exercise.id, draft.fields.date));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const commit = useCallback((next: PerSetWorkoutDraft) => {
    draftRef.current = next;
    setDraft(next);
    try {
      writePerSetDraft(next);
      setStorageError("");
    } catch {
      setStorageError("Черновик не сохранён на устройстве. Проверьте доступ к хранилищу.");
    }
  }, []);
  useEffect(() => {
    if (focusMode && focusedSetId) setWeightRef.current?.focus();
  }, [focusedSetId, focusMode]);
  useEffect(() => {
    setActiveSetIndex((index) => Math.min(index, Math.max(0, draft.fields.sets.length - 1)));
  }, [draft.fields.sets.length]);
  useEffect(() => {
    if (
      !lastResult.isFetchedAfterMount ||
      !lastResult.isSuccess ||
      lastResult.isFetching ||
      blocked ||
      signal.aborted
    )
      return;
    const current = draftRef.current;
    if (current.operation || current.dirty.sets) return;
    const previous = lastResult.data;
    if (!previous || previous.performed_on !== current.fields.date) return;
    const savedSets = previous.sets?.length
      ? previous.sets.map((set, index) => ({
          ...newSet(index + 1, set.weight, String(set.reps), set.rir ?? ""),
          set_type: set.set_type,
          load_type: set.load_type,
        }))
      : (Array.isArray(previous.reps) ? previous.reps : []).map((reps, index) =>
          newSet(
            index + 1,
            String(Number(previous.weight)),
            String(reps),
            previous.rir == null ? "" : String(Number(previous.rir)),
          ),
        );
    if (!savedSets.length) return;
    commit({
      ...current,
      fields: {
        ...current.fields,
        sets: savedSets,
        notes:
          current.dirty.notes || current.fields.notes
            ? current.fields.notes
            : (previous.notes ?? ""),
      },
    });
  }, [
    lastResult.isFetchedAfterMount,
    lastResult.isSuccess,
    lastResult.isFetching,
    lastResult.data,
    blocked,
    signal,
    commit,
  ]);
  function update(nextFields: PerSetWorkoutFields, dirty: "date" | "sets" | "notes") {
    if (draftRef.current.operation || blocked) return;
    const current = draftRef.current;
    if (dirty === "date" && nextFields.date !== current.fields.date) {
      try {
        const restored = readPerSetDraft(userId, exercise.id, nextFields.date);
        if (restored && hasPerSetDraftInput(restored)) {
          commit(restored);
          onDateChange(nextFields.date);
          return;
        }
        const old = readDraft(userId, exercise.id, nextFields.date);
        if (old && hasDraftInput(old)) {
          // A frozen V1 operation must keep its original RPC and payload. The
          // wrapper switches to LegacyRetry when the selected date changes.
          if (!old.operation) {
            const migrated = newPerSetDraft(userId, exercise.id, {
              date: old.fields.date,
              notes: old.fields.notes,
              sets: old.fields.reps.map((reps, index) =>
                newSet(index + 1, old.fields.weight, reps, old.fields.rir),
              ),
            });
            migrated.dirty = {
              date: old.dirty.date,
              notes: old.dirty.notes,
              sets: old.dirty.weight || old.dirty.reps || old.dirty.rir,
            };
            commit(migrated);
          }
          onDateChange(nextFields.date);
          return;
        }
      } catch {
        setStorageError("Не удалось прочитать черновик выбранной даты.");
        return;
      }
      const changed = newPerSetDraft(userId, exercise.id, {
        ...nextFields,
        sets: current.fields.sets.map((set) => ({ ...set })),
      });
      changed.dirty.date = true;
      changed.dirty.sets = current.dirty.sets;
      changed.dirty.notes = current.dirty.notes;
      commit(changed);
      onDateChange(nextFields.date);
      return;
    }
    const changedRecordedSetIds = new Set(
      current.fields.sets
        .filter((set) => current.recordedSetIds.includes(set.id))
        .filter((set) => {
          const next = nextFields.sets.find((candidate) => candidate.id === set.id);
          return (
            !next ||
            next.position !== set.position ||
            next.weight !== set.weight ||
            next.reps !== set.reps ||
            next.rir !== set.rir ||
            next.set_type !== set.set_type ||
            next.load_type !== set.load_type
          );
        })
        .map((set) => set.id),
    );
    commit({
      ...current,
      fields: nextFields,
      recordedSetIds:
        dirty === "sets"
          ? current.recordedSetIds.filter((id) => !changedRecordedSetIds.has(id))
          : current.recordedSetIds,
      dirty: { ...current.dirty, [dirty]: true },
    });
  }

  function recordFocusSet() {
    const current = draftRef.current;
    const set = current.fields.sets[activeSetIndex];
    if (!set || !set.reps.trim() || !set.weight.trim()) {
      setError("Заполните вес и повторения текущего подхода перед записью.");
      return;
    }
    try {
      decimal(
        set.weight.trim().replace(",", "."),
        `Вес подхода ${activeSetIndex + 1}`,
        MAX_WEIGHT,
        2,
      );
      if (
        !/^\d+$/.test(set.reps.trim()) ||
        !Number.isSafeInteger(Number(set.reps)) ||
        Number(set.reps) > MAX_REPS
      )
        throw new Error(`Подход ${activeSetIndex + 1}: укажите целое количество повторений.`);
      if (set.rir.trim())
        decimal(set.rir.trim().replace(",", "."), `RIR подхода ${activeSetIndex + 1}`, 10, 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Проверьте данные подхода.");
      return;
    }
    const recordedSetIds = [...new Set([...current.recordedSetIds, set.id])];
    commit({ ...current, recordedSetIds, dirty: { ...current.dirty, sets: true } });
    const nextIndex = current.fields.sets.findIndex(
      (candidate) => !recordedSetIds.includes(candidate.id),
    );
    if (nextIndex >= 0) setActiveSetIndex(nextIndex);
    else void save();
    setError("");
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (running.current || blocked || !isCurrent()) return;
    running.current = true;
    setError("");
    setSaving(true);
    try {
      const current = draftRef.current;
      const operation = current.operation ?? {
        id: current.id,
        payload: validatePerSetWorkout(current.fields, exercise.id, dayId),
      };
      const pending = { ...current, operation };
      try {
        writePerSetDraft(pending);
      } catch {
        throw new Error("Не удалось сохранить операцию на устройстве. Запрос не отправлен.");
      }
      draftRef.current = pending;
      setDraft(pending);
      await saveWorkoutSets(operation.id, operation.payload, signal);
      try {
        removeSavedPerSetDraft(userId, exercise.id, operation.id, operation.payload.performed_on);
        if (legacyDraft)
          removeSavedDraft(userId, exercise.id, legacyDraft.id, legacyDraft.fields.date);
      } catch {
        if (mounted.current)
          setStorageError(
            "Тренировка сохранена, но локальный черновик не удалён; повтор безопасен.",
          );
      }
      await qc.cancelQueries({ queryKey: userKeys.lastEntry(userId, exercise.id) });
      if (!isCurrent()) return;
      toast.success(t("Ваша тренировка сохранена"), {
        id: "workout-saved",
        duration: 3000,
        position: "bottom-center",
        style: { pointerEvents: "none" },
      });
      void qc.invalidateQueries({ queryKey: userKeys.entries(userId, exercise.id) });
      void qc.invalidateQueries({ queryKey: userKeys.lastEntry(userId, exercise.id) });
      if (mounted.current && draftRef.current.id === operation.id) {
        const advanced = onSaved(exercise.id, dayId, operation.payload.performed_on);
        if (!advanced) {
          const next = newPerSetDraft(userId, exercise.id, {
            date: operation.payload.performed_on,
            notes: "",
            // A successful save closes this UUID lifecycle. Keep the entered values,
            // but never reuse the persisted entry or set identifiers in the next draft.
            sets: operation.payload.sets.map((set, index) =>
              newSet(index + 1, String(set.weight), String(set.reps), set.rir ?? ""),
            ),
          });
          commit(next);
        }
      }
    } catch (reason) {
      if (!mounted.current || !isCurrent()) return;
      if (reason instanceof SaveWorkoutError && reason.rejected)
        commit({ ...draftRef.current, operation: null });
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось подтвердить сохранение. Повторите попытку.",
      );
    } finally {
      running.current = false;
      if (mounted.current && isCurrent()) setSaving(false);
    }
  }

  const fields = draft.fields;
  const locked = saving || !!draft.operation || blocked;
  const activeSet = fields.sets[activeSetIndex];
  const visibleSets = focusMode
    ? fields.sets[activeSetIndex]
      ? [{ set: fields.sets[activeSetIndex]!, index: activeSetIndex }]
      : []
    : fields.sets.map((set, index) => ({ set, index }));
  const recordedCount = fields.sets.filter((set) => draft.recordedSetIds.includes(set.id)).length;
  const focusProgress = fields.sets.length ? (recordedCount / fields.sets.length) * 100 : 0;

  function renderSetRow(set: WorkoutSetFields, index: number, handle?: ReactNode) {
    return (
      <div
        key={set.id}
        className={
          focusMode
            ? "grid grid-cols-3 items-end gap-2 py-1 animate-in fade-in slide-in-from-right-2 duration-250 motion-reduce:animate-none motion-reduce:transition-none"
            : "grid grid-cols-[3rem_repeat(3,minmax(0,1fr))] items-end gap-2 rounded-xl bg-card p-1"
        }
      >
        {!focusMode && (
          <div className="flex items-center gap-0.5 pb-3">
            {handle}
            <span className="text-xs text-muted-foreground">#{index + 1}</span>
          </div>
        )}
        <label className="min-w-0 space-y-1 text-xs">
          <span>
            {focusMode
              ? t("Вес")
              : set.load_type === "bodyweight"
                ? t("Доп. вес, кг")
                : t("Вес, кг")}
          </span>
          <Input
            ref={focusMode && index === activeSetIndex ? setWeightRef : undefined}
            aria-label={t("Вес подхода {number}", { number: index + 1 })}
            inputMode="decimal"
            value={set.weight}
            placeholder="0"
            onChange={(event) =>
              update(
                {
                  ...fields,
                  sets: fields.sets.map((item, i) =>
                    i === index ? { ...item, weight: event.target.value } : item,
                  ),
                },
                "sets",
              )
            }
            className="num h-11 min-w-0 px-1 sm:px-2"
          />
        </label>
        <label className="min-w-0 space-y-1 text-xs">
          <span>{t("Повторения")}</span>
          <Input
            aria-label={t("Повторения подхода {number}", { number: index + 1 })}
            inputMode="numeric"
            value={set.reps}
            onChange={(event) =>
              update(
                {
                  ...fields,
                  sets: fields.sets.map((item, i) =>
                    i === index ? { ...item, reps: event.target.value } : item,
                  ),
                },
                "sets",
              )
            }
            className="num h-11 min-w-0 px-1 sm:px-2"
          />
        </label>
        <label className="min-w-0 space-y-1 text-xs">
          <span>RIR</span>
          <Input
            aria-label={t("RIR подхода {number}", { number: index + 1 })}
            inputMode="decimal"
            value={set.rir}
            placeholder="—"
            onChange={(event) =>
              update(
                {
                  ...fields,
                  sets: fields.sets.map((item, i) =>
                    i === index ? { ...item, rir: event.target.value } : item,
                  ),
                },
                "sets",
              )
            }
            className="num h-11 min-w-0 px-1 sm:px-2"
          />
        </label>
      </div>
    );
  }

  function reorderSets(ids: string[]) {
    const setsById = new Map(fields.sets.map((set) => [set.id, set]));
    const sets = ids
      .map((id) => setsById.get(id))
      .filter((set): set is WorkoutSetFields => set !== undefined)
      .map((set, index) => ({ ...set, position: index + 1 }));
    if (sets.length === fields.sets.length) update({ ...fields, sets }, "sets");
  }

  return (
    <form
      onSubmit={save}
      className={focusMode ? "space-y-4" : "space-y-3"}
      aria-label={t("Запись тренировки")}
    >
      {storageError && (
        <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
          {translateKnown(language, storageError)}
        </p>
      )}
      {blocked && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (!window.confirm(t("Удалить повреждённый черновик подходов и начать заново?")))
              return;
            try {
              localStorage.removeItem(perSetDraftKey(userId, exercise.id));
              const fresh = newPerSetDraft(userId, exercise.id, defaults());
              commit(fresh);
              setBlocked(false);
            } catch {
              setStorageError("Не удалось записать новый черновик.");
            }
          }}
        >
          {t("Начать новый черновик")}
        </Button>
      )}
      {(lastResult.isPending || (!lastResult.isFetchedAfterMount && lastResult.isFetching)) && (
        <Loading>{t("Загрузка предыдущей тренировки…")}</Loading>
      )}
      {lastResult.isError && (
        <LoadError onRetry={() => void lastResult.refetch()}>
          {t(
            "Не удалось загрузить предыдущую тренировку. Черновик сохранён; можно заполнить форму вручную.",
          )}
        </LoadError>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
          {translateKnown(language, error)}
        </p>
      )}
      {draft.operation && (
        <p role="status" className="text-sm text-muted-foreground">
          {t(
            "Операция ожидает подтверждения. При повторе отправятся те же значения; поля временно заблокированы.",
          )}
        </p>
      )}
      {!focusMode && (
        <>
          <div
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-2.5"
            role="group"
            aria-label={t("Дата и тренировочный день")}
          >
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor="date" className="block max-sm:min-h-8 text-xs font-medium">
                {t("Дата")}
              </label>
              <div className="relative min-w-0">
                <Input
                  ref={dateInputRef}
                  id="date"
                  type="date"
                  value={fields.date}
                  onChange={(event) => update({ ...fields, date: event.target.value }, "date")}
                  className="box-border h-12 w-full min-w-0 max-w-full appearance-none rounded-md border border-input bg-card px-3 text-sm [&::-webkit-calendar-picker-indicator]:hidden"
                  required
                  disabled={locked}
                />
                <button
                  type="button"
                  aria-label={t("Открыть календарь")}
                  disabled={locked}
                  onClick={() => {
                    const input = dateInputRef.current;
                    if (!input) return;
                    try {
                      if (typeof input.showPicker === "function") input.showPicker();
                      else input.click();
                    } catch {
                      input.click();
                    }
                  }}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground touch-manipulation focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  <CalendarDays aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </div>
            {trainingDaySelector}
          </div>
          {exerciseSelector}
        </>
      )}
      <fieldset disabled={locked} className={focusMode ? "space-y-4" : "space-y-3"}>
        <section className="space-y-3" aria-label={t("Подходы")}>
          <div
            className={`flex items-center justify-between gap-2 ${focusMode ? "border-t border-border pt-3" : ""}`}
          >
            <Label>{t("Подходы · {count}", { count: fields.sets.length })}</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={t("Убрать последний подход")}
                disabled={locked || fields.sets.length <= 1}
                onClick={() =>
                  update(
                    {
                      ...fields,
                      sets: fields.sets
                        .slice(0, -1)
                        .map((set, index) => ({ ...set, position: index + 1 })),
                    },
                    "sets",
                  )
                }
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={t("Добавить подход")}
                disabled={locked || fields.sets.length >= MAX_SETS}
                onClick={() => {
                  update(
                    {
                      ...fields,
                      sets: [...fields.sets, newSet(fields.sets.length + 1)],
                    },
                    "sets",
                  );
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {focusMode && (
            <div className="space-y-2" aria-label={t("Прогресс подходов")}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  {t("Подход {number} из {count}", {
                    number: activeSetIndex + 1,
                    count: fields.sets.length,
                  })}
                </span>
                <Select
                  value={String(activeSetIndex)}
                  onValueChange={(value) => setActiveSetIndex(Number(value))}
                >
                  <SelectTrigger aria-label={t("Выбрать подход")} className="w-auto shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end" collisionPadding={8}>
                    {fields.sets.map((set, index) => (
                      <SelectItem key={set.id} value={String(index)}>
                        {index + 1}/{fields.sets.length}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Progress value={focusProgress} aria-label={t("Прогресс подходов")} />
            </div>
          )}
          {focusMode ? (
            <div className="space-y-2">
              {visibleSets.map(({ set, index }) => renderSetRow(set, index))}
            </div>
          ) : (
            <SortableList
              items={fields.sets}
              onReorder={reorderSets}
              handleLabel={(set) =>
                t("Перетащить подход {number}", { number: fields.sets.indexOf(set) + 1 })
              }
              handleClassName="h-7 w-7 p-1 [&_svg]:h-4 [&_svg]:w-4"
              listClassName="space-y-1"
              disabled={locked}
              draggingClassName="opacity-60 ring-1 ring-primary/40 rounded-xl"
              render={(set, handle) => renderSetRow(set, fields.sets.indexOf(set), handle)}
            />
          )}
          {focusMode && (
            <Button
              type="button"
              className="h-14 w-full text-base font-bold"
              onClick={() => {
                if (draftRef.current.operation) void save();
                else recordFocusSet();
              }}
              disabled={
                saving ||
                blocked ||
                (!draft.operation &&
                  !error &&
                  !!activeSet &&
                  draft.recordedSetIds.includes(activeSet.id))
              }
            >
              {saving
                ? t("Сохранение…")
                : draft.operation
                  ? t("Повторить сохранение")
                  : t("Записать подход")}
            </Button>
          )}
          {focusMode && recordedCount > 0 && (
            <div className="space-y-1.5 border-t border-border pt-3" aria-live="polite">
              <h3 className="text-xs font-semibold text-muted-foreground">
                {t("Записанные подходы")}
              </h3>
              <ul aria-label={t("Записанные подходы")} className="space-y-1">
                {fields.sets.map((set, index) =>
                  draft.recordedSetIds.includes(set.id) ? (
                    <li
                      key={set.id}
                      className="flex min-h-8 items-center rounded-md bg-muted/60 px-2 text-sm"
                    >
                      <span className="num mr-2 w-5 shrink-0 text-xs text-muted-foreground">
                        {index + 1}.
                      </span>{" "}
                      <span className="num min-w-0 truncate">
                        {set.weight} {t("кг")} × {set.reps} · RIR {set.rir ? Number(set.rir) : "—"}
                      </span>
                    </li>
                  ) : null,
                )}
              </ul>
            </div>
          )}
        </section>
        {!focusMode && (
          <div className="space-y-2">
            <Label htmlFor="notes">{t("Заметки")}</Label>
            <Textarea
              id="notes"
              maxLength={1000}
              value={fields.notes}
              onChange={(event) => update({ ...fields, notes: event.target.value }, "notes")}
              rows={2}
            />
          </div>
        )}
      </fieldset>
      {!focusMode && (
        <Button
          type="submit"
          disabled={saving || blocked}
          className="h-14 w-full text-base font-bold"
        >
          {saving ? t("Сохранение…") : draft.operation ? t("Повторить сохранение") : t("Сохранить")}
        </Button>
      )}
    </form>
  );
}
