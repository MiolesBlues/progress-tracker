import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/lib/session";
import { userKeys } from "@/lib/queries";
import { MAX_DAYS, UPPER_LOWER_NAMES } from "@/lib/workout";
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
  const [template, setTemplate] = useState<"empty" | "upper_lower">("empty");
  const [names, setNames] = useState(() => initialDayNames(3, language));
  const [busy, setBusy] = useState(false);

  const setCount = (n: number) =>
    setNames((p) => Array.from({ length: n }, (_, i) => p[i] ?? initialDayNames(n, language)[i]!));

  async function finish() {
    if (names.some((n) => !n.trim()))
      return void toast.error(t("У каждого дня должно быть название"));
    setBusy(true);
    const { error } = await supabase
      .rpc("setup_program", {
        _names: names.map((n) => n.trim()),
        ...(template === "upper_lower" ? { _template: "upper_lower" } : {}),
      })
      .abortSignal(signal);
    if (!isCurrent()) return;
    setBusy(false);
    if (error)
      return void toast.error(
        error.message.includes("already")
          ? t("Программа уже создана")
          : t("Не удалось создать программу"),
      );
    await qc.invalidateQueries({ queryKey: userKeys.all(userId) });
    if (!isCurrent()) return;
    nav({ to: template === "empty" ? "/program" : "/workout", replace: true });
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
          {(
            [
              ["empty", t("Пустая программа"), t("Сами добавите упражнения в каждый день.")],
              [
                "upper_lower",
                t("Шаблон Upper/Lower"),
                t("4 дня, 25 упражнений со стартовыми весами. Всё редактируется."),
              ],
            ] as const
          ).map(([id, t, d]) => (
            <button
              key={id}
              onClick={() => setTemplate(id)}
              className={`w-full rounded-2xl border-2 p-4 text-left ${template === id ? "border-primary bg-card" : "border-transparent bg-card/60"}`}
            >
              <div className="font-bold">{t}</div>
              <div className="mt-1 text-sm text-muted-foreground">{d}</div>
            </button>
          ))}
          <div className="flex gap-2">
            <Button variant="secondary" className="h-14 flex-1" onClick={() => setStep(1)}>
              {t("Назад")}
            </Button>
            <Button
              className="h-14 flex-1 font-bold"
              onClick={() => {
                if (template === "upper_lower") setNames(UPPER_LOWER_NAMES);
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
