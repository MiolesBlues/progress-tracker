import { translate, type Language } from "./i18n";

export function renderErrorPage(language: Language = "ru"): string {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8" />
    <title>${t("Не удалось загрузить страницу")} — ${t("Прогресс Трекер")}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #16171c; color: #f5f5f5; display: grid; place-items: center; min-height: 100dvh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #b9bac2; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #b6ef55; color: #16171c; }
      .secondary { background: #23252c; color: #f5f5f5; border-color: #454751; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${t("Не удалось загрузить страницу")}</h1>
      <p>${t("Повторите загрузку или вернитесь на главную. Сохранённые тренировки останутся в вашем аккаунте.")}</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">${t("Повторить")}</button>
        <a class="secondary" href="/">${t("На главную")}</a>
      </div>
    </div>
  </body>
</html>`;
}

export function errorPageResponse(language: Language): Response {
  return new Response(renderErrorPage(language), {
    status: 500,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-language": language,
      "cache-control": "no-store",
    },
  });
}
