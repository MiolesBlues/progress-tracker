import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DAYS, toISO, type DayId } from "@/lib/workout";
import { lastEntryQuery, programQuery } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/workout")({
  head: () => ({
    meta: [
      { title: "Тренировка — Workout Tracker" },
      { name: "description", content: "Запишите подходы, вес и RIR для упражнения." },
      { property: "og:title", content: "Тренировка — Workout Tracker" },
      { property: "og:description", content: "Быстрая запись подходов." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkoutPage,
});

const selectCls = "h-12 w-full rounded-md border border-input bg-card px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function WorkoutPage() {
  const qc = useQueryClient();
  const { data: program = [] } = useQuery(programQuery);
  const [day, setDay] = useState<DayId>("upper1");
  const exercises = useMemo(() => program.filter((e) => e.day === day), [program, day]);
  const [exerciseId, setExerciseId] = useState("");
  const [date, setDate] = useState(() => toISO(new Date()));
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState<string[]>(["", "", ""]);
  const [rir, setRir] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!exercises.some((e) => e.id === exerciseId)) setExerciseId(exercises[0]?.id ?? "");
  }, [exercises, exerciseId]);

  const { data: last } = useQuery(lastEntryQuery(exerciseId));
  useEffect(() => {
    // prefill from last session for this exercise
    if (last) {
      setWeight(String(Number(last.weight)));
      setReps(last.reps.map(String));
    } else {
      setWeight("");
      setReps(["", "", ""]);
    }
    setRir("");
    setNotes("");
  }, [last, exerciseId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const w = Number(weight.replace(",", "."));
    const r = reps.map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x) && x >= 0);
    if (!exerciseId) return toast.error("Выберите упражнение");
    if (!Number.isFinite(w) || w < 0) return toast.error("Укажите рабочий вес");
    if (r.length === 0) return toast.error("Укажите повторения");
    const rirNum = rir.trim() === "" ? null : Number(rir.replace(",", "."));
    if (rirNum !== null && (!Number.isFinite(rirNum) || rirNum < 0 || rirNum > 10)) return toast.error("RIR от 0 до 10");
    setSaving(true);
    const { error } = await supabase.from("workout_entries").insert({
      exercise_id: exerciseId, day, performed_on: date, weight: w, reps: r,
      rir: rirNum, notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error("Не удалось сохранить");
    toast.success("Сохранено");
    // keep weight/reps for the next set of the same exercise; clear one-off fields
    setRir("");
    setNotes("");
    qc.invalidateQueries({ queryKey: ["entries", exerciseId] });
    qc.setQueryData(lastEntryQuery(exerciseId).queryKey, { performed_on: date, weight: w, reps: r, rir: rirNum });
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Тренировка</h1>

      <div className="grid grid-cols-4 gap-1 rounded-xl bg-secondary p-1">
        {DAYS.map((d) => (
          <button type="button" key={d.id} onClick={() => setDay(d.id)}
            className={`rounded-lg py-2 text-xs font-bold transition ${day === d.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            {d.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ex">Упражнение</Label>
        <select id="ex" className={selectCls} value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
          {exercises.length === 0 && <option value="">Нет упражнений</option>}
          {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {last && <p className="text-xs text-muted-foreground">Прошлый раз {last.performed_on}: <span className="num">{Number(last.weight)} кг × {last.reps.join(" / ")}</span></p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="date">Дата</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-12" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="w">Рабочий вес, кг</Label>
          <Input id="w" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} className="num h-12 text-lg" placeholder="0" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Повторения по подходам</Label>
          <div className="flex gap-1">
            <Button type="button" size="icon" variant="secondary" aria-label="Убрать подход" disabled={reps.length <= 1} onClick={() => setReps(reps.slice(0, -1))}><Minus className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="secondary" aria-label="Добавить подход" disabled={reps.length >= 10} onClick={() => setReps([...reps, reps.at(-1) ?? ""])}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {reps.map((r, i) => (
            <div key={i} className="space-y-1 text-center">
              <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
              <Input inputMode="numeric" aria-label={`Подход ${i + 1}`} value={r} placeholder="0"
                onChange={(e) => setReps(reps.map((x, j) => (j === i ? e.target.value.replace(/\D/g, "") : x)))}
                className="num h-12 text-center text-lg" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rir">RIR <span className="text-muted-foreground">(необязательно)</span></Label>
        <Input id="rir" inputMode="decimal" value={rir} onChange={(e) => setRir(e.target.value)} className="num h-12" placeholder="—" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Заметки</Label>
        <Textarea id="notes" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      <Button type="submit" disabled={saving || !exerciseId} className="h-14 w-full text-base font-bold">
        {saving ? "Сохранение…" : "Сохранить"}
      </Button>
    </form>
  );
}
