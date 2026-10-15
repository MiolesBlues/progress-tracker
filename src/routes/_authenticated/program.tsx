import { createFileRoute } from "@tanstack/react-router";
import { ProgramManager } from "@/components/program-manager";

export const Route = createFileRoute("/_authenticated/program")({
  head: () => ({ meta: [{ title: "Программа — Прогресс Трекер" }] }),
  component: ProgramManager,
});
