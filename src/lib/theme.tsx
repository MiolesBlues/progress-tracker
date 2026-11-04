/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "system" | "light" | "dark";
const STORAGE_KEY = "app:theme:v1";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";
export const themePrepaintScript = `(function(){var m="system";try{m=localStorage.getItem("app:theme:v1")||"system"}catch(e){}var d=m==="dark"||(m==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"})()`;

function readThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme(mode: ThemeMode, systemDark: boolean) {
  const dark = mode === "dark" || (mode === "system" && systemDark);
  const root = document.documentElement;
  root.dataset["theme"] = dark ? "dark" : "light";
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#16171c" : "#f5f7f2");
}

type ThemeContextValue = { mode: ThemeMode; setMode: (mode: ThemeMode) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readThemeMode);

  useEffect(() => {
    const media = window.matchMedia(MEDIA_QUERY);
    const updateSystemTheme = (event: MediaQueryListEvent) => {
      if (mode === "system") applyTheme("system", event.matches);
    };
    applyTheme(mode, media.matches);
    media.addEventListener?.("change", updateSystemTheme);
    // Older Safari versions expose the legacy MediaQueryList API.
    if (!media.addEventListener) media.addListener(updateSystemTheme);
    return () => {
      media.removeEventListener?.("change", updateSystemTheme);
      if (!media.removeEventListener) media.removeListener(updateSystemTheme);
    };
  }, [mode]);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Theme selection still applies for this session when storage is unavailable.
    }
    applyTheme(next, window.matchMedia(MEDIA_QUERY).matches);
  };

  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
