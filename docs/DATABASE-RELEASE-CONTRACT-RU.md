# Контракт схемы и выпуск базы данных

## Краткий статус

Проверки hosted Supabase в этой работе были только read-only. Production ref `szdmzvsenrnjxgjgregf` отвечает как `ProgressTracker`, staging ref `fdzcwhzszbmpxyawrzzf` — как `ProgressTracker (Staging)`; оба проекта доступны, PostgreSQL 17.11. Legacy ref из `supabase/config.toml` не удалось подтвердить, поэтому он удалён из конфигурации по умолчанию.

| Capability                        | Production                                            | Staging                              | Локальный контракт                                                               |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| Библиотека шаблонов, 5 таблиц     | Есть                                                  | Есть                                 | Требуется                                                                        |
| `workout_entry_sets` и tombstones | Нет                                                   | Есть                                 | V4 обязательна                                                                   |
| Пять per-set RPC                  | Нет                                                   | Есть                                 | Точные сигнатуры и права перечислены в `scripts/schema-capability-contract.json` |
| Журнал Supabase                   | Есть, даты/имена не совпадают с локальными timestamps | Есть, включает V4 под иным timestamp | Проверяется capability, а не равенство timestamps                                |
| ACL шаблонов                      | Избыточные права browser ролей                        | Избыточные права browser ролей       | Отдельная forward-only нормализация                                              |

В обоих hosted проектах read-only inventory обнаружил широкие default privileges роли `postgres` для `anon`/`authenticated` на будущих public tables, sequences и functions. Из-за них одних table-level `REVOKE` недостаточно. Текущие membership роли `anon`/`authenticated` сами по себе не показывали дополнительных родительских ролей; клиентские grants по-прежнему проверяются через effective `has_*_privilege`, которое учитывает унаследованные права.

Файл `PROGRESS-TRACKER-AUDIT-RU.md` в checkout не найден; использованы предоставленные требования и доступные release-документы. Старое утверждение в `RELEASE-READINESS-V3.md`, что archive deletion не применена в production, уже не соответствует hosted migration list: эта миграция там присутствует. Журнал не редактировался.

## Владение миграциями

- Канонический исходник схемы — вручную поддерживаемые SQL в `drizzle/migrations/`. Каталог содержит исходный baseline `0000…0004` и feature-миграции.
- `drizzle/schema.ts` и Drizzle snapshots пусты/неполны. `drizzle-kit push` и генерацию DDL из них запрещено использовать.
- Hosted `supabase_migrations` — свидетельство того, что конкретный проект применял, но его timestamps не обязаны совпадать с локальными именами. Не выравнивать, не удалять и не переписывать journal rows автоматически.
- Перед разрешением выпуска проверяются capability-объекты, сигнатуры, constraints, RLS, policies и effective ACL. Машиночитаемый контракт находится в `scripts/schema-capability-contract.json`.
- Fresh install проверяется миграционными тестами PGlite; upgrade проверяется на baseline с существующими legacy workout rows. Это изолированные тесты, а не hosted rehearsal.

## Environment matrix

| Target      | Expected ref                   | Правило                                                                             |
| ----------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| Development | Локальный/изолированный проект | Если environment не задан, считается development; известные hosted refs отклоняются |
| Staging     | `fdzcwhzszbmpxyawrzzf`         | Задать `SUPABASE_ENVIRONMENT=staging` и согласованные browser/server URL/ref        |
| Production  | `szdmzvsenrnjxgjgregf`         | Задать `SUPABASE_ENVIRONMENT=production` и согласованные browser/server URL/ref     |
| CI/E2E      | фиктивный `.invalid` endpoint  | Явно задаётся `SUPABASE_ENVIRONMENT=test`; сетевые запросы тестов подменены         |

Vite config проверяет build-time browser и server значения до запуска команды. Browser и server runtime клиенты повторно проверяют project identity. Секрет service-role остаётся server-only; шаблон `.env.example` использует плейсхолдеры. Реальный `.env` удалён из Git index без удаления локального файла. В GitHub вручную запускаемый `Read-only Supabase schema gate` использует отдельные защищённые database URL secrets; без них workflow завершится ошибкой до подключения.

Vite применяет приоритет OS process variables выше mode-specific env-файлов; Bun auto-load мог заранее заполнить `process.env` общим `.env`. Поэтому `bunfig.toml` отключает auto-load и оставляет mode-aware загрузку Vite. Основание: [Vite env modes](https://vite.dev/guide/env-and-mode) и [Bun environment variables](https://bun.sh/docs/runtime/environment-variables).

## PT-01: V4 upgrade path

Migration `20261016204330_per_set_workout_v4.sql` зависит от legacy `workout_entries` и `workout_entry_operations`. Она сохраняет legacy entry/operation rows, детерминированно переносит подходы, вводит составной owner FK, ordering/validation constraints, RLS + FORCE RLS, tombstones и пять security-definer RPC. Hosted staging содержит эти объекты; production пока их не содержит.

Production **NO-GO для V4** до появления корректного полного backup и успешного restore rehearsal на допустимой изолированной копии. Отчёт restore 2026-10-16 помечен `RESTORE NOT VERIFIED`: restore завершился с ошибками `supabase_vault`/`vault.secrets`, тестовый сервер остановлен, а сам отчёт запрещает запуск/копирование этой копии. Поэтому этот экземпляр не запускался, не использовался, а dry-run на восстановленной production copy не заявляется.

Изолированные проверки подтверждают свежую установку, upgrade поверх legacy данных, сохранность entries/notes/weights/reps/RIR/dates, backfill, повторный детерминированный backfill, отказ при повторном полном запуске V4 без потери данных и rollback при смоделированном частичном объекте. PostgreSQL транзакция при ошибке остаётся aborted до `ROLLBACK`; migration runner обязан завершить/откатить соединение до повторной попытки. Нельзя запускать отдельные фрагменты миграции вручную.

Порядок будущего release после отдельного разрешения:

1. Создать production-only backup с подтверждённым ref, контрольной суммой, schema/data/journal и Storage coverage.
2. Выполнить restore в disposable PostgreSQL 17 с совместимыми Supabase extensions; проверить полный restore и pre-migration assertions.
3. Запустить ручной read-only preflight; V4 capability пока должен блокировать production.
4. На проверенной копии применить ровно исходный V4 SQL в одной транзакции, выполнить post-migration assertions и сравнить все legacy snapshots.
5. После отдельного согласования применить migration к production, затем повторить preflight и только после этого обновлять приложение.

Emergency rollback: до появления новых per-set записей допустимо восстановление по отдельному проверенному плану; после записи новых подходов удалять V4-таблицы нельзя. Предпочтителен roll-forward. Никогда не пытаться «откатить» partial DDL удалением неизвестных объектов: сначала закрыть доступ к выпуску, проверить transaction outcome и capability preflight, затем восстановить из backup либо продолжить проверенный forward repair.

## PT-08: права библиотеки

Новая локальная миграция `20261020100000_training_library_least_privilege.sql`:

- отзывает все table privileges browser roles и PUBLIC с пяти библиотечных таблиц;
- выдаёт `authenticated` только `SELECT` для опубликованного каталога/шаблонов/дней/подходов и пользовательских applications;
- сохраняет `apply_training_template` для `authenticated`, `list_training_templates` для `authenticated`, seed RPC только для `service_role`;
- отзывает широкие defaults `postgres` в `public` для будущих таблиц, sequences и функций.

Миграция идемпотентно нормализует доступ, но не выполнялась на hosted БД. Она не меняет данные, RLS, роли или ownership. Реверс не общий: восстановить прежние grants можно только по заранее сохранённому точному ACL snapshot; не возвращайте широкие права по умолчанию. Тест моделирует широкие прямые и default grants, проверяет effective privilege после наследования роли и безопасное повторное применение.

## Preflight и восстановление

Команда `bun run preflight:schema-contract` проверяет локальный контракт и наличие исходников migrations. `bun run preflight:release` без параметров подключения завершится ошибкой. Ручной workflow запрашивает `SUPABASE_ENVIRONMENT`, ref и `RELEASE_DATABASE_URL`, сначала сравнивает ref с хостом/именем пользователя, затем выполняет только SELECT в `READ ONLY` транзакции. Любой отсутствующий объект, signature, constraint, policy, grant или несовпадающая версия capability блокируют выпуск. Исправлений на remote он не выполняет.

Существующие backup/restore отчёты не подтверждают полную recoverability: backup report — `BACKUP NOT VERIFIED`, restore report — `RESTORE NOT VERIFIED`; Storage bytes отдельно не проверялись. Успех локальных PGlite тестов не заменяет restore rehearsal.
