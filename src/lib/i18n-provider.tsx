import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "./session";
import { LanguageContext, readLanguage, STORAGE_PREFIX, translate, type Language } from "./i18n";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { userId } = useSession();
  const [selection, setSelection] = useState<{ userId: string | null; language: Language }>({
    userId: null,
    language: "ru",
  });
  // Derive at render time: another account can never see the previous language even briefly.
  const language = selection.userId === userId ? selection.language : readLanguage(userId);
  function setLanguage(next: Language) {
    setSelection({ userId, language: next });
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${userId ?? "guest"}`, next);
    } catch {
      // The current tab still uses the chosen language if storage is unavailable.
    }
  }
  useEffect(() => {
    setSelection({ userId, language: readLanguage(userId) });
  }, [userId]);
  useEffect(() => {
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; language: Language }>).detail;
      if (detail?.userId === userId) setSelection({ userId, language: detail.language });
    };
    window.addEventListener("app-language-updated", onUpdated);
    return () => window.removeEventListener("app-language-updated", onUpdated);
  }, [userId]);
  useEffect(() => {
    document.documentElement.lang = language;
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifest)
      manifest.href = language === "en" ? "/manifest.en.webmanifest" : "/manifest.webmanifest";
    const appleTitle = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]',
    );
    if (appleTitle) appleTitle.content = translate(language, "Прогресс Трекер");
  }, [language]);
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}
