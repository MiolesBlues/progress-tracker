# Настройка GitHub CI и финализация репозитория

Дата проверки: 30.10.2026

## 1. Состояние Git

Рабочий каталог: `C:\Users\vitvl\Code\progress-tracker`.

Исходное проверенное состояние: ветка `security/dependency-remediation`, HEAD `e788319ae2b4bbdaf9b19fed09fc05d0888524a7`. Перед изменениями сохранены четыре untracked отчёта; текущий внешний preservation snapshot и его sidecar manifest прошли проверку SHA-256 (`4aa9efe5f900bdba2756203446ba991f36f6a1499fb5ace92f086091a112fac6`, 339,052 из 339,052 объектов, 0 ошибок согласно манифесту).

Origin был настроен на прежний URL проекта-плейсхолдера. Локальная конфигурация исправлена на `https://github.com/MiolesBlues/progress-tracker.git`; прежнее значение приведено здесь для аудита и намеренно не повторяется. Проверка актуального GitHub `main` до работы подтвердила `2bddc62fe82f6672a9ab1b15c671bc196911d90d`.

Создана ветка `ci/github-actions-setup` от проверенного candidate. Локальные commits:

- `b80651a` — сохранены четыре branch/merge отчёта после проверки на распространённые секреты и форматирования.
- `586a9d5` — добавлен безопасный GitHub Actions workflow.
- `d25bda5` — добавлены проверки контракта CI.
- `203794a` — trigger push ограничен ветками.

Полный HEAD реализации workflow: `203794a0806c6170a9bb4b7d4a8dc6e8a5f9d369`. Последующие commits обновили только отчёт: `5a9863f` зафиксировал создание PR и hosted результат, `03a8d55` уточнил причину блокировки. На момент заключительной локальной проверки HEAD ветки и `origin/ci/github-actions-setup` совпадал: `03a8d5554bf895e8c762883a50fca1fb0697450a`; рабочее дерево чистое.

В tracked дереве не обнаружены `.env`, дампы базы или вложенный snapshot проекта. Локальный `.env.local` остаётся вне Git; его значения не читались. Новые отчёты прошли целевой поиск распространённых маркеров секретов (совпадений не найдено); это проверка формата, а не универсальное доказательство отсутствия всех типов чувствительных данных.

## 2. Причина прежнего startup_failure

GitHub Actions ранее создал workflow run `41070069701` для `main` на SHA `2bddc62fe82f6672a9ab1b15c671bc196911d90d`; страница: https://github.com/MiolesBlues/progress-tracker/actions/runs/41070069701. Доступный API показал `startup_failure`, путь workflow `BuildFailed` и пустой список jobs. Следовательно, workflow не дошёл до создания job. Доказательств, позволяющих установить точную причину, доступные данные не дают.

Чтение endpoint-ов настроек Actions/runners и webhook/deployment недоступно в текущем подключении. Ошибку нельзя обоснованно приписать YAML, billing, политике Actions или runner pool. Владелец должен проверить Repository Settings → Actions → General, организационные ограничения, доступность GitHub-hosted runners/квоты и детали указанного run, затем повторить запуск.

## 3. Workflow

Добавлен `.github/workflows/quality.yml`:

- события: pull request в `main`, push в ветки, ручной `workflow_dispatch`;
- `permissions: contents: read`, runner `ubuntu-24.04`;
- Node `24.14.0`, Bun `1.4.3`; Actions закреплены полными commit SHA с версиями в комментариях;
- кэшируется только Bun install cache с ключом от lockfile; кэш не записывается для PR;
- независимые jobs качества/сборки и браузерного E2E;
- E2E устанавливает Playwright Chromium и WebKit и загружает отчёты при ошибке;
- до тестов проверяются запрещённые локальные env-файлы и артефакты данных.

Среда workflow задаёт только синтетические `.invalid` адреса и тестовые значения; Supabase project refs/service role, RELEASE_DATABASE_URL и staging opt-in пусты/выключены. Локальный schema capability preflight не подключается к hosted среде. Workflow не запускает миграции, seed, hosted preflight, Wrangler deploy, публикацию или Cloudflare release.

Добавлено 5 тестов контракта workflow в `scripts/ci-workflow.test.mjs`, подключённых к `test:toolchain` (итого 26 тестов).

## 4. Локальная проверка

Полная проверка выполнена в отдельном чистом detached worktree без `.env.local`, на предшествующем commit `d25bda5`; финальный commit `203794a` меняет только ограничение push-trigger и соответствующий контрактный тест, который повторно прошёл на финальном HEAD.

| Команда/проверка                    | Результат                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `bun run check:dependencies`        | PASS                                                                                               |
| `bun install --frozen-lockfile`     | PASS, 572 пакета                                                                                   |
| `bun audit`                         | PASS, 0 advisory, 649 пакетов проверено                                                            |
| `bun run typecheck`                 | PASS                                                                                               |
| `bun run lint`                      | PASS                                                                                               |
| `bun run format:check`              | PASS                                                                                               |
| `bun run test`                      | PASS, 32 файла / 312 тестов                                                                        |
| `bun run test:db`                   | PASS, 63 теста                                                                                     |
| `bun run test:toolchain`            | PASS, 26 тестов                                                                                    |
| `bun run preflight:schema-contract` | PASS, локальный контракт                                                                           |
| `bun run build`                     | PASS, только с тестовыми `.invalid` значениями                                                     |
| `bun run check:client-bundle`       | PASS, 40 файлов                                                                                    |
| `bun run smoke:runtime`             | PASS, `/`, `/auth`, manifest                                                                       |
| `bun run test:e2e`                  | PASS, 157 passed / 5 skipped, Chromium и WebKit                                                    |
| Prettier workflow YAML              | PASS                                                                                               |
| `actionlint`                        | SKIPPED: не установлен; workflow проверен YAML parser-ом Prettier и тестами структуры/безопасности |

Все обязательные E2E запуски были выполнены против локального mock backend; 5 существующих условных skip сохранились, ошибок нет. Значения окружения были тестовыми; hosted Supabase не использовался.

## 5. Hosted GitHub CI

Ветка отправлена в origin без force push. Открыт черновой PR [#1](https://github.com/MiolesBlues/progress-tracker/pull/1) из `ci/github-actions-setup` в `main`; автоматического merge не было. GitHub подтвердил base SHA `2bddc62fe82f6672a9ab1b15c671bc196911d90d` и head SHA на момент открытия `5a9863fbb01375728c4dba21583008c6600f9cc9`.\n\nДля этого head GitHub создал run [41135368845](https://github.com/MiolesBlues/progress-tracker/actions/runs/41135368845), завершившийся `startup_failure`; список jobs пуст. PR diagnostics также возвращают `checks: []`, `statuses: []`, `jobs: []`. Hosted CI: **FAIL/BLOCKED**, обязательные jobs фактически не исполнились, поэтому локальные результаты не являются hosted CI PASS. Запуск на исходном `main` SHA ранее имел такой же результат. Доступных данных недостаточно, чтобы точно установить причину. Повторная проверка PR diagnostics на финальном SHA `03a8d5554bf895e8c762883a50fca1fb0697450a` вернула пустые `checks/statuses/jobs`; для него подтверждённого hosted PASS нет.

## 6. Внешний deployment и merge gate

В репозитории не обнаружено workflow публикации; найденный старый workflow был только Build. Lovable connector показывает проект неопубликованным, но не раскрывает привязанные ветки и интеграционные триггеры. GitHub webhook/deployment endpoints и настройки Cloudflare в текущем доступе не проверены. Поэтому внешние триггеры Lovable/Cloudflare: **NOT VERIFIED**.

**Main merge: BLOCKED** до подтверждённого hosted CI, настройки required checks и проверки внешних триггеров публикации. **Production deployment: NO-GO**; для него отдельно требуются database release approval, проверенное восстановление и V4 rehearsal.

## 7. Оставшиеся действия

1. Отправить только `ci/github-actions-setup` и проверить фактические GitHub Actions runs.
2. Если run снова завершится `startup_failure`, проверить настройки Actions и runner/billing/org policies у владельца; точная исходная причина пока неизвестна.
3. Проверить Lovable branch sync и Cloudflare deployment triggers в их панели.
4. После успешного hosted CI и подтверждения deployment safety повторить merge rehearsal с актуальным `origin/main`; затем подготовить PR в `main`. Не выполнять merge или production deployment в рамках этого этапа.
