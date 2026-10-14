import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { daysQuery } from "@/lib/queries";
import { needsOnboarding } from "@/lib/workout";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AccountBoundary, useUserSession } from "@/lib/session";
import { toast } from "sonner";
import { LoadError, Loading } from "@/components/query-feedback";
import { signOutSafely } from "@/lib/auth-actions";
import { navigationTabs } from "@/lib/navigation";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (
      error &&
      error.name !== "AuthSessionMissingError" &&
      error.status !== 401 &&
      error.status !== 403
    )
      throw new Error("Не удалось проверить сессию. Проверьте соединение и повторите загрузку.");
    if (!data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id };
  },
  component: Layout,
});

function Layout() {
  const { userId } = Route.useRouteContext();
  // A stale router guard must never render a previous account's component tree.
  return (
    <AccountBoundary verifiedUserId={userId}>
      <SessionLayout />
    </AccountBoundary>
  );
}

function SessionLayout() {
  const { userId, store } = useUserSession();
  const navigate = useNavigate();
  async function signOut() {
    const result = await signOutSafely(store);
    if (result.message) toast.error(result.message);
    if (result.signedOut) void navigate({ to: "/auth", replace: true });
  }
  const daysResult = useQuery(daysQuery(userId));
  const days = daysResult.data;
  const path = useLocation({ select: (l) => l.pathname });
  useEffect(() => {
    if (!daysResult.isSuccess) return;
    if (days && needsOnboarding(days) && path !== "/onboarding")
      navigate({ to: "/onboarding", replace: true });
    if (days && !needsOnboarding(days) && path === "/onboarding")
      navigate({ to: "/workout", replace: true });
  }, [days, daysResult.isSuccess, path, navigate]);
  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <header className="safe-top flex items-center justify-between px-5 pb-2">
        <span className="text-sm font-bold tracking-widest text-muted-foreground uppercase">
          Прогресс Тренер
        </span>
        <button
          onClick={signOut}
          aria-label="Выйти"
          className="rounded-full p-2 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>
      <main className="px-5 pb-32">
        {daysResult.isError ? (
          <LoadError onRetry={() => void daysResult.refetch()}>
            Не удалось загрузить тренировочные дни.
          </LoadError>
        ) : daysResult.isPending ? (
          <Loading>Загрузка тренировочных дней…</Loading>
        ) : !daysResult.data.length && path !== "/onboarding" ? (
          <Loading>Настройка программы…</Loading>
        ) : (
          <Outlet />
        )}
      </main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 border-t bg-background/90 backdrop-blur-xl">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {navigationTabs.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
