import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Workout Tracker — дневник силовых тренировок" },
      { name: "description", content: "Записывайте подходы, вес и RIR по программе Upper/Lower и следите за прогрессом." },
      { property: "og:title", content: "Workout Tracker — дневник силовых тренировок" },
      { property: "og:description", content: "Программа Upper/Lower, запись подходов и графики прогресса." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/workout", replace: true });
    });
  }, [navigate]);

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 pb-10">
      <div className="pt-16">
        <img src="/apple-touch-icon.png" alt="" width={56} height={56} className="rounded-2xl" />
        <h1 className="mt-8 text-4xl font-extrabold leading-tight tracking-tight">
          Каждый подход —<br /><span className="text-primary">в цифрах.</span>
        </h1>
        <p className="mt-4 text-muted-foreground">
          Программа Upper 1 / Lower 1 / Upper 2 / Lower 2, быстрая запись подходов и честный прогресс неделя к неделе.
        </p>
      </div>
      <div className="safe-bottom space-y-3">
        <Button asChild size="lg" className="h-14 w-full text-base font-bold"><Link to="/auth">Начать</Link></Button>
      </div>
    </main>
  );
}
