import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
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
      { name: "description", content: "Настройте упражнения для дней Upper 1, Lower 1, Upper 2, Lower 2." },
      { property: "og:title", content: "Программа — Workout Tracker" },
      { property: "og:description", content: "Ваша личная программа Upper/Lower." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgramPage,
});

function ProgramPage() {
  const qc = useQueryClient();
  const { data: program = [] } = useQuery(programQuery);
  const [day, setDay] = useState<DayId>("upper1");
  const [newName, setNewName] = useState("");
  const list = program.filter((e) => e.day === day);
  const refresh = () => qc.invalidateQueries({ queryKey: ["program"] });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const position = (list.at(-1)?.position ?? -1) + 1;
    const { error } = await supabase.from("program_exercises").insert({ day, name: name.slice(0, 100), position });
    if (error) return void toast.error("Не удалось добавить");
    setNewName("");
    refresh();
  }

  async function rename(ex: Exercise, name: string) {
    const n = name.trim();
    if (!n || n === ex.name) return;
    const { error } = await supabase.from("program_exercises").update({ name: n.slice(0, 100) }).eq("id", ex.id);
    if (error) return void toast.error("Не удалось сохранить");
    toast.success("Переименовано");
    refresh();
  }

  async function remove(ex: Exercise) {
    if (!confirm(`Удалить «${ex.name}» и все его записи?`)) return;
    const { error } = await supabase.from("program_exercises").delete().eq("id", ex.id);
    if (error) return void toast.error("Не удалось удалить");
    refresh();
  }

  async function move(i: number, dir: -1 | 1) {
    const a = list[i], b = list[i + dir];
    if (!a || !b) return;
    await Promise.all([
      supabase.from("program_exercises").update({ position: b.position }).eq("id", a.id),
      supabase.from("program_exercises").update({ position: a.position }).eq("id", b.id),
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
        {list.map((ex, i) => <Row key={ex.id + ex.name} ex={ex} first={i === 0} last={i === list.length - 1}
          onRename={(n) => rename(ex, n)} onRemove={() => remove(ex)} onMove={(d) => move(i, d)} />)}
        {list.length === 0 && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Упражнений пока нет</li>}
      </ul>

      <form onSubmit={add} className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Новое упражнение" maxLength={100} className="h-12" />
        <Button type="submit" size="icon" className="h-12 w-12 shrink-0" aria-label="Добавить"><Plus className="h-5 w-5" /></Button>
      </form>
    </div>
  );
}

function Row({ ex, first, last, onRename, onRemove, onMove }: {
  ex: Exercise; first: boolean; last: boolean;
  onRename: (n: string) => void; onRemove: () => void; onMove: (d: -1 | 1) => void;
}) {
  const [name, setName] = useState(ex.name);
  const dirty = name.trim() !== ex.name && name.trim() !== "";
  return (
    <li className="flex items-center gap-1 rounded-xl bg-card p-2">
      <div className="flex flex-col">
        <button disabled={first} onClick={() => onMove(-1)} aria-label="Выше" className="p-1 text-muted-foreground disabled:opacity-20"><ArrowUp className="h-4 w-4" /></button>
        <button disabled={last} onClick={() => onMove(1)} aria-label="Ниже" className="p-1 text-muted-foreground disabled:opacity-20"><ArrowDown className="h-4 w-4" /></button>
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
        onKeyDown={(e) => e.key === "Enter" && onRename(name)} className="h-11 border-transparent bg-transparent" />
      {dirty && <Button size="icon" variant="ghost" aria-label="Сохранить" onClick={() => onRename(name)}><Check className="h-4 w-4 text-primary" /></Button>}
      <Button size="icon" variant="ghost" aria-label="Удалить" onClick={onRemove}><Trash2 className="h-4 w-4 text-muted-foreground" /></Button>
    </li>
  );
}
