import { describe, expect, it } from "vitest";
import { renderErrorPage, errorPageResponse } from "./error-page";
import { requestLanguage } from "./ssr-language";
import { formatDisplayDate } from "./i18n";

describe("standalone error page language (no React hydration)", () => {
  it.each([
    ["ru", "Не удалось загрузить страницу", "Повторить", "На главную"],
    ["en", "Could not load the page", "Retry", "Home"],
  ] as const)(
    "renders a complete %s document and private 500 response",
    async (language, heading, retry, home) => {
      const response = errorPageResponse(language);
      expect(response.status).toBe(500);
      expect(response.headers.get("content-language")).toBe(language);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const html = await response.text();
      expect(html).toBe(renderErrorPage(language));
      const doc = new DOMParser().parseFromString(html, "text/html");
      expect(doc.documentElement.lang).toBe(language);
      expect(doc.title).toContain(heading);
      expect(doc.querySelector("h1")?.textContent).toBe(heading);
      expect(doc.querySelector("button")?.textContent).toBe(retry);
      expect(doc.querySelector("a")?.textContent).toBe(home);
      expect(doc.querySelector("script")?.textContent).toContain("app:theme:v1");
    },
  );

  it("prefers the allowlisted display cookie over browser language without reading auth", () => {
    const request = new Request("https://example.invalid", {
      headers: { cookie: "unrelated=secret; app_display_language=en", "accept-language": "ru-RU" },
    });
    expect(requestLanguage(request)).toBe("en");
    expect(renderErrorPage(requestLanguage(request))).not.toContain("secret");
  });

  it.each([
    ["en-GB,en;q=0.9,ru;q=0.8", "en"],
    ["en;q=0.1,ru-RU;q=0.8", "ru"],
    ["en;q=0,ru;q=0.9", "ru"],
    ["fr-FR, de;q=0.8", "ru"],
    ["en;q=invalid,ru;q=0.2", "ru"],
  ] as const)("negotiates browser languages %s with a safe fallback", (accepted, expected) => {
    expect(
      requestLanguage(
        new Request("https://example.invalid", {
          headers: { "accept-language": accepted, cookie: "app_display_language=<script>" },
        }),
      ),
    ).toBe(expected);
  });

  it("uses English when no request exists", () => expect(requestLanguage()).toBe("en"));
});

it("formats ISO dates for display only and tolerates incomplete old draft input", () => {
  expect(formatDisplayDate("2026-10-01", "ru")).toBe("01.10.2026");
  expect(formatDisplayDate("2026-10-01", "en")).toBe("01/10/2026");
  for (const invalid of ["", "not-a-date", "2026-02-30"])
    expect(formatDisplayDate(invalid, "en")).toBe(invalid);
});
