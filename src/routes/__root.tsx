import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useLocation,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useCallback, useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SessionProvider } from "@/lib/session";
import { Toaster } from "@/components/ui/sonner";
import { useI18n } from "@/lib/i18n";
import { LanguageProvider } from "@/lib/i18n-provider";
import { ThemeProvider } from "@/lib/theme";

function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("Страница не найдена.")}</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("На главную")}
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const { t } = useI18n();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">
          {t("Не удалось загрузить страницу")}
        </h1>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("Повторить")}
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#16171c" },
      { name: "color-scheme", content: "dark light" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Прогресс Трекер" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{try{const s=localStorage.getItem("app:theme:v1");const m=s==="light"||s==="dark"?s:"system";const d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);const r=document.documentElement;r.dataset.theme=d?"dark":"light";r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";const t=document.querySelector('meta[name="theme-color"]');if(t)t.content=d?"#16171c":"#f5f7f2"}catch(e){}})();`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const onIdentityChange = useCallback(() => {
    void router.invalidate();
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider onIdentityChange={onIdentityChange}>
          <LanguageProvider>
            <LocalizedDocumentTitle />
            <Outlet />
            <Toaster
              position="bottom-center"
              offset={{ bottom: "calc(env(safe-area-inset-bottom) + 4.75rem)" }}
              mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 4.75rem)" }}
            />
          </LanguageProvider>
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function LocalizedDocumentTitle() {
  const path = useLocation({ select: (location) => location.pathname });
  const { t } = useI18n();
  useEffect(() => {
    const section =
      path === "/auth"
        ? t("Вход")
        : path === "/onboarding"
          ? t("Настройка программы")
          : path === "/workout"
            ? t("Тренировка")
            : path === "/program"
              ? t("Программа")
              : path === "/entries"
                ? t("Записи")
                : path === "/progress"
                  ? t("Прогресс")
                  : "";
    document.title = section ? `${section} — ${t("Прогресс Трекер")}` : t("Прогресс Трекер");
  }, [path, t]);
  return null;
}
