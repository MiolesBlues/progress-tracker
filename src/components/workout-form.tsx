import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { lastEntryQuery, userKeys, type Exercise } from "@/lib/queries";
import { useUserSession } from "@/lib/session";
import { prefillFor, toISO } from "@/lib/workout";
import { MAX_SETS, validateWorkout, type WorkoutFields } from "@/lib/workout-input";
import {
  newDraft,
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

export function WorkoutForm({ exercise, dayId }: { exercise: Exercise; dayId: string }) {
  const { userId, signal, isCurrent } = useUserSession();
  const qc = useQueryClient();
  const defaults = (): WorkoutFields => ({
    date: toISO(new Date()),
    ...prefillFor(exercise, null),
    rir: "",
    notes: "",
  });
  const [initial] = useState(() => {
    try {
      return {
        draft: readDraft(userId, exercise.id) ?? newDraft(userId, exercise.id, defaults()),
        error: "",
      };
    } catch {
      return {
        draft: newDraft(userId, exercise.id, defaults()),
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
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  const acknowledged = useRef(false);
  const mounted = useRef(true);
  const appliedLast = useRef(false);
  const lastResult = useQuery(lastEntryQuery(userId, exercise.id, draft.fields.date));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function commit(next: WorkoutDraft) {
    draftRef.current = next;
    setDraft(next);
    try {
      writeDraft(next);
      setStorageError("");
    } catch {
      setStorageError(
        "Черновик не сохранён на устройстве. Проверьте доступ к хранилищу и повторите сохранение.",
      );
    }
  }
  useEffect(() => {
    if (appliedLast.current || !lastResult.isSuccess || blocked) return;
    appliedLast.current = true;
    const current = draftRef.current;
    if (current.operation || !lastResult.data) return;
    const prefill = prefillFor(exercise, lastResult.data);
    commit({
      ...current,
      fields: {
        ...current.fields,
        weight: current.dirty.weight ? current.fields.weight : prefill.weight,
        reps: current.dirty.reps ? current.fields.reps : prefill.reps,
      },
    });
    // Only the first completed last-entry request for this explicitly selected form may prefill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResult.isSuccess, lastResult.data, blocked]);

  function change<K extends keyof WorkoutFields>(key: K, value: WorkoutFields[K]) {
    if (draftRef.current.operation || blocked || acknowledged.current) return;
    // A date change must never allow a late response to prefill this edited form.
    if (key === "date") appliedLast.current = true;
    commit({
      ...draftRef.current,
      fields: { ...draftRef.current.fields, [key]: value },
      dirty: { ...draftRef.current.dirty, [key]: true },
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || acknowledged.current || blocked || !isCurrent()) return;
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
        removeSavedDraft(userId, exercise.id, operation.id);
      } catch {
        if (mounted.current && isCurrent())
          setStorageError(
            "Запись сохранена, но локальный черновик удалить не удалось. Повтор той же операции безопасен.",
          );
      }
      if (!isCurrent()) return;
      if (mounted.current) {
        acknowledged.current = true;
        setSaved(true);
      }
      void qc.invalidateQueries({ queryKey: userKeys.entries(userId, exercise.id) });
      void qc.invalidateQueries({ queryKey: userKeys.lastEntry(userId, exercise.id) });
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
  function anotherEntry() {
    const fields = { ...draftRef.current.fields, date: toISO(new Date()), rir: "", notes: "" };
    acknowledged.current = false;
    appliedLast.current = true;
    setSaved(false);
    setError("");
    commit(newDraft(userId, exercise.id, fields));
  }
  const fields = draft.fields;
  const locked = saving || !!draft.operation || saved || blocked;

  return (
    <form onSubmit={save} className="space-y-5" aria-label="Запись тренировки">
      {storageError && (
        <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
          {storageError}
        </p>
      )}
      {blocked && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (
              !window.confirm(
                "Удалить повреждённый черновик этого упражнения и начать заново? Сначала проверьте историю: запись могла уже сохраниться.",
              )
            )
              return;
            const fresh = newDraft(userId, exercise.id, defaults());
            try {
              writeDraft(fresh);
              setBlocked(false);
              commit(fresh);
            } catch {
              setStorageError("Не удалось записать новый черновик.");
            }
          }}
        >
          Начать новый черновик
        </Button>
      )}
      {lastResult.isPending && <Loading>Загрузка предыдущей тренировки…</Loading>}
      {lastResult.isError && (
        <LoadError onRetry={() => void lastResult.refetch()}>
          Не удалось загрузить предыдущую тренировку. Введённые значения сохранены; можно повторить
          загрузку или заполнить форму вручную.
        </LoadError>
      )}
      {lastResult.isSuccess && !lastResult.data && (
        <p className="text-xs text-muted-foreground">Предыдущих записей пока нет.</p>
      )}
      {lastResult.isSuccess && lastResult.data && (
        <p className="text-xs text-muted-foreground">
          Прошлый раз {lastResult.data.performed_on}: {Number(lastResult.data.weight)} кг ×{" "}
          {lastResult.data.reps.join(" / ")}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-destructive p-3 text-sm">
          {error}
        </p>
      )}
      {draft.operation && !saved && (
        <p role="status" className="text-sm text-muted-foreground">
          Операция ожидает подтверждения. При повторе отправятся те же значения; поля временно
          заблокированы.
        </p>
      )}
      {saved && (
        <div role="status" className="space-y-3">
          <p>Сохранено</p>
          <Button type="button" onClick={anotherEntry}>
            Ещё одна запись
          </Button>
        </div>
      )}

      <fieldset disabled={locked} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="date">Дата</Label>
            <Input
              id="date"
              type="date"
              value={fields.date}
              onChange={(event) => change("date", event.target.value)}
              className="h-12"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="w">Рабочий вес, кг</Label>
            <Input
              id="w"
              inputMode="decimal"
              value={fields.weight}
              onChange={(event) => change("weight", event.target.value)}
              className="num h-12 text-lg"
              placeholder="Укажите вес"
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Повторения · подходов: {fields.reps.length}</Label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Убрать подход"
                disabled={locked || fields.reps.length <= 1}
                onClick={() => change("reps", fields.reps.slice(0, -1))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label="Добавить подход"
                disabled={locked || fields.reps.length >= MAX_SETS}
                onClick={() => change("reps", [...fields.reps, ""])}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            В каждом поле — повторения одного подхода. Пустой подход нужно заполнить или явно
            убрать.
          </p>
          <div className="grid grid-cols-5 gap-2">
            {fields.reps.map((value, index) => (
              <div key={index} className="space-y-1 text-center">
                <span className="text-[10px] text-muted-foreground">#{index + 1}</span>
                <Input
                  inputMode="numeric"
                  aria-label={`Подход ${index + 1}`}
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
          <Label htmlFor="rir">RIR (необязательно)</Label>
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
          <Label htmlFor="notes">Заметки</Label>
          <Textarea
            id="notes"
            maxLength={1000}
            value={fields.notes}
            onChange={(event) => change("notes", event.target.value)}
            rows={2}
          />
        </div>
      </fieldset>
      {!saved && (
        <Button
          type="submit"
          disabled={saving || blocked}
          className="h-14 w-full text-base font-bold"
        >
          {saving ? "Сохранение…" : draft.operation ? "Повторить сохранение" : "Сохранить"}
        </Button>
      )}
    </form>
  );
}
