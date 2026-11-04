import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider, themePrepaintScript, useTheme } from "./theme";

it.each([
  ["dark", true, "dark"],
  ["light", true, "light"],
  ["system", true, "dark"],
  ["system", false, "light"],
] as const)(
  "pre-paint theme initializer honors %s and system dark=%s",
  (saved, systemDark, expected) => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockReturnValue(saved === "system" ? null : saved);
    vi.stubGlobal("matchMedia", () => ({ matches: systemDark }));
    new Function(themePrepaintScript)();
    expect(document.documentElement.dataset["theme"]).toBe(expected);
    expect(document.documentElement.style.colorScheme).toBe(expected);
    getItem.mockRestore();
  },
);

it("pre-paint initializer still respects the system when localStorage is inaccessible", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  new Function(themePrepaintScript)();
  expect(document.documentElement.dataset["theme"]).toBe("light");
});

let systemDark = false;
let listeners: Set<(event: MediaQueryListEvent) => void>;

function setSystemTheme(dark: boolean) {
  systemDark = dark;
  const event = { matches: dark, media: "(prefers-color-scheme: dark)" } as MediaQueryListEvent;
  listeners.forEach((listener) => listener(event));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
  delete document.documentElement.dataset["theme"];
  systemDark = false;
  listeners = new Set();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => {
      const media = {
        get matches() {
          return systemDark;
        },
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
          listeners.add(listener),
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
          listeners.delete(listener),
        addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
        removeListener: (listener: (event: MediaQueryListEvent) => void) =>
          listeners.delete(listener),
      };
      return media as unknown as MediaQueryList;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount() {
  return render(
    <ThemeProvider>
      <ThemeControls />
    </ThemeProvider>,
  );
}

function ThemeControls() {
  const { mode, setMode } = useTheme();
  return (
    <div>
      <button type="button" aria-pressed={mode === "system"} onClick={() => setMode("system")}>
        Авто
      </button>
      <button type="button" aria-pressed={mode === "light"} onClick={() => setMode("light")}>
        Светлая
      </button>
      <button type="button" aria-pressed={mode === "dark"} onClick={() => setMode("dark")}>
        Тёмная
      </button>
    </div>
  );
}

it("uses the system dark appearance by default on first open", async () => {
  setSystemTheme(true);
  mount();
  await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("dark"));
  expect(localStorage.getItem("app:theme:v1")).toBeNull();
});

it("uses the system light appearance by default on first open", async () => {
  mount();
  await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("light"));
  expect(localStorage.getItem("app:theme:v1")).toBeNull();
});

it("updates immediately when the system theme changes while in System mode", async () => {
  mount();
  await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("light"));
  act(() => setSystemTheme(true));
  expect(document.documentElement.dataset["theme"]).toBe("dark");
  act(() => setSystemTheme(false));
  expect(document.documentElement.dataset["theme"]).toBe("light");
});

it("lets a manual selection override and persist across remounts", async () => {
  const view = mount();
  fireEvent.click(screen.getByRole("button", { name: "Тёмная" }));
  expect(document.documentElement.dataset["theme"]).toBe("dark");
  expect(localStorage.getItem("app:theme:v1")).toBe("dark");
  act(() => setSystemTheme(false));
  expect(document.documentElement.dataset["theme"]).toBe("dark");

  view.unmount();
  mount();
  await waitFor(() => expect(document.documentElement.dataset["theme"]).toBe("dark"));
});

it("returns to following the system when System is selected again", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Светлая" }));
  expect(document.documentElement.dataset["theme"]).toBe("light");
  fireEvent.click(screen.getByRole("button", { name: "Авто" }));
  expect(localStorage.getItem("app:theme:v1")).toBeNull();
  act(() => setSystemTheme(true));
  expect(document.documentElement.dataset["theme"]).toBe("dark");
});
