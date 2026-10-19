import { BookOpen, Dumbbell, LineChart, ListChecks } from "lucide-react";

export const navigationTabs = [
  { to: "/workout", label: "Тренировка", Icon: Dumbbell },
  { to: "/program", label: "Программа", Icon: ListChecks },
  { to: "/entries", label: "Записи", Icon: BookOpen },
  { to: "/progress", label: "Прогресс", Icon: LineChart },
] as const;
