# Прогресс Тренер

Русскоязычный дневник силовых тренировок с личной программой из **1–7 активных тренировочных дней**. Названия, упражнения, цели и порядок меняет пользователь. Upper/Lower — необязательный шаблон из четырёх дней, выбираемый при первоначальной настройке.

Запись содержит дату, рабочий вес, повторения каждого подхода, необязательные RIR и заметки. Незавершённый ввод хранится на устройстве отдельно для пользователя и упражнения. Стабильный UUID операции позволяет повторить сохранение после потери ответа. Полноценной offline-синхронизации нет: для входа, загрузки и отправки требуется сеть.

История сохраняется при архивировании и переносе упражнений. Аналитика сравнивает выбранную запись с предыдущей сессией и, независимо, с последней сессией предыдущей календарной недели. Графики показывают вес, суммарные повторения или объём за 7/30/90/365 дней либо всё время, исключая будущие даты. Изменение объёма не гарантирует рост силы.

Технологии: React 19, TypeScript, TanStack Start/Router/Query, Tailwind, Supabase/PostgreSQL с RLS. Интерфейс тёмный, рассчитан на мобильные экраны. Итоговая оценка релиза и ограничения: [RELEASE-READINESS.md](RELEASE-READINESS.md).

## Локальная разработка

Node.js 24 и **Bun 1.4.3** (нужен для адресного override в lockfile v3):

```sh
bun install --frozen-lockfile --ignore-scripts
bun run dev
```

Клиенту нужны `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` тестового проекта. Secret/service-role ключи нельзя помещать в `VITE_*`, браузер или Git. SSR может использовать серверные `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` того же backend. Для браузерных тестов конфигурация автоматически подставляет фиктивный URL; реальные базы не используются.

## Проверки

```sh
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run test:db
bun run test:toolchain
bun run build
bun run audit
bunx --no-install playwright install chromium webkit
bun run test:e2e
```

В PowerShell при запрете `npm.ps1` доступны `npm.cmd run ...` и `npm.cmd exec --yes --package=bun@1.4.3 -- bun ...`. Для установки используйте Bun 1.4.3 и committed lockfile; `npm install` не воспроизводит его. SQL-тесты используют PostgreSQL/PGlite в памяти. Playwright исполняет реальный UI с подменённым Auth/HTTP; это проверка интерфейса, а не реальных JWT/RLS. Все проверки включены в [.github/workflows/quality.yml](.github/workflows/quality.yml); workflow не развёртывает приложение и не применяет миграции.

Форматирование — Prettier, окончания строк LF через `.gitattributes`. Генерируемые файлы и отдельный вложенный проект исключены из форматирования/линтера.

## Программа, БД и выпуск

- [Модель данных и аналитики](docs/PROGRAM-AND-DATABASE-RU.md).
- [Разбор advisories и обновлений](docs/DEPENDENCIES-RU.md).
- [E2E-приёмка двух пользователей на staging](docs/E2E-RELEASE-RU.md).
- [Исправления V2: данные](V2-DATA-INTEGRITY-RU.md), [сборка и E2E](V2-BUILD-AND-E2E-RU.md).
- [Итоговая готовность V2](RELEASE-READINESS-V2.md), [план настоящей staging-приёмки](docs/STAGING-V2-RU.md).
- [Первый этап A01–A03](SECURITY-FIXES-RU.md), [второй этап](WORKOUT-DATA-INTEGRITY-RU.md).

SQL-файлы `drizzle/migrations/0000…0004` — источник схемы. Перед применением нужны read-only preflight, просмотр старых нарушений, резервная копия и проверенная репетиция. `drizzle-kit push` использовать нельзя: `drizzle/schema.ts` и snapshots не описывают эту схему. Production-миграции требуют отдельного согласования; приложение с новым сохранением требует RPC из 0004 и не использует небезопасный fallback INSERT.

Проект связан с [Lovable](https://lovable.dev/projects/c7efcdd9-ad98-4274-8b6f-fd8abfebd574). Изменения связанной ветки синхронизируются с редактором; не переписывайте опубликованную историю. Merge, push и deploy выполняются только отдельным согласованным действием.
