import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/lib/session";
import { userKeys } from "@/lib/queries";
import { MAX_DAYS } from "@/lib/workout";
import { templatesForDays } from "@/lib/training-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n, initialDayNames } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Настройка программы — Прогресс Трекер" },
      { name: "description", content: "Выберите число тренировочных дней и их названия." },
      { property: "og:title", content: "Настройка программы — Прогресс Трекер" },
      { property: "og:description", content: "Персональные тренировочные дни." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const { t, language } = useI18n();
  const { userId, signal, isCurrent } = useUserSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [templateKey, setTemplateKey] = useState<string>("");
  const [dailyOptIn, setDailyOptIn] = useState(false);
  const [names, setNames] = useState(() => initialDayNames(3, language));
  const [busy, setBusy] = useState(false);
  const [templateKeys, setTemplateKeys] = useState<string[] | null>(null);
  const [templateLoadError, setTemplateLoadError] = useState(false);
  const templateApplicationIds = useRef(new Map<string, string>());

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setTemplateKeys(null);
    setTemplateLoadError(false);
    void (async () => {
      try {
        const { data, error } = await supabase
          .rpc("list_training_templates", { _days_per_week: names.length })
          .abortSignal(controller.signal);
        if (!active) return;
        if (error) {
          setTemplateKeys([]);
          setTemplateLoadError(true);
          return;
        }
        setTemplateKeys(
          (data ?? []).map((template) => `${template.template_key}@${template.version}`),
        );
      } catch {
        if (!active) return;
        setTemplateKeys([]);
        setTemplateLoadError(true);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [names.length]);

  const availableTemplates = useMemo(
    () =>
      templatesForDays(names.length).filter((template) =>
        templateKeys?.includes(`${template.template_key}@${template.version}`),
      ),
    [names.length, templateKeys],
  );
  const selectedTemplate = availableTemplates.find((item) => item.template_key === templateKey);

  const setCount = (n: number) => {
    setNames((p) => Array.from({ length: n }, (_, i) => p[i] ?? initialDayNames(n, language)[i]!));
    setTemplateKey("");
    setDailyOptIn(false);
  };

  async function finish() {
    if (names.some((n) => !n.trim()))
      return void toast.error(t("У каждого дня должно быть название"));
    if (selectedTemplate?.requires_daily_opt_in && !dailyOptIn)
      return void toast.error(t("Для семидневного режима подтвердите лёгкий день"));
    setBusy(true);
    try {
      const applicationKey = selectedTemplate
        ? `${userId}:${selectedTemplate.template_key}@${selectedTemplate.version}`
        : "";
      const applicationId = selectedTemplate
        ? (templateApplicationIds.current.get(applicationKey) ?? crypto.randomUUID())
        : undefined;
      if (selectedTemplate && applicationId)
        templateApplicationIds.current.set(applicationKey, applicationId);
      const { error } = await supabase
        .rpc(
          selectedTemplate ? "apply_training_template" : "setup_program",
          selectedTemplate
            ? {
                _application_id: applicationId!,
                _template_key: selectedTemplate.template_key,
                _version: selectedTemplate.version,
                _names: names.map((n) => n.trim()),
                _daily_opt_in: dailyOptIn,
              }
            : { _names: names.map((n) => n.trim()) },
        )
        .abortSignal(signal);
      if (!isCurrent()) return;
      if (error)
        return void toast.error(
          error.message.includes("already")
            ? t("Программа уже создана")
            : t("Не удалось создать программу"),
        );
      await qc.invalidateQueries({ queryKey: userKeys.all(userId) });
      if (!isCurrent()) return;
      nav({ to: selectedTemplate ? "/workout" : "/program", replace: true });
    } catch {
      if (isCurrent()) toast.error(t("Не удалось создать программу"));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  return (
    <div className="space-y-6 pt-4">
      <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
        {t("Шаг {step} из 3", { step })}
      </p>
      {step === 1 && (
        <>
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("Сколько тренировочных дней в неделю?")}
          </h1>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: MAX_DAYS }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`num aspect-square rounded-xl text-lg font-bold ${names.length === n ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("Число дней можно изменить позже в «Программе».")}
          </p>
          <Button className="h-14 w-full font-bold" onClick={() => setStep(2)}>
            {t("Далее")}
          </Button>
        </>
      )}
      {step === 2 && (
        <>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("С чего начать?")}</h1>
          {templateKeys === null && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("Загружаем готовые шаблоны…")}
            </p>
          )}
          {templateLoadError && (
            <p role="alert" className="text-sm text-muted-foreground">
              {t("Готовые шаблоны сейчас недоступны. Можно создать пустую программу.")}
            </p>
          )}
          {templateKeys !== null && !templateLoadError && availableTemplates.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("Для выбранного числа дней нет готовых шаблонов. Можно создать пустую программу.")}
            </p>
          )}
          {[
            ["", t("Пустая программа"), t("Сами добавите упражнения в каждый день.")],
            ...availableTemplates.map(
              (item) =>
                [
                  item.template_key,
                  language === "en" ? item.title_en : item.title_ru,
                  language === "en" ? item.description_en : item.description_ru,
                ] as const,
            ),
          ].map(([id, title, description]) => (
            <button
              key={id}
              onClick={() => setTemplateKey(id)}
              className={`w-full rounded-2xl border-2 p-4 text-left ${templateKey === id ? "border-primary bg-card" : "border-transparent bg-card/60"}`}
            >
              <div className="font-bold">{title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{description}</div>
            </button>
          ))}
          {selectedTemplate?.requires_daily_opt_in && (
            <label className="flex items-start gap-3 rounded-2xl bg-card p-4 text-sm">
              <input
                type="checkbox"
                checked={dailyOptIn}
                onChange={(event) => setDailyOptIn(event.target.checked)}
                className="mt-1 size-4 accent-primary"
              />
              <span>{t("Я выбираю ежедневный режим и понимаю, что седьмой день лёгкий")}</span>
            </label>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="h-14 flex-1" onClick={() => setStep(1)}>
              {t("Назад")}
            </Button>
            <Button
              className="h-14 flex-1 font-bold"
              onClick={() => {
                setStep(3);
              }}
            >
              {t("Далее")}
            </Button>
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("Названия дней")}</h1>
          <p className="-mt-4 text-xs text-muted-foreground">
            {t("Например: Push, Pull, Legs, Upper, Lower, Full Body")}
          </p>
          <div className="space-y-3">
            {names.map((n, i) => (
              <div key={i} className="space-y-1.5 rounded-2xl bg-card p-3">
                <label htmlFor={`day-name-${i}`} className="block text-xs text-muted-foreground">
                  {t("Название дня")}
                </label>
                <Input
                  id={`day-name-${i}`}
                  aria-label={t("День {number}", { number: i + 1 })}
                  value={n}
                  maxLength={60}
                  className="h-11 font-semibold"
                  onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="h-14 flex-1" onClick={() => setStep(2)}>
              {t("Назад")}
            </Button>
            <Button className="h-14 flex-1 font-bold" disabled={busy} onClick={finish}>
              {busy ? t("Создаю…") : t("Готово")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
