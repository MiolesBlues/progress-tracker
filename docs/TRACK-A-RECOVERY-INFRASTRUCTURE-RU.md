# Track A — инфраструктура восстановления

Дата проверки: 2026-10-20. Все локальные результаты ниже получены на синтетических данных. Они не подтверждают восстановление production.

## Локальные инструменты

- Windows PowerShell 7.6.5; Bun 1.4.3; Node.js 24.14.
- PostgreSQL 17.11 client/server tools извлечены из официального EDB Windows binary ZIP; bin path: `%LOCALAPPDATA%\ProgressTracker\track-a-recovery\pgsql17\pgsql\bin`. `psql`, `pg_dump`, `pg_restore`, `pg_ctl`, `postgres` — 17.11. SHA-256 архива: `80379B2C04D51C30225532E0AE04509899141E9957ED096FE749D7FD9DF8F82F`; хэш сверялся с опубликованным EDB значением. Бинарники в ZIP отдельно не подписаны Authenticode.
- Официальный установщик EDB с действительной подписью был проверен; попытка `--extract-only` не создала комплект инструментов. Установщик не запускал системную установку и не создавал службу.
- PostgreSQL 18.6 уже установлен отдельной службой Windows `postgresql-x64-18`; он не использовался и не изменялся. Docker, WSL и Supabase CLI не обнаружены.
- На C: перед локальным прогоном было около 147 GiB свободного места. Автоматизация теперь требует не менее 1 GiB и отказывает при занятости фиксированного порта.

EDB описывает официальный Windows installer и ZIP-архивы в [руководстве PostgreSQL для Windows](https://www.postgresql.org/download/windows/) и [странице бинарных загрузок EDB](https://www.enterprisedb.com/download-postgresql-binaries). Применённый архив и его опубликованный хэш: [EDB installer issue #731](https://github.com/EnterpriseDB/edb-installers/issues/731).

## Изолированный синтетический restore

Выполнен скриптом `scripts/recovery/Invoke-SyntheticRecovery.ps1`, целевой каталог `%LOCALAPPDATA%\ProgressTracker\track-a-recovery\synthetic-track-a-10`.

- PostgreSQL 17.11, system identifier `7698847078948223796`, адрес `127.0.0.1:55432`; целевая БД `pt_synthetic_restore`, исходная синтетическая БД `pt_synthetic_source`.
- До создания цели проверяются уникальность каталога, свободный loopback-порт и явная строка подтверждения. Кластер слушает только loopback; локальный пароль случайный, хранится в ACL-ограниченном `pgpass` и не попадает в отчёт.
- Использованы фальшивые владельцы UUID `11111111-1111-4111-8111-111111111111` и `22222222-2222-4222-8222-222222222222`, тестовые тренировки, локальные миграции репозитория и отдельные `pg_dump` custom-format артефакты public schema, public data и минимальной auth-зависимости.
- Фактическая сверка до/после restore: число строк и MD5 полного набора legacy workout entries совпали. Fingerprint не раскрывает строки и служит локальной сверкой только этого fixture.
- Затем на восстановленной синтетической копии выполнены ACL-миграции и V4. Результат: 3 entries, 3 operations, 6 sets, 3 snapshots, 1 operation tombstone, 0 set tombstones до теста; 5 RPC V4; структура/владельцы/RLS/FK/index/search_path/ACL проверки прошли. Синтетический tombstone retry был отклонён, числа entries и operations сохранились `3|3`.
- Проверка RLS вернула пользователям 5 и 1 принадлежащих им sets соответственно.
- Manifest SHA-256: `ab4b02ba24be981fce82f3ee45d79d538698f84729b5f45c0bc8e89f329edfdc`. Машиночитаемый отчёт: `%LOCALAPPDATA%\ProgressTracker\track-a-recovery\synthetic-track-a-10\report.json`; подробный вывод — рядом в `logs\synthetic-recovery.log`.
- Экземпляр оставлен запущенным только на loopback для повторного осмотра. Остановка: `Stop-SyntheticRecovery.ps1 -TargetId synthetic-track-a-10 -ConfirmStop STOP_SYNTHETIC_TRACK_A_TARGET`. Удаление не выполнялось; для предварительного просмотра предусмотрен `Remove-SyntheticRecovery.ps1 -WhatIf` и дополнительные явные подтверждения.

Это доказывает работоспособность локального synthetic dump/restore и локальных migration assertions; это **не** production backup, production restore или production-baseline rehearsal.

## Hosted backup и Supabase coverage

Авторизованный production backup артефакт и подтверждённая безопасная цель для его хранения/восстановления в этой задаче недоступны. Экспорт реальных данных не предпринимался. Production project ref `szdmzvsenrnjxgjgregf` и staging ref `fdzcwhzszbmpxyawrzzf` не использовались как restore destinations и не изменялись. Поэтому:

- Production backup acquisition: **BLOCKED** — нужен одобренный оператором экспорт и защищённое хранилище.
- Restore production baseline: **BLOCKED** — нет допустимого артефакта и изолированной Supabase-совместимой цели.
- PT-01 production-baseline V4 rehearsal: **BLOCKED**. Выполненная V4 проверка относится только к синтетической копии.
- PT-08: локальные ACL assertions на synthetic PG17 прошли для проверенных объектов и application owners. Нельзя смоделировать полномочия/дефолты managed `supabase_admin` достоверно без Supabase окружения; не impersonate-или эту роль.
- PT-13 canonical hosted preflight не выполнялся: нет одобренного least-privilege URL для запуска в этой задаче. Предыдущая read-only инвентаризация и контракт не заменяют текущий hosted preflight.

Обычный PostgreSQL кластер не воспроизводит платформенные компоненты Supabase. В synthetic fixture нет managed auth/storage сервисов, Storage object bytes, OAuth/provider config, project secrets, managed role defaults, publication/replication settings и платформенных расширений. `auth.users` здесь — только минимальная таблица для теста RLS; это не восстановление Auth.

Документация Supabase отдельно описывает покрытие [автоматических backup](https://supabase.com/docs/guides/platform/backups) и ограничения [backup/restore при миграции проекта](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Их необходимо учитывать при операторском плане полного восстановления.

Когда владелец данных разрешит экспорт, даст проверенный TLS CA bundle и выделит защищённую папку вне репозитория, оператор может выполнить supplemental PostgreSQL dump из интерактивной PowerShell-сессии. `Read-Host` запросит только несекретное имя пользователя; `pg_dump -W` запросит пароль без передачи в аргументах процесса. URL/пароль не сохранять в истории. Каталог должен быть на одобренном шифруемом носителе с установленным retention.

```powershell
$pgBin = Join-Path $env:LOCALAPPDATA 'ProgressTracker\track-a-recovery\pgsql17\pgsql\bin'
$backupDir = 'D:\APPROVED_ENCRYPTED_BACKUP\progress-tracker'
$caFile = 'D:\APPROVED_CERTS\supabase-root.crt'
$dbUser = Read-Host 'Approved database username'
if (-not (Test-Path -LiteralPath $backupDir -PathType Container)) { throw 'Approved backup directory is missing' }
if (-not (Test-Path -LiteralPath $caFile -PathType Leaf)) { throw 'Verified CA bundle is missing' }
$dsn = "host=db.szdmzvsenrnjxgjgregf.supabase.co port=5432 dbname=postgres user=$dbUser sslmode=verify-full sslrootcert=$caFile"
$dump = Join-Path $backupDir 'progress-tracker-production.custom.dump'
& (Join-Path $pgBin 'pg_dump.exe') --password --format=custom --no-owner --no-privileges --verbose --file $dump --dbname $dsn
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed; quarantine partial artifact and investigate before retrying' }
Get-FileHash -Algorithm SHA256 -LiteralPath $dump
```

Это только production database export, не full Supabase DR backup. До выполнения требуются явное письменное разрешение на персональные данные, отдельный подтверждённый backup account, CA/hostname validation, проверенная ёмкость/шифрование/retention хранилища и план очистки. `--no-owner --no-privileges` исключает global roles/ACL и требует отдельно сверять владельцев и grants; такая выгрузка без последующего восстановления и тестов не считается подтверждённым backup.

## Безопасный порядок operator recovery

1. Получить разрешение на экспорт production и выделить защищённое хранилище с ограниченным доступом, шифрованием и retention; не помещать дампы в Git или общий рабочий каталог.
2. Экспортировать из проверенного project ref с least-privilege процедурой, сохранить manifest/checksum и отдельно описать Auth/Storage/config/secrets coverage.
3. Создать/одобрить отдельную пустую disposable Supabase-совместимую цель и записать её immutable identity. Не использовать production, staging или legacy ref.
4. До восстановления выполнить проверку manifest/hash и destination identity; остановиться при любом несоответствии.
5. Восстановить и сверить schema, строки, constraints, RLS, grants, RPC, legacy workouts, operation ledger и tombstones. Только затем повторить V4 и ACL rehearsal.
6. Согласовать отдельное окно и approvals до любых hosted изменений. Этот документ сам по себе не даёт разрешения на экспорт или hosted mutation.

## Состояние готовности

- Локальный tooling/synthetic recovery: **PASS**.
- Локальная synthetic V4 и ACL rehearsal: **PASS**, ограниченная перечисленными компонентами.
- Production recoverability и production-baseline rehearsal: **NO-GO / BLOCKED** до предоставления разрешённого backup и изолированной цели.
- В ходе Track A hosted БД не менялись; deployment и remote migration не запускались.

## Проверки Track A

Свежие локальные результаты этой ветки:

| Проверка                                                                                   | Результат                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                                            | PASS — 579 installs, lockfile без изменений                                                                                                                                                                           |
| `bun run typecheck`                                                                        | PASS                                                                                                                                                                                                                  |
| `bun run lint`                                                                             | PASS                                                                                                                                                                                                                  |
| `bun run format:check`                                                                     | PASS                                                                                                                                                                                                                  |
| `bun run test`                                                                             | PASS — 32 файла, 304 теста                                                                                                                                                                                            |
| `bun run test:db`                                                                          | PASS — 63 теста, включая PGlite ACL, V4, tombstone, retry и RLS                                                                                                                                                       |
| `bun run test:toolchain`                                                                   | PASS — 20 тестов, включая recovery guard assertions                                                                                                                                                                   |
| `bun run preflight:schema-contract`                                                        | PASS — локальный контракт; hosted schema preflight не запускался                                                                                                                                                      |
| `bun run check:dependencies`                                                               | PASS                                                                                                                                                                                                                  |
| `bun run build` с явно заданными фиктивными `*.invalid` URL и test-only ключами            | PASS — Cloudflare Worker bundle создан                                                                                                                                                                                |
| `bun run check:client-bundle`                                                              | PASS — 40 public-файлов, секреты не найдены                                                                                                                                                                           |
| `bun run smoke:runtime`                                                                    | PASS — `/`, `/auth`, `manifest` через локальный Wrangler                                                                                                                                                              |
| `bun run test:e2e`                                                                         | 157 PASS, 5 SKIP, 0 FAIL; Chromium и WebKit, 18.8 минуты. 4 WebKit-only дубли responsive/theme-проверок пропущены по явной аннотации «run once in Chromium», 1 WebKit touch drag — потому что использует Chromium CDP |
| `bun run audit`                                                                            | FAIL — один Moderate advisory `GHSA-698v-4r3x-3vcv` в транзитивном `launch-editor` через Vite 8.1.5; зависимости в Track A не обновлялись                                                                             |
| Hosted backup/export, verified restore, production-baseline V4, canonical hosted preflight | BLOCKED — нет разрешённого backup artifact, одобренного хранилища/restore target и approved least-privilege URL                                                                                                       |

Перед коммитом также прошли `git diff --check` и Prettier по добавленным/изменённым исходникам и документации.
