import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Прогресс Трекер — дневник силовых тренировок" },
      {
        name: "description",
        content:
          "Личная программа из 1–7 тренировочных дней, запись подходов, веса и RIR, история и графики.",
      },
      { property: "og:title", content: "Прогресс Трекер — дневник силовых тренировок" },
      {
        property: "og:description",
        content:
          "Персональные тренировочные дни, запись результатов и сравнение с предыдущими сессиями.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useI18n();
  const { ready } = useSession();
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
          {t("Каждый подход —")}
          <br />
          <span className="text-primary">{t("в цифрах.")}</span>
        </h1>
        <p className="mt-4 text-muted-foreground">
          {t(
            "Ваша программа из 1–7 дней с любыми названиями, запись результатов и сравнение тренировок. Upper/Lower доступен как необязательный шаблон.",
          )}
        </p>
      </div>
      <div className="safe-bottom space-y-3">
        <Button
          asChild={ready}
          disabled={!ready}
          size="lg"
          className="h-14 w-full text-base font-bold"
        >
          {ready ? <Link to="/auth">{t("Начать")}</Link> : t("Начать")}
        </Button>
      </div>
    </main>
  );
}
