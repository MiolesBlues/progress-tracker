import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { authMessage } from "@/lib/auth-actions";
import { useSession } from "@/lib/session";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { useI18n, translateKnown, rememberSignupLanguage } from "@/lib/i18n";
import { SettingsDialog } from "@/components/settings-dialog";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход — Прогресс Трекер" },
      {
        name: "description",
        content: "Войдите или зарегистрируйтесь, чтобы вести дневник тренировок.",
      },
      { property: "og:title", content: "Вход — Прогресс Трекер" },
      { property: "og:description", content: "Вход и регистрация в Прогресс Трекер." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, language } = useI18n();
  const { ready } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmationAttempted, setConfirmationAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          setAuthError(authMessage(error, "session"));
          return;
        }
        if (data.session) navigate({ to: "/workout", replace: true });
      })
      .catch((error: unknown) => setAuthError(authMessage(error, "session")));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/workout", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || pending.current) return;
    if (mode === "up") {
      setConfirmationAttempted(true);
      if (!confirmPassword || password !== confirmPassword) return;
    }
    pending.current = true;
    setBusy(true);
    setAuthError("");
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/workout` },
        });
        if (error) throw error;
        if (data.user) rememberSignupLanguage(data.user.id, language);
        if (!data.session) toast.success(t("Проверьте почту и подтвердите регистрацию"));
      }
    } catch (err) {
      setAuthError(authMessage(err));
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  const confirmationError =
    mode !== "up"
      ? ""
      : !confirmPassword && confirmationAttempted
        ? "Подтвердите пароль"
        : confirmPassword && password !== confirmPassword
          ? "Пароли не совпадают"
          : "";

  async function google() {
    if (!ready || pending.current) return;
    pending.current = true;
    setBusy(true);
    setAuthError("");
    try {
      const r = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (r.error) setAuthError(authMessage(r.error, "google"));
    } catch (error) {
      setAuthError(authMessage(error, "google"));
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  return (
    <main className="safe-top mx-auto flex min-h-dvh w-full min-w-0 max-w-md flex-col justify-center px-6 py-8">
      <div className="absolute right-5 top-[calc(env(safe-area-inset-top)+0.5rem)]">
        <SettingsDialog disabled={!ready} />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight">
        {mode === "in" ? t("С возвращением!") : t("Создать аккаунт")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "in"
          ? t("Ваши тренировки видны только вам.")
          : t("Начните отслеживать свои тренировки")}
      </p>
      {authError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {translateKnown(language, authError)}
        </p>
      )}
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            disabled={!ready || busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="box-border h-12 w-full min-w-0 max-w-full"
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="pw">{t("Пароль")}</Label>
          <div className="relative min-w-0">
            <Input
              id="pw"
              type={showPassword ? "text" : "password"}
              minLength={6}
              required
              disabled={!ready || busy}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="box-border h-12 w-full min-w-0 max-w-full pr-12"
            />
            <button
              type="button"
              aria-label={showPassword ? t("Скрыть пароль") : t("Показать пароль")}
              aria-pressed={showPassword}
              disabled={!ready || busy}
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" size={18} />
              ) : (
                <Eye aria-hidden="true" size={18} />
              )}
            </button>
          </div>
        </div>
        {mode === "up" && (
          <div className="min-w-0 space-y-2">
            <Label htmlFor="confirm-pw">{t("Подтвердите пароль")}</Label>
            <div className="relative min-w-0">
              <Input
                id="confirm-pw"
                type={showConfirmPassword ? "text" : "password"}
                minLength={6}
                required
                disabled={!ready || busy}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-invalid={Boolean(confirmationError)}
                aria-describedby={confirmationError ? "confirm-pw-error" : undefined}
                className="box-border h-12 w-full min-w-0 max-w-full pr-12"
              />
              <button
                type="button"
                aria-label={
                  showConfirmPassword
                    ? t("Скрыть подтверждение пароля")
                    : t("Показать подтверждение пароля")
                }
                aria-pressed={showConfirmPassword}
                disabled={!ready || busy}
                onClick={() => setShowConfirmPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground"
              >
                {showConfirmPassword ? (
                  <EyeOff aria-hidden="true" size={18} />
                ) : (
                  <Eye aria-hidden="true" size={18} />
                )}
              </button>
            </div>
            {confirmationError && (
              <p id="confirm-pw-error" role="alert" className="text-sm text-destructive">
                {translateKnown(language, confirmationError)}
              </p>
            )}
          </div>
        )}
        <Button type="submit" disabled={!ready || busy} className="h-12 w-full text-base font-bold">
          {busy
            ? mode === "in"
              ? t("Входим…")
              : t("Регистрируемся…")
            : mode === "in"
              ? t("Войти")
              : t("Зарегистрироваться")}
        </Button>
      </form>
      <Button
        variant="secondary"
        disabled={!ready || busy}
        onClick={google}
        className="mt-3 h-12 w-full"
      >
        {t("Продолжить с Google")}
      </Button>
      <button
        disabled={!ready || busy}
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setConfirmationAttempted(false);
          setAuthError("");
        }}
        className="group mt-6 inline-flex min-h-11 max-w-full items-center rounded-lg px-3 text-left text-sm text-muted-foreground hover:bg-accent/60 active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>
          {mode === "in" ? (
            <>
              {t("Нет аккаунта?")}{" "}
              <span className="font-semibold text-primary group-hover:text-primary/90 group-active:text-primary/80">
                {t("Зарегистрироваться")}
              </span>
            </>
          ) : (
            <>
              {t("Уже есть аккаунт?")}{" "}
              <span className="font-semibold text-primary group-hover:text-primary/90 group-active:text-primary/80">
                {t("Войти")}
              </span>
            </>
          )}
        </span>
      </button>
    </main>
  );
}
