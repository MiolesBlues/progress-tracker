import { createFileRoute } from "@tanstack/react-router";
import { EntriesPage } from "@/components/entries-page";

export const Route = createFileRoute("/_authenticated/entries")({
  head: () => ({
    meta: [
      { title: "Записи — Прогресс Трекер" },
      { name: "description", content: "Дневник тренировок по упражнениям." },
      { property: "og:title", content: "Записи — Прогресс Трекер" },
      { property: "og:description", content: "Дневник тренировок по упражнениям." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EntriesPage,
});
