export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Не удалось загрузить страницу — Прогресс Трекер</title>
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
      <h1>Не удалось загрузить страницу</h1>
      <p>Повторите загрузку или вернитесь на главную. Сохранённые тренировки останутся в вашем аккаунте.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Повторить</button>
        <a class="secondary" href="/">На главную</a>
      </div>
    </div>
  </body>
</html>`;
}
