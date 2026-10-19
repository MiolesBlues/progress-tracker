import { supabase } from "@/integrations/supabase/client";
import type { SessionStore } from "./session";

export function authMessage(error: unknown, action: "login" | "google" | "session" = "login") {
  const value = error instanceof Error ? error.message : "";
  if (/invalid login/i.test(value)) return "Неверный email или пароль.";
  if (/email not confirmed/i.test(value)) return "Подтвердите email по ссылке в письме.";
  if (/already registered/i.test(value)) return "Этот email уже зарегистрирован. Попробуйте войти.";
  if (/rate limit|too many/i.test(value))
    return "Слишком много попыток. Подождите и повторите вход.";
  if (/fetch|network|timeout/i.test(value))
    return "Не удалось связаться с сервером входа. Проверьте соединение и повторите попытку.";
  if (action === "google")
    return "Не удалось войти через Google. Повторите вход или используйте email и пароль.";
  if (action === "session") return "Не удалось восстановить сессию. Повторите вход.";
  return "Не удалось выполнить вход или регистрацию. Проверьте данные и повторите попытку.";
}

/** Hide private UI immediately. Restore only a session still present in the SDK. */
export async function signOutSafely(
  store: SessionStore,
): Promise<{ signedOut: boolean; message: string | null }> {
  store.startSignOut();
  try {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      store.finishSignOut();
      return { signedOut: true, message: null };
    }
  } catch {
    // The SDK may throw a transport error instead of returning AuthError.
  }
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const userId = data.session?.user.id ?? null;
    store.finishSignOut(userId);
    return {
      signedOut: !userId,
      message: userId
        ? "Не удалось выйти. Сессия на устройстве сохранена; повторите попытку."
        : "На этом устройстве вы вышли, но сервер не подтвердил отзыв сессий на других устройствах. Повторите выход после восстановления соединения.",
    };
  } catch {
    store.finishSignOut();
    return {
      signedOut: true,
      message:
        "Не удалось подтвердить выход. Приватные данные скрыты; обновите страницу и проверьте сессию при восстановленном соединении.",
    };
  }
}
