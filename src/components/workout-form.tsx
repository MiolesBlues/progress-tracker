import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Minus, Plus } from "lucide-react";
import { lastEntryQuery, userKeys, type Exercise } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { prefillFor } from "@/lib/workout";
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
import { useI18n, translateKnown } from "@/lib/i18n";

type WorkoutFormProps = {
  exercise: Exercise;
  dayId: string;
  initialDate: string;
  onDateChange: (date: string) => void;
  onSaved: (exerciseId: string, dayId: string, date: string) => boolean;
  focusMode?: boolean;
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
  const [legacyDone, setLegacyDone] = useState(false);
  const [legacy] = useState(() => {
    try {
      return readDraft(userId, props.exercise.id, props.initialDate);
    } catch {
      return null;
    }
  });
  if (legacy?.operation && !legacyDone)
    return <LegacyRetry {...props} draft={legacy} onCompleted={() => setLegacyDone(true)} />;
  return <PerSetWorkoutForm {...props} legacyDraft={legacyDone ? null : legacy} />;
}

function LegacyRetry({
  exercise,
  dayId,
  initialDate,
  onSaved,
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
      <Button type="button" disabled={saving} onClick={() => void retry()} className="h-14 w-full">
        {saving ? t("Сохранение…") : t("Повторить сохранение")}
      </Button>
    </section>
  );
}

function PerSetWorkoutForm({
  exercise,
  dayId,
  initialDate,
  onDateChange,
  onSaved,
  legacyDraft,
  focusMode = false,
}: WorkoutFormProps & { legacyDraft: WorkoutDraft | null }) {
  const { t, language, date } = useI18n();
  const { userId, signal, isCurrent } = useUserSession();
  const qc = useQueryClient();
  const defaults = (): PerSetWorkoutFields => {
    const prefill = prefillFor(exercise, null);
    return {
      date: initialDate,
      notes: "",
      sets: prefill.reps.map((reps, index) => newSet(index + 1, prefill.weight, reps)),
    };
  };
  const [initial] = useState(() => {
    try {
      const saved = readPerSetDraft(userId, exercise.id, initialDate);
      if (saved && hasPerSetDraftInput(saved)) return { draft: saved, error: "" };
      const fields = legacyDraft
        ? {
            date: legacyDraft.fields.date,
            notes: legacyDraft.fields.notes,
            sets: legacyDraft.fields.reps.map((reps, index) =>
              newSet(index + 1, legacyDraft.fields.weight, reps, legacyDraft.fields.rir),
            ),
          }
        : defaults();
      return { draft: newPerSetDraft(userId, exercise.id, fields), error: "" };
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
    const base = prefillFor(exercise, null);
    if (!previous) return;
    const nextSets = current.fields.sets.map((set, index) => {
      const old = previous.sets?.[index];
      const oldReps = old?.reps ?? previous.reps?.[index];
      return {
        ...set,
        weight: old ? String(old.weight) : String(Number(previous.weight)),
        reps: oldReps === undefined ? (base.reps[index] ?? "") : String(oldReps),
        rir: old ? (old.rir ?? "") : previous.rir == null ? "" : String(Number(previous.rir)),
        set_type: old?.set_type ?? set.set_type,
        load_type: old?.load_type ?? set.load_type,
      };
    });
    if (!current.dirty.sets) commit({ ...current, fields: { ...current.fields, sets: nextSets } });
  }, [
    lastResult.isFetchedAfterMount,
    lastResult.isSuccess,
    lastResult.isFetching,
    lastResult.data,
    exercise,
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
    commit({
      ...current,
      fields: nextFields,
      recordedSetIds: dirty === "sets" ? [] : current.recordedSetIds,
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
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
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
      if (
        mounted.current &&
        draftRef.current.id === operation.id &&
        !onSaved(exercise.id, dayId, operation.payload.performed_on)
      ) {
        const next = newPerSetDraft(userId, exercise.id, {
          date: operation.payload.performed_on,
          notes: "",
          sets: operation.payload.sets.map((set) => ({
            ...set,
            reps: String(set.reps),
            rir: set.rir ?? "",
          })),
        });
        commit(next);
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
  const plan =
    exercise.target_sets !== null && exercise.target_reps
      ? `${exercise.target_sets}×${exercise.target_reps.replace(/-/g, "–")}`
      : "";
  const previous = lastResult.data;
  const visibleSets = focusMode
    ? fields.sets[activeSetIndex]
      ? [{ set: fields.sets[activeSetIndex]!, index: activeSetIndex }]
      : []
    : fields.sets.map((set, index) => ({ set, index }));
  const recordedCount = fields.sets.filter((set) => draft.recordedSetIds.includes(set.id)).length;
  const focusProgress = fields.sets.length ? (recordedCount / fields.sets.length) * 100 : 0;
  return (
    <form onSubmit={save} className="space-y-5" aria-label={t("Запись тренировки")}>
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
      {lastResult.isSuccess && lastResult.isFetchedAfterMount && !lastResult.isFetching && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            {plan && <>{t("План {plan}", { plan })} · </>}
            {previous ? t("Предыдущая тренировка загружена по подходам") : t("Истории нет")}
          </p>
          {previous?.sets?.length ? (
            <ul aria-label={t("Прошлые результаты по подходам")} className="space-y-1">
              {previous.sets.map((set) => (
                <li key={set.position}>
                  {t("Подход {number}", { number: set.position })}: {set.weight} {t("кг")} ×{" "}
                  {set.reps} · RIR {set.rir ?? "—"}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
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
      <fieldset disabled={locked} className="space-y-5">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="date">{t("Дата")}</Label>
          <Input
            id="date"
            type="date"
            value={fields.date}
            onChange={(event) => update({ ...fields, date: event.target.value }, "date")}
            className="box-border h-12 w-full min-w-0 max-w-full px-2 sm:px-3"
            required
          />
        </div>
        <section className="space-y-3" aria-label={t("Подходы")}>
          {focusMode && (
            <div className="space-y-2 rounded-xl bg-card p-3" aria-label={t("Прогресс подходов")}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {t("Подход {number} из {count}", {
                    number: activeSetIndex + 1,
                    count: fields.sets.length,
                  })}
                </span>
                <span className="text-muted-foreground">
                  {recordedCount}/{fields.sets.length}
                </span>
              </div>
              <Progress value={focusProgress} aria-label={t("Прогресс подходов")} />
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={activeSetIndex === 0}
                  onClick={() => setActiveSetIndex((index) => Math.max(0, index - 1))}
                >
                  {t("Предыдущий подход")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={activeSetIndex >= fields.sets.length - 1}
                  onClick={() =>
                    setActiveSetIndex((index) => Math.min(fields.sets.length - 1, index + 1))
                  }
                >
                  {t("Следующий подход")}
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
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
                onClick={() =>
                  update(
                    {
                      ...fields,
                      sets: [
                        ...fields.sets,
                        newSet(
                          fields.sets.length + 1,
                          fields.sets.at(-1)?.weight ?? "",
                          fields.sets.at(-1)?.reps ?? "",
                          fields.sets.at(-1)?.rir ?? "",
                        ),
                      ],
                    },
                    "sets",
                  )
                }
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {visibleSets.map(({ set, index }) => (
              <div
                key={set.id}
                className={`grid grid-cols-[2rem_repeat(3,minmax(0,1fr))_auto] items-end gap-2 rounded-xl bg-card p-2 ${focusMode ? "animate-in fade-in slide-in-from-right-2 duration-250 motion-reduce:animate-none motion-reduce:transition-none" : ""}`}
              >
                <span className="pb-3 text-xs text-muted-foreground">#{index + 1}</span>
                <label className="min-w-0 space-y-1 text-xs">
                  <span>{set.load_type === "bodyweight" ? t("Доп. вес, кг") : t("Вес, кг")}</span>
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
                    className="num h-11 min-w-0 px-2"
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
                    className="num h-11 min-w-0 px-2"
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
                    className="num h-11 min-w-0 px-2"
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("Переместить подход вверх")}
                    disabled={locked || index === 0}
                    onClick={() => {
                      const sets = [...fields.sets];
                      const before = sets[index - 1]!;
                      sets[index - 1] = sets[index]!;
                      sets[index] = before;
                      update(
                        { ...fields, sets: sets.map((item, i) => ({ ...item, position: i + 1 })) },
                        "sets",
                      );
                    }}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t("Переместить подход вниз")}
                    disabled={locked || index === fields.sets.length - 1}
                    onClick={() => {
                      const sets = [...fields.sets];
                      const after = sets[index + 1]!;
                      sets[index + 1] = sets[index]!;
                      sets[index] = after;
                      update(
                        { ...fields, sets: sets.map((item, i) => ({ ...item, position: i + 1 })) },
                        "sets",
                      );
                    }}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
                <div className="col-span-5 grid grid-cols-2 gap-2">
                  <label className="min-w-0 space-y-1 text-xs">
                    <span>{t("Тип подхода")}</span>
                    <select
                      aria-label={t("Тип подхода {number}", { number: index + 1 })}
                      className="h-10 w-full rounded-md border border-input bg-background px-2"
                      value={set.set_type}
                      onChange={(event) =>
                        update(
                          {
                            ...fields,
                            sets: fields.sets.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    set_type: event.target.value as WorkoutSetFields["set_type"],
                                  }
                                : item,
                            ),
                          },
                          "sets",
                        )
                      }
                    >
                      <option value="working">{t("Рабочий")}</option>
                      <option value="warmup">{t("Разминочный")}</option>
                    </select>
                  </label>
                  <label className="min-w-0 space-y-1 text-xs">
                    <span>{t("Тип нагрузки")}</span>
                    <select
                      aria-label={t("Тип нагрузки {number}", { number: index + 1 })}
                      className="h-10 w-full rounded-md border border-input bg-background px-2"
                      value={set.load_type}
                      onChange={(event) =>
                        update(
                          {
                            ...fields,
                            sets: fields.sets.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    load_type: event.target.value as WorkoutSetFields["load_type"],
                                  }
                                : item,
                            ),
                          },
                          "sets",
                        )
                      }
                    >
                      <option value="external">{t("Внешнее отягощение")}</option>
                      <option value="bodyweight">{t("Собственный вес + отягощение")}</option>
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
          {focusMode && (
            <Button
              type="button"
              className="h-12 w-full"
              onClick={recordFocusSet}
              disabled={locked}
            >
              {draft.recordedSetIds.includes(fields.sets[activeSetIndex]?.id ?? "")
                ? t("Подход записан · далее")
                : t("Записать подход · далее")}
            </Button>
          )}
        </section>
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
      </fieldset>
      <Button
        type="submit"
        disabled={saving || blocked}
        className="h-14 w-full text-base font-bold"
      >
        {saving ? t("Сохранение…") : draft.operation ? t("Повторить сохранение") : t("Сохранить")}
      </Button>
    </form>
  );
}
