import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArchiveRestore, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DAYS, type DayId } from "@/lib/workout";
import { programQuery, type Exercise } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/program")({
  head: () => ({
    meta: [
      { title: "Программа — Workout Tracker" },
      { name: "description", content: "Настройте упражнения, цели и рабочие веса для дней Upper/Lower." },
      { property: "og:title", content: "Программа — Workout Tracker" },
      { property: "og:description", content: "Ваша личная программа Upper/Lower." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgramPage,
});

const selectCls = "h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground";

function ProgramPage() {
  const qc = useQueryClient();
  const { data: program = [] } = useQuery(programQuery);
  const [day, setDay] = useState<DayId>("upper1");
  const [newName, setNewName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const list = program.filter((e) => e.day === day && !e.archived_at);
  const archived = program.filter((e) => e.day === day && e.archived_at);
  const refresh = () => qc.invalidateQueries({ queryKey: ["program"] });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const position = Math.max(0, ...program.filter((x) => x.day === day).map((x) => x.position)) + 1;
    const { error } = await supabase.from("program_exercises").insert({ day, name: name.slice(0, 100), position, target_sets: 3 });
    if (error) return void toast.error("Не удалось добавить");
    setNewName("");
    refresh();
  }

  async function save(ex: Exercise, patch: Partial<Exercise>) {
    const { error } = await supabase.from("program_exercises").update(patch).eq("id", ex.id);
    if (error) return void toast.error("Не удалось сохранить");
    toast.success("Сохранено");
    refresh();
  }

  async function archive(ex: Exercise) {
    if (!confirm(`Убрать «${ex.name}» из программы? История записей сохранится.`)) return;
    await save(ex, { archived_at: new Date().toISOString() });
  }

  async function move(i: number, dir: -1 | 1) {
    const a = list[i], b = list[i + dir];
    if (!a || !b) return;
    const [pa, pb] = a.position === b.position ? [a.position + dir, a.position] : [b.position, a.position];
    await Promise.all([
      supabase.from("program_exercises").update({ position: pa }).eq("id", a.id),
      supabase.from("program_exercises").update({ position: pb }).eq("id", b.id),
    ]);
    refresh();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Программа</h1>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-secondary p-1">
        {DAYS.map((d) => (
          <button key={d.id} onClick={() => setDay(d.id)}
            className={`rounded-lg py-2 text-xs font-bold transition ${day === d.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            {d.label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {list.map((ex, i) => (
          <Row key={ex.id + ex.name + ex.target_reps + ex.target_sets + ex.working_weight + ex.example_reps?.join()} ex={ex}
            first={i === 0} last={i === list.length - 1}
            onSave={(p) => save(ex, p)} onArchive={() => archive(ex)} onMove={(d) => move(i, d)} />
        ))}
        {list.length === 0 && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Упражнений пока нет</li>}
      </ul>

      <form onSubmit={add} className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Новое упражнение" maxLength={100} className="h-12" />
        <Button type="submit" size="icon" className="h-12 w-12 shrink-0" aria-label="Добавить"><Plus className="h-5 w-5" /></Button>
      </form>

      {archived.length > 0 && (
        <section className="space-y-2">
          <button onClick={() => setShowArchived(!showArchived)} className="text-sm font-semibold text-muted-foreground">
            Архив ({archived.length}) {showArchived ? "▲" : "▼"}
          </button>
          {showArchived && archived.map((ex) => (
            <div key={ex.id} className="flex items-center justify-between rounded-xl bg-card/50 p-3 text-sm text-muted-foreground">
              <span>{ex.name}</span>
              <Button size="sm" variant="ghost" onClick={() => save(ex, { archived_at: null })}><ArchiveRestore className="mr-1 h-4 w-4" />Вернуть</Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Row({ ex, first, last, onSave, onArchive, onMove }: {
  ex: Exercise; first: boolean; last: boolean;
  onSave: (p: Partial<Exercise>) => void; onArchive: () => void; onMove: (d: -1 | 1) => void;
}) {
  const [name, setName] = useState(ex.name);
  const [sets, setSets] = useState(ex.target_sets?.toString() ?? "");
  const [repsT, setRepsT] = useState(ex.target_reps ?? "");
  const [weight, setWeight] = useState(ex.working_weight?.toString() ?? "");
  const [example, setExample] = useState(ex.example_reps?.join("-") ?? "");
  const [dayV, setDayV] = useState(ex.day);

  function submit() {
    const n = name.trim();
    if (!n) return void toast.error("Введите название");
    const s = sets.trim() === "" ? null : parseInt(sets, 10);
    if (s !== null && (!Number.isFinite(s) || s < 1 || s > 20)) return void toast.error("Подходы от 1 до 20");
    const w = weight.trim() === "" ? null : Number(weight.replace(",", "."));
    if (w !== null && (!Number.isFinite(w) || w < 0)) return void toast.error("Некорректный вес");
    const exR = example.trim() === "" ? null : example.split(/[-\s/,]+/).filter(Boolean).map((x) => parseInt(x, 10));
    if (exR && exR.some((x) => !Number.isFinite(x) || x < 0)) return void toast.error("Повторы через дефис, напр. 10-10-8");
    onSave({ name: n.slice(0, 100), target_sets: s, target_reps: repsT.trim().slice(0, 30) || null, working_weight: w, example_reps: exR, day: dayV });
  }

  const dirty = name !== ex.name || sets !== (ex.target_sets?.toString() ?? "") || repsT !== (ex.target_reps ?? "")
    || weight !== (ex.working_weight?.toString() ?? "") || example !== (ex.example_reps?.join("-") ?? "") || dayV !== ex.day;

  return (
    <li className="space-y-2 rounded-xl bg-card p-2">
      <div className="flex items-center gap-1">
        <div className="flex flex-col">
          <button disabled={first} onClick={() => onMove(-1)} aria-label="Выше" className="p-1 text-muted-foreground disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button>
          <button disabled={last} onClick={() => onMove(1)} aria-label="Ниже" className="p-1 text-muted-foreground disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button>
        </div>
        <Input aria-label="Название" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="h-11 border-transparent bg-transparent font-semibold" />
        <Button size="icon" variant="ghost" aria-label="Удалить" onClick={onArchive}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
      </div>
      <div className="grid grid-cols-4 gap-2 px-1 text-[10px] text-muted-foreground">
        <label className="space-y-1">Подходы<Input aria-label="Подходы" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value.replace(/\D/g, ""))} className="num h-10" /></label>
        <label className="space-y-1">Цель повт.<Input aria-label="Целевые повторы" value={repsT} onChange={(e) => setRepsT(e.target.value)} placeholder="8-10" maxLength={30} className="num h-10" /></label>
        <label className="space-y-1">Вес, кг<Input aria-label="Рабочий вес" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="—" className="num h-10" /></label>
        <label className="space-y-1">День<select aria-label="День" value={dayV} onChange={(e) => setDayV(e.target.value)} className={`${selectCls} w-full`}>
          {DAYS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select></label>
      </div>
      <div className="flex items-end gap-2 px-1 text-[10px] text-muted-foreground">
        <label className="flex-1 space-y-1">Пример повторов<Input aria-label="Пример повторов" value={example} onChange={(e) => setExample(e.target.value)} placeholder="10-10-10" className="num h-10" /></label>
        {dirty && <Button size="sm" className="h-10" onClick={submit}>Сохранить</Button>}
      </div>
    </li>
  );
}
