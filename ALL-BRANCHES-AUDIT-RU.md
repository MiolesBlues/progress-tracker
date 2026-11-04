# Progress Tracker — полный аудит веток

Дата проверки: 2026-10-30
Тип проверки: read-only; код, refs и hosted infrastructure не изменялись. Создан только этот отчет.

## Вывод

Канонический кандидат содержит фазовую последовательность от Phase 1/2 до Track A как ancestry. Проверка исходников и локальных регрессионных артефактов подтверждает, что требуемые варианты logging, program management, V4 sets, idempotency, analytics, auth, environment guard, ACL/RLS, recovery, worker runtime, accessibility и RU/EN локализация представлены в текущем дереве и тестах. Старые ветки UI имеют отдельные старые commit histories, поэтому их функциональность не доказана только ancestry или `git cherry`; для решения использованы текущие реализации и тесты соответствующих сценариев.

Полная merge readiness **NO-GO** по двум конкретным причинам:

1. `fix/v2-release-hardening` расходится: локальная вершина `15b5945` имеет 4 commit, отсутствующих в GitHub-линии, а GitHub-вершина `5ba4f3d` имеет 9 обратных commit. Эти две истории не объединены. Проверенные функциональные результаты обеих сторон представлены в canonical более поздними реализациями, но remote-only код конфигурации backend и упрощения ProgramManager/pending operations конфликтуют с fail-closed env и retry контрактом. Требуется явное решение сохранить обе линии как superseded либо выполнить отдельное ручное закрытие ветки/PR; force push не является решением.
2. `integration/canonical-release-candidate` отсутствует среди GitHub refs. Это локальный кандидат, не включённый в `main`; `main` и текущий `origin/main` остаются на `2bddc62`.

Необъяснённых веток и недостижимых commit объектов не найдено. Ветка `feature/light-blue-palette` оставлена как намеренно исключённый визуальный вариант; остальные известные различия сопоставлены с текущими реализациями либо отмечены ниже как конфликт.

## Git состояние и инвентаризация refs

- Canonical branch: `integration/canonical-release-candidate`, HEAD `d084b38bbb4e19e78fa8a0b5a608b9b09aa840cb`.
- Рабочее дерево до создания этого отчёта было чистым; теперь единственное изменение — этот untracked audit report. `.env.local` ignored.
- GitHub проверен read-only через `git ls-remote --heads --tags https://github.com/MiolesBlues/progress-tracker.git`: **29 heads, 0 tags**.
- `refs/remotes/origin/*`: 29 веток, SHA полностью совпадают с текущими 29 GitHub heads. Ни одного stale/missing/different tracking ref.
- `refs/heads/*`: 30 локальных веток. 29 названий совпадают с GitHub; 28 tips совпадают. Исключения: локальная `integration/canonical-release-candidate` без remote-аналога и одноимённая `fix/v2-release-hardening`, чья локальная и remote вершины разошлись.
- `refs/remotes/recovery-20261030/*`: 29 preservation mirror refs; их tips совпадают с GitHub ref inventory на момент snapshot.
- `origin/HEAD` указывает на `origin/main`.
- `git worktree list --porcelain`: 13 worktree, привязанных к существующим branch refs; отдельных новых branch tips worktree не добавляют.
- Stash: один — `stash@{0}`, `pre-merge-user-work-2026-10-19`; сохранён.
- Reflogs проверены; они содержат переходы веток, обычные commit/checkout события и подготовительные записи `reset: moving to HEAD` без смены tip. Признаков переписывания commit истории не обнаружено; reflog записи сохранены.
- `git fsck --no-reflogs --unreachable`: **0 unreachable/dangling commits**; обнаружено 63 недостижимых blob/tree объектов. Они не являются ветками или commit историями и не удалялись.

### `main` и `origin/main`

`main` локально — `2bddc62fe82f6672a9ab1b15c671bc196911d90d`. Live GitHub `refs/heads/main` — тот же SHA; `origin/main` — тот же SHA. Это исходная main-линия, включающая merge `integration/clean-merge-20261019`, но она не содержит Phase 3–Track A. Canonical является потомком этой точки и дополнительно включает последующие фазы. `main` не изменялся.

## Матрица веток

Формат `ahead` — commit только в canonical; `unique` — commit только в указанной ветке, по `git rev-list canonical...branch`. `patch-eq` — число patch-equivalent commits (`git cherry` со знаком `-`); merge commits и контекстно изменённые/squashed изменения этим числом не отражаются. Для одинакового local/`origin/*` SHA указано `local + origin` одной строкой. Merge base сокращён до 7 символов.

| Ветка/ref                                              |       Tip | Merge base | Ahead / unique | Patch-eq | Релевантное содержимое и решение                                                                                                                                                                            | Классификация       |
| ------------------------------------------------------ | --------: | ---------: | -------------: | -------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `backup/main-pre-merge-20261019` + origin              | `c2d41ef` |  `c2d41ef` |         42 / 0 |        0 | Историческая исходная точка; все изменения из неё предшествуют канонической линии.                                                                                                                          | FULLY ACCOUNTED FOR |
| `feature/centered-day-dialog` + origin                 | `e746ab2` |  `c2d41ef` |        42 / 49 |        1 | Центрированный редактор дня и мобильные состояния покрыты текущим ProgramManager и `e2e/centered-day-dialog.spec.ts`.                                                                                       | SUPERSEDED          |
| `feature/centered-exercise-dialog` + origin            | `697bef1` |  `c2d41ef` |        42 / 52 |        2 | Редактор упражнения проверяется `e2e/centered-exercise-dialog.spec.ts`; текущие dialog компоненты уже прошли актуальный E2E.                                                                                | SUPERSEDED          |
| `feature/compact-record-sort` + origin                 | `9a86941` |  `c2d41ef` |        42 / 53 |        2 | Компактная сортировка сохранена и расширена server-side пагинацией/стабильным порядком; `e2e/compact-record-sort.spec.ts` и entries tests.                                                                  | SUPERSEDED          |
| `feature/compact-workout-logs` + origin                | `e6008ca` |  `c2d41ef` |        42 / 50 |        0 | Tip `e6008ca` — компактный дневник, заменивший более ранний accordion эксперимент. Текущая запись/история имеет release и workout flow E2E.                                                                 | SUPERSEDED          |
| `feature/light-blue-palette` + origin                  | `fba39fc` |  `c2d41ef` |        42 / 51 |        0 | Уникальный визуальный вариант затрагивает общие CSS и компоненты. Canonical оставляет проверенную палитру/контраст; вариант сохранён на ветке, не является data/security fix.                               | SUPERSEDED          |
| `feature/per-set-workout-v4` + origin                  | `42bbe30` |  `c2d41ef` |        42 / 70 |        3 | Per-set модель находится в `20261016204330_per_set_workout_v4.sql`; RPC, миграция, RLS, RIR, веса и retry проверяются SQL/PGlite. Старые UI-перестановки не переносятся поверх новых UUID/retry invariants. | SUPERSEDED          |
| `feature/system-theme` + origin                        | `f0b0ed0` |  `c2d41ef` |        42 / 50 |        0 | System/light/dark и pre-paint theme представлены в текущем theme коде; `e2e/theme.spec.ts` покрывает задержанный JS и предпочтение.                                                                         | SUPERSEDED          |
| `fix/analytics-and-release` + origin                   | `509a88d` |  `c2d41ef` |        42 / 27 |        0 | Старые analytics/auth/CI изменения заменены точными текущими Progress/Records реализациями, текущими auth tests и release contracts.                                                                        | SUPERSEDED          |
| `fix/dev-staging-opt-in` + origin                      | `db07b88` |  `db07b88` |          6 / 0 |        0 | Предок canonical; staging opt-in находится в текущей env contract, отдельная несовместимость тестового dotenv устранена в локальном кандидате.                                                              | FULLY ACCOUNTED FOR |
| `fix/pt-01-06-08-13` + origin                          | `2bddc62` |  `2bddc62` |         27 / 0 |        0 | Старый tip — предок canonical. Dirty worktree состояния не входят в branch ref и сохранены в workspace snapshot.                                                                                            | FULLY ACCOUNTED FOR |
| `fix/pt-02-04-integrity` + origin                      | `2bddc62` |  `2bddc62` |         27 / 0 |        0 | Tip совпадает с main; PT-02/03/04 подтверждены текущими workout save, pagination, draft и two-tab tests.                                                                                                    | FULLY ACCOUNTED FOR |
| `fix/security-and-program` + origin                    | `58b7271` |  `c2d41ef` |         42 / 3 |        0 | Account/cache изоляция и personal programs заменены session generation guards, idempotent program-create и account-switch tests.                                                                            | SUPERSEDED          |
| `fix/v2-build-and-e2e` + origin                        | `7fec95a` |  `c2d41ef` |        42 / 29 |        0 | Lock/toolchain и E2E quality gate присутствуют в текущем workflow и frozen-lock/toolchain checks.                                                                                                           | SUPERSEDED          |
| `fix/v2-data-integrity` + origin                       | `cd17afe` |  `c2d41ef` |        42 / 28 |        0 | Старые workout prefill/draft/ACL изменения заменены Phase 1–5 версиями и текущими regression tests.                                                                                                         | SUPERSEDED          |
| `fix/v2-release-hardening` **local**                   | `15b5945` |  `c2d41ef` |        42 / 48 |        0 | Четыре local-only commit (ниже) имеют соответствующие текущие безопасные реализации: архивное удаление, воспроизводимый build/i18n, a11y и template library. Сам tip не ancestor canonical.                 | SUPERSEDED          |
| `origin/fix/v2-release-hardening` **GitHub**           | `5ba4f3d` |  `c2d41ef` |        42 / 53 |        0 | Девять remote-only commits расходятся с local. Старые Vite backend constants и изменения ProgramManager/pending RPC несовместимы с текущими env/idempotency safeguards; не переносить автоматически.        | CONFLICTING         |
| `fix/workout-data-integrity` + origin                  | `85c3067` |  `c2d41ef` |         42 / 4 |        0 | Draft persistence и workout idempotency имеются в текущих `workout-draft`/`save-workout` и regression suite.                                                                                                | SUPERSEDED          |
| `integration/canonical-release-candidate` (local only) | `d084b38` |  `d084b38` |          0 / 0 |        0 | Сам проверяемый кандидат. Потомок `db07b88`; содержит удаление вложенной копии и локальные отчёты/изолированные тестовые env fixes. Нет GitHub ref с таким именем.                                          | FULLY ACCOUNTED FOR |
| `integration/clean-merge-20261019` + origin            | `274c7d2` |  `274c7d2` |         28 / 0 |        0 | Старая интеграция — предок main; theme/i18n и UI-поведение актуально покрыто поздними реализациями.                                                                                                         | FULLY ACCOUNTED FOR |
| `integration/final-main-merge-20261019` + origin       | `2bddc62` |  `2bddc62` |         27 / 0 |        0 | То же дерево, что main; последующие Phase 3–Track A не присутствуют на этой ветке, но присутствуют в canonical ancestry.                                                                                    | FULLY ACCOUNTED FOR |
| `integration/merge-all-branches-20261019` + origin     | `d7442f3` |  `c2d41ef` |        42 / 88 |        5 | Исторический merge per-set V4 и UI; V4 migration/контракт и UI-сценарии сверены с текущими файлами и тестами. Старое дерево содержит более ранние реализации.                                               | SUPERSEDED          |
| `integration/phase1-phase2-release` + origin           | `cb122e3` |  `cb122e3` |         24 / 0 |        0 | Предок canonical; фазовый release/environment contract сохранён.                                                                                                                                            | FULLY ACCOUNTED FOR |
| `integration/ui-updates` + origin                      | `9a1b13d` |  `c2d41ef` |        42 / 58 |        3 | Диалоги, theme, compact sorting и workout layout представлены текущим UI/E2E; старые компоненты не копируются поверх hardening fixes.                                                                       | SUPERSEDED          |
| `main` + `origin/main`                                 | `2bddc62` |  `2bddc62` |         27 / 0 |        0 | Локальный и live GitHub main совпадают. Защищённая исходная ветка, не содержит поздних фаз.                                                                                                                 | FULLY ACCOUNTED FOR |
| `phase3/runtime-ci-acceptance` + origin                | `96d8d7a` |  `96d8d7a` |         23 / 0 |        0 | Предок canonical; локальный Worker/Wrangler runtime contract сохранён.                                                                                                                                      | FULLY ACCOUNTED FOR |
| `phase4/product-hardening` + origin                    | `2978591` |  `2978591` |         19 / 0 |        0 | Предок canonical; mutation handling, Records pagination, theme startup, i18n, SSR и account lifecycle присутствуют.                                                                                         | FULLY ACCOUNTED FOR |
| `phase5a/functional-integrity` + origin                | `fecbef5` |  `fecbef5` |         14 / 0 |        0 | Предок canonical; program idempotency, account switch, localization, analytics regression tests сохранены.                                                                                                  | FULLY ACCOUNTED FOR |
| `phase5b/database-recovery` + origin                   | `cee802d` |  `cee802d` |         12 / 0 |        0 | Предок canonical; recovery/readiness контракт сохранён.                                                                                                                                                     | FULLY ACCOUNTED FOR |
| `phase5b1/recovery-acl-remediation` + origin           | `15cad66` |  `15cad66` |         10 / 0 |        0 | Предок canonical; least-privilege remediation, release guards и multi-owner ACL tests сохранены.                                                                                                            | FULLY ACCOUNTED FOR |
| `track-a/recovery-infrastructure` + origin             | `a98b069` |  `a98b069` |          8 / 0 |        0 | Предок canonical; synthetic recovery scripts и fail-closed checks сохранены.                                                                                                                                | FULLY ACCOUNTED FOR |

Для каждой из 29 GitHub веток локальный `origin/<branch>` SHA совпал с live GitHub. Строки с `+ origin` объединяют только refs с одинаковым именем **и одинаковым SHA**; исключение — две отдельные строки для разошедшихся local/remote `fix/v2-release-hardening`.

## Подробная сверка `fix/v2-release-hardening`

Merge base local и GitHub веток: `c2d41efa81921c3dc8f43618c912bb82f32a489a`. `git rev-list --left-right --count local...origin` даёт **4 local-only / 9 remote-only**. Ни один commit из двух списков не является ancestor другого. `git cherry` не обнаружил точных patch-equivalent commits между этими линиями; это не исключает ручное/squash перенесение файлов, поэтому выполнено сравнение по областям.

Local-only commits:

- `2e24e13` — archived deletion/save retries; текущая ветка содержит archive deletion migration/handler и archive-deletion DB/E2E regression coverage.
- `53c79d1` — reproducible build, i18n tests, dependency contract; текущие toolchain/quality gates и localization regressions покрывают эти области.
- `9598d28` — RU/EN accessibility, error pages, SSR; текущие accessibility/i18n/error-page/server tests присутствуют.
- `15b5945` — versioned training templates; текущие template catalog JSON, migration, `training-library.ts`, atomic application SQL tests и onboarding E2E присутствуют.

Remote-only commits: `884cb3b`, `fadb567`, `b5b3349`, `66cd2d5`, `a38df43`, `7fd66ae`, `33cf9cb`, `a541ec6`, `5ba4f3d`. По diff paths это изменение Vite backend selection, auth/program routes, `ProgramManager`/`pending-rpc`, документации и удаление старых generated Supabase types. Текущий Vite использует `loadEnv` + environment validation, не фиксирует target backend в коде; `ProgramManager` использует pending operation identity/idempotent create; тесты запрещают пересечение browser/server refs и покрывают retry. Автоматически применять remote line опасно и не требуется для функциональной полноты.

Ветка не удалялась и не переписывалась. Её остающееся расхождение является процессным конфликтом, который нужно явно закрыть в branch/PR governance до заявления о полном reconciliation.

## Семантический аудит canonical дерева

| Область                                  | Проверенное подтверждение в текущем дереве                                                                                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workout logging / set identity / retries | `src/components/workout-form.tsx`, `src/lib/save-workout.ts`, `src/lib/workout-draft.ts`; workout-flow/save tests и multi-tab E2E.                                                  |
| Program management / retry-safe creates  | `src/components/program-manager.tsx`, `src/lib/program-create.ts`; `e2e/program-create-idempotency.spec.ts`, program DB tests.                                                      |
| Per-set storage                          | V4 migration `drizzle/migrations/20261016204330_per_set_workout_v4.sql`, per-set SQL tests; поля веса/reps/RIR и порядок сохраняются.                                               |
| Records / Progress / history             | `src/lib/queries.ts`, `src/components/entries-page.tsx`, `progress-page.tsx`; pagination, deterministic sort и benchmark/unit coverage.                                             |
| Authentication / account isolation       | Supabase middleware/client/session; entries account-switch tests и account-scoped E2E.                                                                                              |
| Supabase environment                     | `src/integrations/supabase/env-contract.*`, `vite.config.ts`, release-contract tests; staging требует явного opt-in, production запрещён для dev, browser/server refs согласуются.  |
| Schema migrations / ACL / RLS            | 13 tracked migrations, schema capability contract, release preflight, PGlite tests для RLS, RPC, PUBLIC/browser/default ACL.                                                        |
| Recovery                                 | `scripts/recovery/*`, manifest/target verification, synthetic baseline и recovery contract tests. Это локальная/synthetic recovery; hosted restore не подтверждён данным Git audit. |
| Worker runtime                           | Cloudflare/Nitro build, `scripts/smoke-production-runtime.mjs`, Wrangler smoke evidence.                                                                                            |
| Accessibility / localization             | `src/lib/accessibility-colors.test.ts`, `accessibility-i18n` tests, E2E RU/EN для mobile layouts.                                                                                   |
| CI/CD                                    | `.github/workflows/quality.yml`, `.github/workflows/release-schema-preflight.yml`; workflow sources присутствуют в canonical tree.                                                  |

Это доказательство наличия текущих реализаций и тестовых контрактов, а не подтверждение hosted database rollout. Каноническая кодовая база не объявляется production-ready только на основании этого audit.

## Репозиторий, секреты и миграции

- Коммит `760252d` удалил из canonical tracked tree вложенную копию `progress-tracker-final-main-merge-20261019/` целиком (175 файлов). Проверка `git ls-tree -r HEAD` не находит вложенный snapshot, `.git` дерево, `pgdata`, `.dump`, `.backup` или `.tar` артефакты.
- Текущий tracked tree содержит `.env.example`, но не tracked `.env`. В `main` tree и ранней истории `.env` был tracked; найденный blob содержит только имена Supabase URL/project ref/publishable key переменных. Секретные значения не выводились. Проверка этого blob на высокодоверенные шаблоны service-role/`sb_secret`, private key, GitHub token, cloud key и credentials в Postgres URI совпадений не дала. Это ограниченная pattern-проверка, не полноценный secret scanner.
- `gitleaks` и `gh` CLI в этом окружении не найдены. Изменённый локальный `.env` старого `main` worktree не считывался и не включён в проверку содержимого; он остаётся вне canonical working tree и должен считаться приватной локальной конфигурацией.
- Текущий tree не содержит blob больше 1 MiB. Два каталога `pgdata` существуют только во внешних preservation/workspace копиях, не в canonical Git tree.
- В tracked migration list 13 SQL файлов; одна последовательная версия V4 и последующие library/helper ACL миграции присутствуют. Дублирующего `20261016204330_per_set_workout_v4.sql` в canonical дереве нет. Ветка в Git не подтверждает фактическое состояние hosted schema.
- Указатель GitHub `origin` всё ещё использует старое имя repo URL, которое перенаправляется на `MiolesBlues/progress-tracker`; live `ls-remote` прошёл и совпал с tracking refs. Remote config не менялся.

## Текущие тесты и CI evidence

Новые тесты во время audit не запускались, чтобы сохранить read-only характер и не создавать output в canonical worktree. Использована запись уже выполненного полного прогона на том же HEAD до создания этого документа:

- TypeScript, ESLint, Prettier — PASS.
- Vitest — 32 files / 312 tests PASS.
- SQL/PGlite — 63 tests PASS.
- Toolchain/release contract — 21 tests PASS.
- Local schema contract — PASS.
- Build с безопасной test конфигурацией — PASS.
- Client bundle secret scan — PASS, 40 файлов.
- Wrangler runtime smoke — PASS.
- Playwright Chromium/WebKit — 157 PASS, 5 существующих SKIP, 0 FAIL.
- `bun audit` — FAIL: 18 advisories (6 high, 11 moderate, 1 low); это отдельный release blocker.

GitHub read-only commit-status запросы для `db07b88`, `origin/main` и `origin/fix/v2-release-hardening` вернули пустые status arrays; PR-triggered workflow query для `db07b88` — пустой список. `gh` CLI отсутствует. Поэтому свежие GitHub Actions PASS runs в доступных источниках не подтверждены; тестовые числа выше — локальный запуск, а не hosted CI результат.

## Изменения в ходе аудита

Код, ветки, commit history, remotes, hosted инфраструктура и базы не изменялись. Создан только untracked документ `ALL-BRANCHES-AUDIT-RU.md`. Он не закоммичен, чтобы не менять Git history в read-only задаче.

## Решение

- **Полнота учета refs: PASS** — 30 local branches, 29 live GitHub branches, 29 matching `origin/*`, 29 recovery mirror refs, один stash, 0 tags, 0 unreachable commits; каждое имя/различие перечислено в матрице.
- **Функциональное покрытие canonical: PASS с ограничением** — рассмотренные функциональные изменения представлены актуальным кодом и regression suite; light-blue palette осознанно оставлена вариантом дизайна.
- **Branch reconciliation: NO-GO** — diverged `fix/v2-release-hardening` остаётся конфликтующей парой ref. Canonical candidate также ещё не опубликован и не является `main`.
- **Merge readiness: NO-GO** до явного решения по обеим v2 линиям, проверки актуального GitHub Actions evidence и отдельного release решения по dependency advisories. Ни одна ветка не скрыта или удалена.
