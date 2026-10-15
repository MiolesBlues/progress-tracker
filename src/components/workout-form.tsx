import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { lastEntryQuery, userKeys, type Exercise } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { prefillFor } from "@/lib/workout";
import { MAX_SETS, validateWorkout, type WorkoutFields } from "@/lib/workout-input";
import {
  newDraft,
  hasDraftInput,
  draftKey,
  readDraft,
  removeSavedDraft,
  writeDraft,
  type WorkoutDraft,
} from "@/lib/workout-draft";
import { SaveWorkoutError, saveWorkout } from "@/lib/save-workout";
import { Loading, LoadError } from "@/components/query-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n, translateKnown } from "@/lib/i18n";

type WorkoutFormProps = {
  exercise: Exercise;
  dayId: string;
  initialDate: string;
  onDateChange: (date: string) => void;
  onSaved: (exerciseId: string, dayId: string, date: string) => boolean;
};

export function WorkoutForm({
  exercise,
  dayId,
  initialDate,
  onDateChange,
  onSaved,
}: WorkoutFormProps) {
  const { t, language } = useI18n();
  const { userId, signal, isCurrent } = useUserSession();
  const qc = useQueryClient();
  const defaults = (): WorkoutFields => {
    const prefill = prefillFor(exercise, null);
    return {
      date: initialDate,
      ...prefill,
      rir: "",
      notes: "",
    };
  };
  const [initial] = useState(() => {
    try {
      const latest = readDraft(userId, exercise.id);
      const matching = readDraft(userId, exercise.id, initialDate);
      return {
        draft:
          matching && hasDraftInput(matching)
            ? matching
            : newDraft(userId, exercise.id, defaults()),
        other:
          latest && latest.fields.date !== initialDate && hasDraftInput(latest) ? latest : null,
        error: "",
      };
    } catch {
      return {
        draft: newDraft(userId, exercise.id, defaults()),
        other: null,
        error: "Не удалось прочитать черновик. Сохранённые данные не изменены.",
      };
    }
  });
  const [draft, setDraft] = useState(initial.draft);
  const draftRef = useRef(draft);
  const [storageError, setStorageError] = useState(initial.error);
  const [blocked, setBlocked] = useState(!!initial.error);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const historyDate = draft.fields.date;
  const lastResult = useQuery(lastEntryQuery(userId, exercise.id, historyDate));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const commit = useCallback((next: WorkoutDraft, persist = true) => {
    draftRef.current = next;
    setDraft(next);
    if (!persist) return;
    try {
      writeDraft(next);
      setStorageError("");
    } catch {
      setStorageError(
        "Черновик не сохранён на устройстве. Проверьте доступ к хранилищу и повторите сохранение.",
      );
    }
  }, []);
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
    if (current.operation || current.fields.date !== historyDate) return;
    const prefill = prefillFor(exercise, lastResult.data);
    const rir = lastResult.data?.rir;
    commit(
      {
        ...current,
        fields: {
          ...current.fields,
          weight: current.dirty.weight ? current.fields.weight : prefill.weight,
          reps: current.dirty.reps ? current.fields.reps : prefill.reps,
          rir: current.dirty.rir ? current.fields.rir : rir == null ? "" : String(Number(rir)),
        },
      },
      hasDraftInput(current),
    );
  }, [
    lastResult.isFetchedAfterMount,
    lastResult.isSuccess,
    lastResult.isFetching,
    lastResult.data,
    exercise,
    historyDate,
    blocked,
    signal,
    commit,
  ]);

  function change<K extends keyof WorkoutFields>(key: K, value: WorkoutFields[K]) {
    if (draftRef.current.operation || blocked) return;
    const current = draftRef.current;
    const fields = { ...current.fields, [key]: value };
    if (key === "date") {
      try {
        const restored = readDraft(userId, exercise.id, fields.date);
        if (restored && hasDraftInput(restored)) {
          commit(restored);
          onDateChange(fields.date);
          return;
        }
      } catch {
        setStorageError(
          "Не удалось прочитать черновик выбранной даты. Сохранённые данные не изменены.",
        );
        return;
      }
    }
    commit({
      // A different date is a different operation; the previous date's draft is retained.
      ...(key === "date" ? newDraft(userId, exercise.id, fields) : current),
      fields,
      dirty: { ...current.dirty, [key]: true },
    });
    if (key === "date") onDateChange(fields.date);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || blocked || !isCurrent()) return;
    submitting.current = true; // Covers two events before React can disable the button.
    setError("");
    setSaving(true);
    try {
      const current = draftRef.current;
      const operation = current.operation ?? {
        id: current.id,
        payload: validateWorkout(current.fields, exercise.id, dayId),
      };
      const pending = { ...current, operation };
      try {
        writeDraft(pending);
      } catch {
        throw new Error(
          "Не удалось сохранить операцию на устройстве. Запрос не отправлен; проверьте доступ к хранилищу.",
        );
      }
      draftRef.current = pending;
      setStorageError("");
      setDraft(pending);
      await saveWorkout(operation.id, operation.payload, signal);
      try {
        removeSavedDraft(userId, exercise.id, operation.id, operation.payload.performed_on);
      } catch {
        if (mounted.current && isCurrent())
          setStorageError(
            "Запись сохранена, но локальный черновик удалить не удалось. Повтор той же операции безопасен.",
          );
      }
      if (!isCurrent()) return;
      // Cancel a pre-save read before invalidating: its late response must not re-seed stale history.
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
        if (!advanced && mounted.current) {
          commit(
            newDraft(userId, exercise.id, {
              date: operation.payload.performed_on,
              weight: String(operation.payload.weight),
              reps: operation.payload.reps.map(String),
              rir: operation.payload.rir === null ? "" : String(operation.payload.rir),
              notes: "",
            }),
          );
        }
      }
    } catch (err) {
      if (!mounted.current || !isCurrent()) return;
      if (err instanceof SaveWorkoutError && err.rejected)
        commit({ ...draftRef.current, operation: null });
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось подтвердить сохранение. Повторите попытку.",
      );
    } finally {
      submitting.current = false;
      if (mounted.current && isCurrent()) setSaving(false);
    }
  }
  const fields = draft.fields;
  const locked = saving || !!draft.operation || blocked;
  const plan =
    exercise.target_sets !== null && exercise.target_reps
      ? `${exercise.target_sets}×${exercise.target_reps.replace(/-/g, "–")}`
      : exercise.target_sets !== null
        ? t("{count} подх.", { count: exercise.target_sets })
        : exercise.target_reps
          ? t("{count} повт.", { count: exercise.target_reps.replace(/-/g, "–") })
          : "";
  const previous = lastResult.data;

  return (
    <form onSubmit={save} className="space-y-5" aria-label={t("Запись тренировки")}>
      {storageError && (
        <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
          {translateKnown(language, storageError)}
        </p>
      )}
      {initial.other && initial.other.fields.date !== draft.fields.date && (
        <div role="status" className="space-y-2 text-sm text-muted-foreground">
          <p>
            {t("Есть незавершённый черновик за {date}. Текущая дата сохранена.", {
              date: initial.other.fields.date,
            })}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={locked}
            onClick={() => {
              if (initial.other) change("date", initial.other.fields.date);
            }}
          >
            {t("Открыть черновик за {date}", { date: initial.other.fields.date })}
          </Button>
        </div>
      )}
      {blocked && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (
              !window.confirm(
                t(
                  "Удалить повреждённый черновик этого упражнения и начать заново? Сначала проверьте историю: запись могла уже сохраниться.",
                ),
              )
            )
              return;
            const fresh = newDraft(userId, exercise.id, defaults());
            try {
              localStorage.removeItem(draftKey(userId, exercise.id));
              localStorage.removeItem(draftKey(userId, exercise.id, initialDate));
              writeDraft(fresh);
              setBlocked(false);
              commit(fresh);
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
            "Не удалось загрузить предыдущую тренировку. Введённые значения сохранены; можно повторить загрузку или заполнить форму вручную.",
          )}
        </LoadError>
      )}
      {lastResult.isSuccess && lastResult.isFetchedAfterMount && !lastResult.isFetching && (
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1 text-xs leading-snug text-muted-foreground">
          {plan && <span>{t("План {plan}", { plan })}</span>}
          {plan && <span aria-hidden="true">·</span>}
          {previous ? (
            <span>
              {t("Было {weight} кг × {reps}", {
                weight: previous.weight === null ? "—" : String(Number(previous.weight)),
                reps: previous.reps.join("/"),
              })}
            </span>
          ) : (
            <span>{t("Истории нет")}</span>
          )}
        </p>
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
        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="date">{t("Дата")}</Label>
            <Input
              id="date"
              type="date"
              value={fields.date}
              onChange={(event) => change("date", event.target.value)}
              className="box-border h-12 min-w-0 w-full max-w-full appearance-auto px-2 sm:px-3"
              required
            />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="w">{t("Рабочий вес, кг")}</Label>
            <Input
              id="w"
              inputMode="decimal"
              value={fields.weight}
              onChange={(event) => change("weight", event.target.value)}
              className="num box-border h-12 min-w-0 w-full max-w-full text-lg"
              placeholder={t("Укажите вес")}
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t("Повторения · подходов: {count}", { count: fields.reps.length })}</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={t("Убрать подход")}
                disabled={locked || fields.reps.length <= 1}
                onClick={() => change("reps", fields.reps.slice(0, -1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={t("Добавить подход")}
                disabled={locked || fields.reps.length >= MAX_SETS}
                onClick={() => change("reps", [...fields.reps, ""])}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "В каждом поле — повторения одного подхода. Пустой подход нужно заполнить или явно убрать.",
            )}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {fields.reps.map((value, index) => (
              <div key={index} className="space-y-1 text-center">
                <span className="text-[10px] text-muted-foreground">#{index + 1}</span>
                <Input
                  inputMode="numeric"
                  aria-label={t("Подход {number}", { number: index + 1 })}
                  value={value}
                  onChange={(event) =>
                    change(
                      "reps",
                      fields.reps.map((item, i) => (i === index ? event.target.value : item)),
                    )
                  }
                  className="num h-12 text-center text-lg"
                />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rir">{t("RIR (необязательно)")}</Label>
          <Input
            id="rir"
            inputMode="decimal"
            value={fields.rir}
            onChange={(event) => change("rir", event.target.value)}
            className="num h-12"
            placeholder="—"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">{t("Заметки")}</Label>
          <Textarea
            id="notes"
            maxLength={1000}
            value={fields.notes}
            onChange={(event) => change("notes", event.target.value)}
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
