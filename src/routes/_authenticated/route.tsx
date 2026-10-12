import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { daysQuery } from "@/lib/queries";
import { needsOnboarding } from "@/lib/workout";
import { Dumbbell, ListChecks, LineChart, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id };
  },
  component: Layout,
});

const tabs = [
  { to: "/workout", label: "Тренировка", Icon: Dumbbell },
  { to: "/program", label: "Программа", Icon: ListChecks },
  { to: "/progress", label: "Прогресс", Icon: LineChart },
] as const;

function Layout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  const { data: days } = useQuery(daysQuery);
  const path = useLocation({ select: (l) => l.pathname });
  useEffect(() => {
    if (days && needsOnboarding(days) && path !== "/onboarding") navigate({ to: "/onboarding", replace: true });
    if (days && !needsOnboarding(days) && path === "/onboarding") navigate({ to: "/workout", replace: true });
  }, [days, path, navigate]);
  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <header className="safe-top flex items-center justify-between px-5 pb-2">
        <span className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Workout</span>
        <button onClick={signOut} aria-label="Выйти" className="rounded-full p-2 text-muted-foreground hover:text-foreground">
          <LogOut className="h-5 w-5" />
        </button>
      </header>
      <main className="px-5 pb-32"><Outlet /></main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 border-t bg-background/90 backdrop-blur-xl">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {tabs.map(({ to, label, Icon }) => (
            <Link key={to} to={to} className="flex flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground"
              activeProps={{ className: "text-primary" }}>
              <Icon className="h-5 w-5" />{label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
