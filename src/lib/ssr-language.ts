import type { Language } from "./i18n";

// Display hint for standalone error HTML only. Never used for identity or authorization.
export const DISPLAY_LANGUAGE_COOKIE = "app_display_language";

export function requestLanguage(request?: Request): Language {
  const cookie = request?.headers
    .get("cookie")
    ?.split(";")
    .find((part) => part.trim().startsWith(`${DISPLAY_LANGUAGE_COOKIE}=`));
  const saved = cookie?.trim().slice(DISPLAY_LANGUAGE_COOKIE.length + 1);
  if (saved === "ru" || saved === "en") return saved;
  const accepted = (request?.headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", quality] = part.trim().split(";");
      return {
        language: tag.toLowerCase().split("-")[0],
        quality: quality === undefined ? 1 : Number(quality.trim().replace(/^q=/, "")),
      };
    })
    .filter(
      ({ language, quality }) =>
        (language === "ru" || language === "en") && quality > 0 && quality <= 1,
    )
    .sort((a, b) => b.quality - a.quality);
  return accepted[0]?.language === "ru" ? "ru" : "en";
}
