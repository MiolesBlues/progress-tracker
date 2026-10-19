import { createFileRoute } from "@tanstack/react-router";
import { WorkoutPage } from "@/components/workout-page";

export const Route = createFileRoute("/_authenticated/workout")({
  head: () => ({
    meta: [
      { title: "Тренировка — Прогресс Трекер" },
      { name: "description", content: "Запишите подходы, вес и RIR для упражнения." },
    ],
  }),
  component: WorkoutPage,
});
