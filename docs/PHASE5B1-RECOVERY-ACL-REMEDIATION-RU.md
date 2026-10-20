# Phase 5B.1 — восстановление, ACL и репетиция V4

Проверено 2026-10-20 на ветке `phase5b1/recovery-acl-remediation`, начатой с `phase5b/database-recovery` HEAD `cee802d694b249e5a8341c6a749f17378e6d50c0`. Hosted SQL-запросы были только read-only. DDL/DML, Auth, Storage, миграции, backup export и restore не выполнялись.

## A. Git и scope

- Предки Phase 5A `fecbef59d212978836ccf3301bde1c4f2010834a`, Phase 5B `17a5c66`, `cee802d` подтверждены.
- Новый worktree не требовался: исходный был чистым, существующие другие worktrees не изменялись.
- `.env` не читался и не менялся; значения секретов не запрашивались.
- Локальные изменения этой фазы будут зафиксированы отдельными коммитами; push/merge запрещены.

## B. Идентичность и доступные backup artifacts

Production `szdmzvsenrnjxgjgregf` и staging `fdzcwhzszbmpxyawrzzf` повторно проверены Supabase project metadata, database host/ref и `get_project`. В обоих SQL-сеансах `current_database() = postgres`, `current_user = postgres`, server version `17.11`; оба проекта `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.003`; production — `eu-west-1`, staging — `eu-central-1`. Organization metadata сообщает план `free`. Эти refs совпадают с ожидаемыми.

Legacy ref `jbxbgcqaywkbnsohjzcx` вернул `permission denied`; его identity и схема не подтверждены, и подключение к нему не выполнялось.

Текущая публичная таблица inventory, извлечённая как catalog metadata (RLS включён на перечисленных таблицах):

- Production: `program_days`, `program_exercises`, `workout_entries`, `workout_entry_operations`, `workout_entry_operation_tombstones`, пять `training_*` catalog/template tables. `workout_entry_sets` и set tombstones отсутствуют.
- Staging: те же application/template tables плюс `workout_entry_sets` и `workout_entry_set_tombstones`.
- На обоих: installed extensions `supabase_vault 0.3.1`, `uuid-ossp 1.1`, `pgcrypto 1.3`, `plpgsql 1.0`, `pg_stat_statements 1.11`; policy/constraints/index counts и migration journal остаются как зафиксировано в Phase 5B report.
- V4 contract signatures: `save_workout_entry_sets(uuid, uuid, uuid, date, jsonb, text)`, `add_workout_entry_set(uuid, uuid, text, integer, text, text, text)`, `update_workout_entry_set(uuid, uuid, text, integer, text, text, text)`, `delete_workout_entry_set(uuid, uuid)`, `reorder_workout_entry_sets(uuid, uuid[])`. Все отсутствуют в production и присутствуют в staging согласно ранее выполненному read-only catalog inventory.

Без поиска в несвязанных личных каталогах проверен checkout: `rg --files` не нашёл original audit, backup dump, backup/restore report или recovery script; есть только SQL preflight и миграционные тесты. `supabase`, `psql`, `pg_dump` и Docker CLI локально отсутствуют; `.env` не существует и не tracked. Исторический restore report описан в [Phase 5B report](PHASE5B-DATABASE-RECOVERY-RU.md) как `RESTORE NOT VERIFIED` из-за `supabase_vault`/`vault.secrets`; остановленный образ не запускался и не копировался.

В доступном Supabase connector есть чтение project/migrations/tables/extensions/SQL, но нет backup-list/download, PITR restore или isolated restore tool. Management API сообщает, что project branches у production и staging отсутствуют. У организации Free: актуальные правила Supabase сообщают, что автоматические дневные backups доступны Pro/Team/Enterprise, а проектам Free рекомендован собственный `supabase db dump`; backups Free не доступны для скачивания из dashboard. Следовательно, проверенного managed artifact здесь нет. [Database Backups](https://supabase.com/docs/guides/platform/backups), [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

| Компонент                               | Результат                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public schema/data, миграционный журнал | Не экспортировались; для логического backup нужны разрешённый read-only DB URL и отдельное разрешение на копию персональных данных                                   |
| `auth` database dependencies            | Schema/links часть возможного PostgreSQL export; email/OAuth providers, SMTP, redirect configuration и Auth secrets отдельно не инвентаризированы                    |
| Roles/grants/default privileges         | `supabase db dump --role-only` способен описать часть ролей; managed roles/passwords нельзя слепо переносить, требуется ручная проверка                              |
| Functions/triggers/extensions           | Metadata инвентаризированы read-only; установлены `supabase_vault 0.3.1`, `uuid-ossp 1.1`, `pgcrypto 1.3`, `plpgsql 1.0`, `pg_stat_statements 1.11`; dump не получен |
| Storage metadata                        | Read-only агрегаты: 0 buckets / 0 object rows в обоих проектах                                                                                                       |
| Storage object bytes                    | Bucket сейчас не обнаружен; SQL dump сам по себе bytes не включает                                                                                                   |
| External secrets/config/functions       | Не получены и не входят в проверенный artifact                                                                                                                       |
| checksum/size/format/creation date      | Не применимо: кандидат backup file не найден                                                                                                                         |

Supabase CLI-процедура разделяет dump ролей, схемы и данных; её документация отдельно предупреждает о customizations `auth`/`storage`, managed `supabase_admin`, паролях custom roles и восстановлении migration journal. Backup file или успешный dump не являются восстановлением. [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

### Безопасная процедура оператора для будущего backup

Это инструкция, а не выполненный backup. Сначала необходимы: отдельное письменное разрешение на production export с пользовательскими строками; plan/retention, одобренный безопасный хост; секретно полученный least-privilege connection string; зашифрованное локальное хранилище с ограниченным доступом; проверка нагрузки и размера. Не использовать production `restore` endpoint: он прерывает доступность проекта.

После разрешения задавать source URL только из secret manager в process environment (`PHASE5B_SOURCE_DB_URL`), не вставлять его в shell history или Git. В изолированной защищённой папке использовать версию Supabase CLI, сверенную с официальной документацией:

```powershell
supabase db dump --db-url $env:PHASE5B_SOURCE_DB_URL -f roles.sql --role-only
supabase db dump --db-url $env:PHASE5B_SOURCE_DB_URL -f schema.sql
supabase db dump --db-url $env:PHASE5B_SOURCE_DB_URL -f data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
Get-FileHash roles.sql -Algorithm SHA256
Get-FileHash schema.sql -Algorithm SHA256
Get-FileHash data.sql -Algorithm SHA256
```

Включить ли `auth`/migration journal схемы, определить по отдельному restore contract; автоматически не выполнять команды из официального примера, восстанавливающие все роли или отключающие triggers на managed schemas. Сравнить DDL источника read-only и подготовить whitelist managed Supabase objects. Зафиксировать file size, checksums, CLI/pg version, дату, source ref, exclusions и custody. Хранить dump вне репозитория, шифровать at rest, ограничить operator access и установить срок удаления.

Для локальной проверки артефактов составлять manifest `schemaVersion: 1` с `source.projectRef`, `source.postgresVersion`, `createdAt`, `authorization.ticketId`, `authorization.approvedBy`, массивом `artifacts` (relative `path`, `component`, `bytes`, `sha256`) и статусом/причиной для каждого coverage item: `publicSchema`, `publicData`, `authDependencies`, `migrationHistory`, `rolesAndAcl`, `extensions`, `storageMetadata`, `storageBytes`, `authProviderConfig`, `secretsAndExternalServices`. Проверить его командой `node scripts/verify-backup-manifest.mjs <manifest.json>`. Она сверяет identity, approval, scope, byte counts и SHA-256; результат говорит только об integrity файлов, не об их полноте и не о restore.

## C. Restore и recovery

Утверждённого пустого disposable target не существует в доступных данных. Staging содержит реальные application records и запрещён как цель; production запрещён; legacy ref не подтверждён; создание Supabase branch/project не делалось (нет designated target/approval, provisioning может иметь стоимость).

Destination-specific identity, emptiness, ownership, engine/extensions, immutable project id и discard procedure поэтому не подтверждены. Restore command не запускалась; row-count reconciliation, constraints, RPC, RLS/ACL, application queries, observed restore duration, RPO/RTO не измерены.

После проверки нового project ref в dashboard и подтверждения, что это пустой disposable target, pre-restore guard использует process environment `PHASE5B_RESTORE_DATABASE_URL`, `PHASE5B_RESTORE_PROJECT_REF`, `PHASE5B_RESTORE_APPROVED_PROJECT_REF` (одинаковый exact ref), `PHASE5B_RESTORE_TARGET_NAME=phase5b1-disposable` и `PHASE5B_RESTORE_CONFIRM=I_APPROVE_EMPTY_DISPOSABLE_TARGET`, затем команду `bun run verify:restore-target`. Script использует TLS и одну сессию в read-only transaction, проверяет URL ref, отказ от production/staging/legacy, отсутствие пользовательских public tables (кроме extension-owned), `auth.users` и `storage.objects`. Он никогда не очищает target. Переменные загружаются из secret manager вне истории shell; approval marker не заменяет dashboard identity/empty check.

**Restore: BLOCKED.** Самый точный недостающий ресурс: project owner должен предоставить/создать и письменно назначить отдельный пустой disposable Supabase project или совместимый изолированный PostgreSQL restore host, предоставить его ref/engine/extensions, подтвердить отсутствие данных и политику discard. До этого оператор не должен запускать `psql --file` или restore endpoint.

## D. PT-01 V4

Production schema по прежней read-only инвентаризации не содержит V4; staging содержит. В этой фазе production-baseline пред-assertions и backup snapshot невозможны без restore. Поэтому production-baseline V4 rehearsal — **BLOCKED**, не выполнен. Текущие PGlite fixture tests — отдельное синтетическое свидетельство: `bun run test:db` проверил backfill/legacy preservation, RLS, retries, повторное применение и rollback на synthetic schema, но это не production restore.

На восстановленной копии требуется: сохранить count/hash non-identifying агрегаты, таблицы/ACL/RLS/RPC до миграции; выполнить ровно `20261016204330_per_set_workout_v4.sql` транзакционно; сверить entries/operation snapshots/sets/tombstones, weights/reps/RIR/notes/date без вывода содержимого строк; проверить owner FK/RLS/policies/indexes/RPC signatures; запустить read-only application compatibility checks; затем тестировать failure/retry только на disposable копии. После первого V4 write не удалять V4 objects при rollback; выполнять проверенный roll-forward либо восстановление в новый disposable target.

## E. PT-08 ACL и Supabase-managed `supabase_admin`

Read-only каталог в обоих проектах показал одинаковое состояние:

- Владелец и grantor существующих app таблиц: `postgres`.
- На пяти `training_*` library таблицах effective grants для `anon` и `authenticated` — `SELECT, INSERT, UPDATE, DELETE`; ACL выданы `postgres`. Это избыточно; локальная forward-only migration умеет убрать их и оставить `authenticated SELECT` плюс явные RPC.
- В `pg_default_acl` широкие defaults на tables, sequences и functions есть у `postgres` и `supabase_admin`, grantor совпадает с соответствующим owner.
- У `postgres`: `pg_has_role('postgres','supabase_admin','MEMBER') = false`, `USAGE = false`; у `supabase_admin` metadata показывает managed role с superuser bit. Никакое переключение роли или privilege escalation не пробовалось.
- Следствие: migration, выполняемая как `postgres`, не вправе менять defaults, выданные `supabase_admin`. Не добавлять членство в эту роль и не копировать/переопределять managed role.
- Дополнительно `snapshot_entry_day()` и `valid_workout_reps(integer[])` имели `PUBLIC EXECUTE` и были доступны anon/authenticated; оба owner `postgres`, SECURITY INVOKER. `record_workout_entry_operation()` уже не доступна browser ролям/PUBLIC.

### Scoped release policy и исправление

Migration `20261020100000_training_library_least_privilege.sql` остаётся намеренно ограниченной: удаляет app grants и defaults только у `postgres`, как владельца app migration path. `supabase_admin` defaults остаются managed-service исключением, а не разрешением для application DDL.

Добавлена отдельная forward-only migration `20261020120000_public_helper_function_privileges.sql`: отзывает direct execute у `PUBLIC`, `anon`, `authenticated` на trigger-only `snapshot_entry_day()` и оставляет `valid_workout_reps(integer[])` только для `authenticated` (нужен для проверки новых constraint writes). Synthetic PGlite test подтверждает, что authenticated call и обычная запись истории работают, а anon/PUBLIC direct execute закрыты. На hosted БД обе новые ACL migrations не применялись.

Для безопасного gate реализована политика: все контрактные application tables/RPC/helpers должны быть owner `postgres`; effective browser grants и helper function ACL должны совпадать с allowlist; широкие `postgres` defaults блокируют release; defaults `supabase_admin` инвентаризируются read-only и выводят явное предупреждение, но сами по себе не являются release failure при соблюдении owner gate. Любые app objects, созданные владельцем `supabase_admin`, неизвестным владельцем или другим deployment principal, блокируют release до DBA review. Все app migrations запускаются только проверенной ролью `postgres`; не запускать DDL от имени Supabase-managed role.

Текущий hosted PT-08 всё равно **BLOCKED**: прямые library grants и `postgres` defaults ещё не исправлены. Scoped policy не объявляет эти существующие ACL приемлемыми; после согласованной миграции требуется канонический preflight. Официальные материалы Supabase описывают default grants `postgres` для API ролей и ограничения managed roles; в частности, менять grants объектов, выданные другим владельцем, может только grantor/роль с полномочиями. [Custom role inherits privileges](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c), [Roles and superuser access](https://supabase.com/docs/guides/database/postgres/roles-superuser).

Добавлен общий read-only запрос [default-privileges-preflight.sql](../scripts/default-privileges-preflight.sql), который возвращает owner, schema, object type, grantor, grantee и privilege. Release preflight использует его, требует `postgres` owner для контрактных tables и RPC, fail-closed обрабатывает неизвестных владельцев и не пытается менять Supabase-managed defaults. Добавлены `verify-backup-manifest.mjs` и `verify-restore-target.mjs`; оба fail-closed, ничего не меняют и не выводят connection string.

## F. PT-13 canonical preflight

Project identity для ожидаемых production/staging сверена через `get_project`; неизвестный ref получает ошибку доступа. Официальный connector позволяет каталоговые SELECT, но это **не canonical preflight**. В этой среде нет approved `RELEASE_DATABASE_URL`; значения connection string не запрашивались и не создавались. `bun run preflight:release` в этой фазе будет считаться BLOCKED, пока credentials не одобрены.

Минимальные DB полномочия: подключения и SELECT по catalog (`pg_class`, `pg_namespace`, `pg_roles`, membership, `pg_default_acl`, `pg_policy`, `pg_constraint`, `pg_proc`, `pg_index`, `information_schema`), effective `has_*_privilege`, read-only SELECT по migration journal и по защищённым reconciliation flags. Не требуются DDL/DML, role membership, secret/service-role или Auth user access. Канонический скрипт включает TLS required, `max: 1`, project ref checks и `SET TRANSACTION READ ONLY`; он не выполняет repair.

Операторский запуск после безопасной выдачи URL из secret manager (без помещения значения в аргумент командной строки/history):

```powershell
$env:SUPABASE_ENVIRONMENT = 'staging'
$env:SUPABASE_PROJECT_REF = 'fdzcwhzszbmpxyawrzzf'
# Загрузить RELEASE_DATABASE_URL из approved secret manager в process env.
bun run preflight:release
```

Повторить с `production` / `szdmzvsenrnjxgjgregf` только после schema release contract и необходимого восстановления. Preflight должен завершиться ненулевым кодом, пока production без V4 или остались широкие `postgres` defaults/effective grants.

Для пост-миграционного gate на отдельном disposable restore ref поддержан `SUPABASE_ENVIRONMENT=recovery`. До запуска оператор должен вручную сверить точное имя/ref проекта в Dashboard, затем задать `SUPABASE_PROJECT_REF`, `PHASE5B_RESTORE_APPROVED_PROJECT_REF`, `PHASE5B_RESTORE_TARGET_NAME=phase5b1-disposable`, `PHASE5B_RESTORE_CONFIRM=I_APPROVE_EMPTY_DISPOSABLE_TARGET` и `RELEASE_DATABASE_URL` из secret manager. `bun run preflight:release` отказывает для protected refs и несовпадающего database URL; подключение всегда read-only. Recovery mode ожидает уже полную V4 capability и не является pre-migration checker.

На утверждённой restored copy перед V4 сначала выполнить supplemental legacy assertion file, затем по одной транзакционной миграции в таком порядке: `20261020100000_training_library_least_privilege.sql`, `20261020120000_public_helper_function_privileges.sql`, `20261016204330_per_set_workout_v4.sql`. Для psql использовать заранее подготовленный и защищённый libpq service/passfile без передачи URL/password в аргументах:

```powershell
psql -X 'service=phase5b1_restore' --set ON_ERROR_STOP=1 --file=scripts/release-schema-preflight.sql
psql -X 'service=phase5b1_restore' --set ON_ERROR_STOP=1 --file=drizzle/migrations/20261020100000_training_library_least_privilege.sql
psql -X 'service=phase5b1_restore' --set ON_ERROR_STOP=1 --file=drizzle/migrations/20261020120000_public_helper_function_privileges.sql
psql -X 'service=phase5b1_restore' --set ON_ERROR_STOP=1 --file=drizzle/migrations/20261016204330_per_set_workout_v4.sql
```

Это инструкция, не запуск. Сначала требуется manifest с reconciliation baseline, verified restore, явный DBA change approval и успешный empty-target guard до восстановления. При ошибке `ON_ERROR_STOP` завершает psql; каждая миграция содержит собственные `BEGIN/COMMIT`. После успешных миграций canonical read-only `preflight:release` в `recovery` режиме проверяет capability/ACL. До первой успешной восстановленной копии, counts reconciliation и этих assertions нельзя помечать V4 rehearsal как PASS.

## G. Текущие проверки этой фазы

| Проверка                              | Статус и результат                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Git baseline/branch ancestry          | PASS — Phase 5B.1 branch от `cee802d`; Phase 5A/5B commits ancestor                                |
| Backup artifact inventory в checkout  | PASS — проверены `rg --files` и migration/recovery scripts; candidate artifact не найден           |
| Project identity                      | PASS — production/staging independently verified; legacy ref BLOCKED: permission denied            |
| Read-only ACL/default ACL inventory   | PASS — получены effective grants, owners, grantors, owner membership; production/staging unchanged |
| `bun install --frozen-lockfile`       | PASS — lockfile не изменился                                                                       |
| `bun run test:db`                     | PASS — 63/63, включая multi-owner ACL/helper regression и synthetic V4 rollback tests              |
| `bun run test:toolchain`              | PASS — 17/17, включая manifest/target guard fixtures                                               |
| `bun run test`                        | PASS — 304/304, 32 файлов                                                                          |
| TypeScript, ESLint, Prettier          | PASS                                                                                               |
| `bun run preflight:schema-contract`   | PASS — локальный contract only                                                                     |
| `bun run build`                       | PASS — build с `.invalid` CI-only URL и test publishable key                                       |
| `bun run check:client-bundle`         | PASS — 40 файлов                                                                                   |
| `bun run smoke:runtime`               | PASS — `/`, `/auth`, manifest через локальный Wrangler                                             |
| `bun run audit`                       | PASS — 0 vulnerabilities в 649 packages                                                            |
| `bun run test:e2e`                    | PASS — 157 passed, 5 skipped, 0 failed; Chromium + WebKit                                          |
| Реальная backup manifest validation   | BLOCKED — backup artifact отсутствует; manifest тестирован только на sanitized fixture             |
| `bun run verify:restore-target`       | BLOCKED — без approved project ref/URL/attestation guard остановился до подключения                |
| `bun run preflight:release`           | BLOCKED — approved least-privilege DB URL отсутствует                                              |
| Full restore / production-baseline V4 | BLOCKED — approved empty destination and authorized data export absent                             |
| Canonical hosted `preflight:release`  | BLOCKED — approved least-privilege DB URL absent                                                   |
| Hosted ACL repair                     | BLOCKED — prohibited hosted DDL in this phase                                                      |

Результаты тестов и build — текущие для этой ветки; remote database acceptance checks в них не подразумеваются.

## H. GO/NO-GO и действия оператора

**Database GO: NO-GO.** Основания: отсутствует разрешённый production backup artifact; нет проверенного disposable restore target; полного restore и reconciliation нет; PT-01 production-baseline rehearsal заблокирован; existing hosted PT-08 ACL не исправлены; PT-13 canonical preflight не исполнен.

Минимальные gates:

1. Product/data owner письменно разрешает ограниченный export production personal data, задаёт retention/deletion date и approved secure host.
2. Supabase owner выдаёт подходящий backup path/plan и approved read-only DB credential; предоставляет доступ к backup metadata/artifact или разрешает CLI dump. CLI/pg tools нужно установить на одобренный хост; секрет доставляется вне чата и Git.
3. Owner создаёт новый disposable empty restore target, указывает immutable ref, совместимую версию/extensions, отсутствие пользовательских данных и lifecycle cleanup approval.
4. DBA подтверждает scoped PT-08 policy и разрешает отдельную миграцию в согласованном change window; hosted изменения относятся к будущей фазе и здесь не выполняются.
5. Безопасно передать отдельные least-privilege URL для staging/production canonical preflight, достаточные для read-only catalog/contract assertions.

До прохождения шагов 1–3 любые backup/export/restore действия остаются заблокированными; до 4–5 остаются заблокированными hosted migration и release.
