import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вход — Workout Tracker" },
      { name: "description", content: "Войдите или зарегистрируйтесь, чтобы вести дневник тренировок." },
      { property: "og:title", content: "Вход — Workout Tracker" },
      { property: "og:description", content: "Вход и регистрация в Workout Tracker." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/workout", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/workout", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: `${window.location.origin}/workout` },
        });
        if (error) throw error;
        if (!data.session) toast.success("Проверьте почту и подтвердите регистрацию");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка";
      toast.error(msg.includes("Invalid login") ? "Неверный email или пароль" : msg);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error("Не удалось войти через Google");
  }

  return (
    <main className="safe-top mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-10">
      <h1 className="text-3xl font-extrabold tracking-tight">{mode === "in" ? "Вход" : "Регистрация"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Ваши тренировки видны только вам.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Пароль</Label>
          <Input id="pw" type="password" minLength={6} required autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
        </div>
        <Button type="submit" disabled={busy} className="h-12 w-full text-base font-bold">
          {mode === "in" ? "Войти" : "Создать аккаунт"}
        </Button>
      </form>
      <Button variant="secondary" onClick={google} className="mt-3 h-12 w-full">Продолжить с Google</Button>
      <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-6 text-sm text-muted-foreground">
        {mode === "in" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
      </button>
    </main>
  );
}
