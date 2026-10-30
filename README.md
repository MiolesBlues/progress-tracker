# Прогресс Трекер

Дневник силовых тренировок на русском и английском с личной программой из **1–7 активных тренировочных дней**. Названия, упражнения, цели и порядок меняет пользователь. Upper/Lower — необязательный шаблон из четырёх дней, выбираемый при первоначальной настройке.

Запись содержит дату, рабочий вес, повторения каждого подхода, необязательные RIR и заметки. Незавершённый ввод хранится на устройстве отдельно для пользователя и упражнения. Стабильный UUID операции позволяет повторить сохранение после потери ответа. Полноценной offline-синхронизации нет: для входа, загрузки и отправки требуется сеть.

История сохраняется при архивировании и переносе упражнений. Аналитика сравнивает выбранную запись с предыдущей сессией и, независимо, с последней сессией предыдущей календарной недели. Графики показывают вес, суммарные повторения или объём за 7/30/90/365 дней либо всё время, исключая будущие даты. Изменение объёма не гарантирует рост силы.

В настройках можно отдельно разрешить полное удаление архивных объектов и показать архив в «Записях»; оба переключателя изначально выключены и привязаны к аккаунту на этом устройстве. Удаление дня сохраняет упражнения и историю, удаление упражнения удаляет его собственные записи. Перед включением удаления в реальной БД нужна отдельная SQL-миграция и проверка по [инструкции](docs/ARCHIVE-DELETION-RU.md).

Технологии: React 19, TypeScript, TanStack Start/Router/Query, Tailwind, Supabase/PostgreSQL с RLS. Интерфейс поддерживает русский и английский языки, светлую, тёмную и системную темы и рассчитан на мобильные экраны. Актуальная оценка релиза и ограничения: [RELEASE-READINESS-V3.md](RELEASE-READINESS-V3.md).

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
- [Жизненный цикл персональных данных и удаления аккаунта](docs/PHASE4-DATA-LIFECYCLE-RU.md) — текущая схема, read-only orphan preflight и предложенная политика, требующая продуктового решения.
- [Phase 5A: функциональная целостность и границы производительности](docs/PHASE5A-FUNCTIONAL-INTEGRITY-RU.md).

SQL-файлы `drizzle/migrations/0000…0004` — источник схемы. Перед применением нужны read-only preflight, просмотр старых нарушений, резервная копия и проверенная репетиция. `drizzle-kit push` использовать нельзя: `drizzle/schema.ts` и snapshots не описывают эту схему. Production-миграции требуют отдельного согласования; приложение с новым сохранением требует RPC из 0004 и не использует небезопасный fallback INSERT.

Локальный `.env` не хранится в Git; используйте `.env.example` как безопасный шаблон. Для remote Supabase задавайте одинаковые `SUPABASE_ENVIRONMENT` (server runtime) и `VITE_SUPABASE_ENVIRONMENT` (browser build-time), а также согласованные URL/ref. Runtime contract сверяет browser/server URL и project refs. Production ref запрещён для development всегда. Staging ref разрешён в `bun run dev` только с точным opt-in `ALLOW_STAGING_DEV=true`; без него запуск завершается ошибкой. Opt-in действует только для Vite dev server, не снимает проверки парных refs, известных project refs или защиты от production и не публикуется как `VITE_*`. Для локальной разработки со staging задайте значения текущей PowerShell-сессии:

```powershell
$env:SUPABASE_ENVIRONMENT = 'development'
$env:VITE_SUPABASE_ENVIRONMENT = 'development'
$env:SUPABASE_PROJECT_REF = 'fdzcwhzszbmpxyawrzzf'
$env:VITE_SUPABASE_PROJECT_REF = 'fdzcwhzszbmpxyawrzzf'
$env:SUPABASE_PROJECT_ID = 'fdzcwhzszbmpxyawrzzf'
$env:VITE_SUPABASE_PROJECT_ID = 'fdzcwhzszbmpxyawrzzf'
$env:SUPABASE_URL = 'https://fdzcwhzszbmpxyawrzzf.supabase.co'
$env:VITE_SUPABASE_URL = 'https://fdzcwhzszbmpxyawrzzf.supabase.co'
$env:ALLOW_STAGING_DEV = 'true'
bun run dev
```

Publishable keys остаются в `.env`; не добавляйте service-role или другие секреты в `VITE_*`. После работы удалите временный opt-in: `Remove-Item Env:ALLOW_STAGING_DEV`. Vite загружает `.env`, `.env.local`, затем mode-specific `.env.[mode]` и `.env.[mode].local`; значения из процесса ОС имеют наивысший приоритет. `bunfig.toml` отключает Bun auto-load, чтобы он не обходил приоритет Vite. Неизвестные env-значения, неизвестные hosted refs, несовпадения browser/server refs, HTTP remote URL и сторонние хосты отвергаются. В `supabase/config.toml` намеренно нет project ID, чтобы CLI не выбрал hosted project автоматически.

Проект связан с [Lovable](https://lovable.dev/projects/c7efcdd9-ad98-4274-8b6f-fd8abfebd574). Изменения связанной ветки синхронизируются с редактором; не переписывайте опубликованную историю. Merge, push и deploy выполняются только отдельным согласованным действием.
