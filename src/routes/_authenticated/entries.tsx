import { createFileRoute } from "@tanstack/react-router";
import { EntriesPage } from "@/components/entries-page";

export const Route = createFileRoute("/_authenticated/entries")({
  head: () => ({
    meta: [
      { title: "Записи — Прогресс Тренер" },
      { name: "description", content: "Дневник тренировок по упражнениям." },
    ],
  }),
  component: EntriesPage,
});
