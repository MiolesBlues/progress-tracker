import { translate, type Language } from "./i18n";

export function renderErrorPage(language: Language = "ru"): string {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8" />
    <title>${t("Не удалось загрузить страницу")} — ${t("Прогресс Трекер")}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="theme-color" content="#16171c" />
    <script>(function(){try{var mode=localStorage.getItem("app:theme:v1")||"system";var dark=mode==="dark"||(mode==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=dark?"dark":"light";var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=dark?"#16171c":"#F7FAFF"}catch(e){}})()</script>
    <style>
      * { box-sizing: border-box; }
      :root { color-scheme: dark; --background: #16171c; --foreground: #f5f5f5; --muted: #b9bac2; --card: #23252c; --border: #454751; --primary: #b6ef55; --primary-foreground: #16171c; }
      :root[data-theme="light"] { color-scheme: light; --background: #F7FAFF; --foreground: #17243A; --muted: #64748B; --card: #fff; --border: #E3EBF5; --primary: #268BEB; --primary-foreground: #0F223B; --primary-hover: #1672CD; --primary-hover-foreground: #fff; }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: var(--background); color: var(--foreground); display: grid; place-items: center; min-height: 100dvh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: var(--muted); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: var(--primary); color: var(--primary-foreground); }
      .primary:hover { background: var(--primary-hover, var(--primary)); color: var(--primary-hover-foreground, var(--primary-foreground)); }
      .secondary { background: var(--card); color: var(--foreground); border-color: var(--border); }
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
