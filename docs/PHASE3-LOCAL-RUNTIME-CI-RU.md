# Phase 3 — локальный runtime и CI

Ветка `phase3/runtime-ci-acceptance` добавляет проверку production-артефакта
перед браузерной регрессией. CI запускает сборку, сканирование публичного
bundle, `bun run smoke:runtime`, затем Chromium/WebKit E2E. Push в `phase3/**`
тоже запускает quality workflow; лимит job увеличен до 30 минут, чтобы полный
браузерный набор не обрывался по прежнему 20-минутному таймауту.

После `bun run build` используйте `bun run preview` для локального запуска
Cloudflare Worker output через закреплённый Wrangler. `bun run smoke:runtime`
автоматически поднимает тот же локальный runtime и проверяет HTML для `/` и
`/auth`, а также web manifest. В smoke-процессе заданы тестовые `.invalid`
Supabase URL и пустой service-role key; он не обращается к hosted Supabase.

Дата Cloudflare compatibility закреплена на `2026-10-19`, последнем дне,
поддерживаемом закреплённым Wrangler 4.151.1 в этой проверке. Меняйте её вместе
с версией Wrangler после локальной проверки нового workerd runtime.

Проверка не подтверждает GitHub-hosted Actions, JWT/RLS, staging или production.
Hosted acceptance остаётся заблокированной до получения проверенных учётных
данных и отдельного разрешения.
