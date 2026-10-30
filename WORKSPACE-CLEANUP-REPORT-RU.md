# Progress Tracker — отчёт о консолидации рабочих каталогов

Дата: 2026-10-30

## Итог

Основным рабочим каталогом выбран `C:\Users\vitvl\Code\progress-tracker`. Это linked worktree общего Git-хранилища, а не отдельный clone. В нём находится каноническая интеграционная ветка. Девять чистых связанных worktree штатно перемещены Git в защищённый внешний архив. Файлы и ветки сохранены; каталоги не удалялись.

Консолидация выполнена частично и безопасно: остаются другие рабочие копии и 11 обычных папок с аудитами/локальными артефактами. Их содержимое и назначение не признаны избыточными, поэтому они оставлены на месте. Следовательно, условие «все ненужные копии архивированы» пока не подтверждено.

## Основная рабочая копия

| Свойство                                | Значение                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Каталог                                 | `C:\Users\vitvl\Code\progress-tracker`                                                                                                                 |
| Ветка                                   | `integration/canonical-release-candidate`                                                                                                              |
| HEAD до локальных изменений этого этапа | `8b63da5fc3c9680a64e163267ce341ac69b6dc87`                                                                                                             |
| Общее Git-хранилище                     | `C:\Users\vitvl\Code\project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574\.git`                                                                                |
| Origin                                  | настроен на прежний URL `MiolesBlues/project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574.git`, который перенаправляется на `MiolesBlues/progress-tracker.git` |
| Локальная конфигурация                  | `.env.local` игнорируется Git; выбран `development`, обе стороны указывают на staging ref, включён явный `ALLOW_STAGING_DEV=true`                      |
| Git status                              | чистый после локальных коммитов; `.env.local` остаётся ignored и не включён в Git                                                                      |

`.env.local` содержит только publishable ключи; service-role key не обнаружен. Секретные значения не выводились. Исторический tracked `.env` в старом `main` clone содержит непустые backend URL/ref и publishable key неизвестного legacy-проекта, но service-role key не обнаружен. Актуальность и состояние этого публичного ключа неизвестны; это не доказательство утечки привилегированного секрета. Старый файл не менялся. Владельцу следует отдельно установить, нужен ли этот legacy backend, и при необходимости отозвать/заменить публичный ключ.

## Инвентаризация и перемещения

До начала было зафиксировано 25 связанных каталогов: 12 Git worktree, 11 папок `workout-*` без Git metadata и 2 вложенные неизвестные папки. Основной каталог `progress-tracker` был создан/выбран отдельно, поэтому после его появления всего учтено 26 связанных каталогов. Новая primary-копия не заменяла существующую.

Перемещено штатной командой `git worktree move` в `C:\Users\vitvl\ProgressTracker-Recovery\archived-workspaces-20261030`:

| Архивный каталог                                                        | Ветка                              | HEAD                                       |
| ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| `progress-tracker-integration-phase1-phase2-release`                    | `fix/dev-staging-opt-in`           | `db07b889b55d42501872ae303fcb70bbb735c7d0` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-centered-day-dialog`      | `feature/centered-day-dialog`      | `e746ab2b57c27c9eefa9b52b85ccec9c35bf0d67` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-centered-exercise-dialog` | `feature/centered-exercise-dialog` | `697bef19c530039811915659460eb5fe9531e71c` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-clean-merge-20261019`     | `integration/clean-merge-20261019` | `274c7d27565a2504246427b9b74bce779146e3e3` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-compact-record-sort`      | `feature/compact-record-sort`      | `9a86941dec8d3b44785bfe2f570e361c9e207404` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-integration-ui-updates`   | `integration/ui-updates`           | `9a1b13d60356d606a8cfcdf96104725cc82dfc38` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-light-blue-palette`       | `feature/light-blue-palette`       | `fba39fc2bd2f724aa168c3b4e14ee8fc8c840ed6` |
| `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-per-set-workout-v4`       | `feature/per-set-workout-v4`       | `42bbe3009e942049437308ba905c259b5a579c01` |
| `worktree-compact-workout-logs`                                         | `feature/compact-workout-logs`     | `e6008ca5147577d179305a6f636fefab3d6331ab` |

До перемещения все девять были чистыми; проверка активных процессов и Windows Restart Manager не нашла использующих их процессов. Их 2 464 файла предварительно совпали со snapshot по SHA-256. После `git worktree move` заново сверены ветка, HEAD, чистый статус и SHA файлов; расхождений файлов не было. Изменился только Git pointer, который Git корректно обновил как часть штатного перемещения. Удалений не было.

## Оставшиеся каталоги

### Активные Git worktree под `C:\Users\vitvl\Code`

- `progress-tracker` — основная чистая копия после коммитов этого этапа.
- `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574` — старый clone на `main`, HEAD `2bddc62`; сохранены незакоммиченный `M .env` и untracked вложенный каталог. Не изменялся.
- `progress-tracker-final-main-merge-20261019` — ветка `fix/pt-01-06-08-13`, HEAD `2bddc62`; содержит staged/unstaged/untracked работу. Оставлен без изменений.
- `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574-system-theme` — ветка `feature/system-theme`, HEAD `f0b0ed0`; содержит untracked вложенную папку, происхождение не установлено. Оставлен без изменений.

`git worktree list` после консолидации показывает 13 worktree: четыре в `Code` и девять во внешнем архиве. Git сообщает 30 локальных веток. Ссылки веток не удалялись.

### Папки `workout-*` без Git metadata

Оставлены на прежнем месте: `workout-audit-2026-10-12`, `workout-audit-v2-2026-10-15`, `workout-audit-v3-2026-10-15`, `workout-release-acceptance-20261016`, `workout-security-2026-10-13`, `workout-stage2-2026-10-16`, `workout-stage3-2026-10-16`, `workout-template-validation`, `workout-v2-stage1-2026-10-15`, `workout-v2-stage2-2026-10-15`, `workout-v2-stage3-2026-10-15`. Snapshot сохранил их содержимое. В `workout-audit-v3-2026-10-15` и `workout-v2-stage3-2026-10-15` есть `pgdata`; каталоги с PostgreSQL data files не перемещались. Назначение/уникальность остальных артефактов не доказывает, что они дублирующие.

Две вложенные неизвестные папки также оставлены на месте. Не-Git каталоги остаются кандидатами на отдельную классификацию, а не объявляются лишними.

## Snapshot и защита данных

Использован `C:\Users\vitvl\ProgressTracker-Recovery\snapshot-20261030`. Актуальный `PRESERVATION-MANIFEST.json` и его sidecar checksum проверены; отчет snapshot показывает 339 052 из 339 052 записей сверены, 0 hash failures. Git bundle проверен как полный и содержит 72 refs. Это подтверждает локальное сохранение файлов и Git истории, но не является backup hosted Supabase.

В snapshot находится более ранний `manifest-metadata-final.json` с промежуточными числами 339 019 / 338 421 / 598 failures и исключением `.wrangler`. Он предшествует актуальному manifest и не совпадает с итоговым отчетом. Не удалялся; при дальнейших проверках источником истины служат актуальные `PRESERVATION-MANIFEST.json`, `manifest-hash-summary.json` и `PRESERVATION-REPORT-RU.md`.

На корне recovery-каталога ACL ограничивает доступ учетной записью владельца и SYSTEM. Шифрование диска не подтверждено. Snapshot не является off-device backup. Секреты в отчете не приводятся.

## Проверки

### Основная копия и приложение

- `bun install --frozen-lockfile` — PASS, 579 установленных пакетов / 717 проверено, изменения lockfile отсутствуют.
- `bun run typecheck` — PASS.
- `bun run lint` — PASS.
- `bun run format:check` — PASS.
- `bun run test` — PASS, 32 файла / 312 тестов.
- `bun run test:db` — PASS, 63 SQL/PGlite теста.
- `bun run test:toolchain` — PASS, 21 тест.
- `bun run preflight:schema-contract` — PASS, локальный контракт library/V4/ACL.
- `bun run build` — PASS с явными безопасными test-only Supabase значениями.
- `bun run check:client-bundle` — PASS, проверено 40 файлов.
- `bun run smoke:runtime` — PASS локально: `/`, `/auth`, manifest через Wrangler runtime; hosted deployment не выполнялся.
- `bun run test:e2e` — PASS: 157 passed, 5 skipped, 0 failed, Chromium и WebKit, 19.8 минуты. Пропуски — существующие Playwright skip-условия.
- `bun audit` — FAIL: 18 advisories (6 high, 11 moderate, 1 low); это ранее установленный release blocker, не результат консолидации.

Два тестовых исправления потребовались, потому что новый локальный `.env.local` законно содержит staging-настройки: release contract теперь задаёт opt-in `false` для сценария «без opt-in», а Playwright явно изолирует test env. Vite env helper уважает явно переданные пустые значения, чтобы `.env.local` не мог вернуть удалённую из тестового процесса настройку. Это не меняет локальный `.env.local` и не меняет hosted конфигурацию.

### Безопасный локальный запуск

В PowerShell из primary каталога (значения уже заданы в ignored `.env.local`):

```powershell
Set-Location 'C:\Users\vitvl\Code\progress-tracker'
$env:ALLOW_STAGING_DEV = 'true'
$env:SUPABASE_ENVIRONMENT = 'development'
$env:VITE_SUPABASE_ENVIRONMENT = 'development'
bun run dev -- --host 127.0.0.1
```

Проверка staging ref в browser/server конфигурации и schema preflight остаются включёнными. Реальный локальный Vite стартовал, `GET /` вернул HTTP 200. Запросов на запись к базе не выполнялось; E2E использовал `.invalid` и локальные моки.

## Git-коммиты этого этапа

В primary worktree локально созданы коммиты:

- `test: isolate environment contract checks from local dotenv` — защита тестового окружения от локального dotenv.
- `docs: record safe workspace consolidation` — этот отчет.

Точные SHA коммитов указаны в итоговом Git состоянии. Push, merge и deployment не выполнялись. Настроенный origin использует URL с прежним именем репозитория, которое перенаправляется на актуальный GitHub URL; конфигурацию общего clone не меняли.

## Обратимость

Каждый из девяти worktree можно штатно вернуть в исходный каталог, только если исходный destination свободен:

```powershell
$repo = 'C:\Users\vitvl\Code\project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574'
$archive = 'C:\Users\vitvl\ProgressTracker-Recovery\archived-workspaces-20261030'
git -C $repo worktree move "$archive\<worktree-name>" 'C:\Users\vitvl\Code\<original-worktree-name>'
```

Перед каждой командой проверьте, что путь назначения отсутствует, Git worktree чист и архивная копия соответствует manifest. Не использовать `--force`; архив не удалять. Для возврата основной рабочей копии сначала создать отдельную ветку/план и убедиться, что `.env.local` сохранён вне Git; не подменять staging/production конфигурацию автоматически.

## Оставшиеся действия

1. Сохранить этот отчет вместе с локальным commit.
2. Отдельно классифицировать 11 `workout-*` папок и две вложенные неизвестные папки; до этого не перемещать их.
3. Оставить старый clone и dirty worktrees нетронутыми, пока не проверены их локальные изменения и `.env`.
4. Рассмотреть устранение 18 dependency advisories до release.
5. При необходимости отдельно сверить/переименовать origin URL — он общий для linked worktrees.

Hosted Supabase, staging и production не изменялись. Данных из hosted базы не экспортировали.
