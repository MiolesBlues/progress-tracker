import { createFileRoute } from "@tanstack/react-router";
import { ProgramManager } from "@/components/program-manager";

export const Route = createFileRoute("/_authenticated/program")({
  head: () => ({
    meta: [
      { title: "Программа — Прогресс Трекер" },
      { name: "description", content: "Ваши персональные тренировочные дни и упражнения." },
      { property: "og:title", content: "Программа — Прогресс Трекер" },
      { property: "og:description", content: "Ваши персональные тренировочные дни и упражнения." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProgramManager,
});
