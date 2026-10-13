import { createFileRoute } from "@tanstack/react-router";
import { ProgressPage } from "@/components/progress-page";

export const Route = createFileRoute("/_authenticated/progress")({
  head: () => ({
    meta: [
      { title: "Прогресс — Workout Tracker" },
      { name: "description", content: "Графики веса, повторений и объёма с недельным сравнением." },
      { property: "og:title", content: "Прогресс — Workout Tracker" },
      { property: "og:description", content: "Ваш прогресс по упражнениям." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgressPage,
});
