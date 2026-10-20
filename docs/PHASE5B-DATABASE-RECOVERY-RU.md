# Phase 5B — готовность восстановления и миграций

Дата проверки: 2026-10-20. Все запросы к production и staging в этой фазе были read-only. Миграции и hosted preflight не запускались. База **NO-GO** для выпуска: полноценное восстановление не проверено, а изолированный restore target без пользовательских данных не предоставлен.

## Git и исходные ограничения

- Ветка: `phase5b/database-recovery`, исходный HEAD: `fecbef59d212978836ccf3301bde1c4f2010834a` (Phase 5A).
- Родословная Phase 3 (`96d8d7a2…`), Phase 4 (`2978591e…`) и Phase 5A присутствует.
- Все прежние изменения сохранены; hosted записи не менялись.
- Локальный репозиторий содержит SQL-контракт и синтетические PGlite rehearsal tests. Они не являются восстановлением production.
- Старый restore отчёт от 2026-10-16 помечен `RESTORE NOT VERIFIED`: ошибка `supabase_vault`/`vault.secrets`; его остановленный экземпляр запрещено запускать или копировать.

## Фактическая схема и идентичность

Идентичность подтверждена отдельно через Supabase project metadata и URL, а не только локальной конфигурацией. Оба проекта активны, PostgreSQL 17.11, организация на бесплатном тарифе.

| Возможность                                             | Production `szdmzvsenrnjxgjgregf`                | Staging `fdzcwhzszbmpxyawrzzf` |
| ------------------------------------------------------- | ------------------------------------------------ | ------------------------------ |
| V4 `workout_entry_sets`, set tombstones, `set_snapshot` | Отсутствуют                                      | Присутствуют                   |
| Пять per-set RPC                                        | Отсутствуют                                      | Присутствуют                   |
| Library/template объекты                                | Присутствуют                                     | Присутствуют                   |
| Public таблицы с RLS                                    | Все включены                                     | Все включены                   |
| Policies / пользовательские public functions            | 17 / 16                                          | 18 / 24                        |
| Constraints / indexes                                   | 58 / 23                                          | 69 / 28                        |
| Расширения, включая `supabase_vault`                    | Совпадают по перечисленным установленным версиям | Совпадают                      |
| Storage buckets / object metadata rows                  | 0 / 0                                            | 0 / 0                          |

Журналы миграций различаются по именам и времени; staging содержит V4 под другим timestamp. Совместимость определяется фактическими capability объектами, а не сравнением timestamps. В обоих окружениях есть пять известных `NOT VALID` ограничений; сами данные для этой инвентаризации не извлекались.

Read-only migration journal в момент проверки:

- Production: `20261015162555 revoke_workout_truncate`, `20261015162607 guard_new_exercise_day`, `20261015162616 restrict_workout_table_grants`, `20261016130756 archived_object_deletion`, `20261016150000 training_templates`.
- Staging: `20261016125453 restore_public_backup_baseline_20261016`, `20261016125644 restore_public_backup_acl_20261016`, `20261016130013 archived_object_deletion`, `20261016160651 training_template_library`, `20261016212528 per_set_workout_v4`.

### Фактический PT-08 ACL drift

В обеих hosted базах библиотечные таблицы всё ещё имеют широкие права `anon` и `authenticated`. В `pg_default_acl` найдены широкие browser defaults для таблиц и sequences, а также `EXECUTE` для функций; владельцы defaults — `postgres` и `supabase_admin`. Production `postgres` не является членом `supabase_admin` (проверено только `pg_has_role`). Подготовленная локальная миграция отзывает defaults `postgres`, но не может из обычной роли отозвать defaults `supabase_admin`. Поэтому PT-08 на hosted **BLOCKED** и до отдельного разрешённого исправления должно оставаться release gate. Исправлен локальный preflight: теперь он ищет опасные defaults у всех владельцев объектов, а не только `postgres`.

## Backup manifest и restore

### Требуемый manifest

Перед разрешённым backup оператор должен зафиксировать без публикации секретов:

1. Точный project ref, регион, PostgreSQL version, UTC время снимка, инициатора и change ticket.
2. Тип backup (платформенный PITR/managed backup или логический dump), охват схем, журнал миграций, число объектов и контрольные суммы зашифрованных артефактов.
3. Схемы/данные: `public` приложения, нужные Auth таблицы и связи, Storage metadata, migration journal; отдельно перечислить исключённые platform schemas и причины.
4. DDL: таблицы, constraints, indexes, sequences, views, functions, triggers, RLS, policies, grants/default ACL, extensions и версии.
5. Вне БД: Storage object bytes, Auth/provider settings, SMTP/OAuth конфигурация, Edge Functions, secrets, DNS/redirect URLs и интеграции. Секреты хранить отдельно в одобренном secret manager, не включать в Git или отчёт.
6. Restore target: новый disposable проект/инстанс без production traffic, совместимая версия PostgreSQL/extensions, ограниченный доступ и дата автоудаления только после утверждённого завершения проверки.

| Область                                               | Подтверждение на этот запуск                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Успешный полный backup artifact                       | **BLOCKED** — backup artefact и доступ к backup inventory не предоставлены                                           |
| Restore в изолированную среду                         | **BLOCKED** — нет утверждённого пустого restore target; запрещено использовать staging и старый неуспешный restore   |
| Сверка строк/constraints/RPC/RLS после restore        | **BLOCKED** — без успешного restore проверка не выполнялась                                                          |
| Storage metadata                                      | Read-only counts: 0 bucket / 0 object rows в обоих проектах                                                          |
| Storage bytes                                         | В проектах сейчас не обнаружены buckets; backup contract всё равно должен отделять объектное хранилище от SQL backup |
| Auth/provider config, custom role passwords и secrets | Не подтверждены; это внешние зависимости и требуют отдельного защищённого inventory                                  |

Managed database backup нельзя считать покрытием всей платформы: он не включает байты Storage объектов, а provider/secrets и некоторые внешние настройки требуют самостоятельного сохранения. Для backup/restore процедуры следовать актуальной [документации Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) и [CLI backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), предварительно проверив ограничения текущего тарифа и версий.

### Restore assertions и критерий PASS

Restore можно отметить PASS только после успешного восстановления в разрешённый isolated target и сохранения доказательств: schema diff; сравнение row counts по таблицам без показа содержимого; orphan/FK/check assertions; индексы и extensions; functions/triggers/RPC signatures; policies, RLS/force-RLS, effective grants и defaults; чтение через приложение с тестовыми учётными записями; аутентификация без обращения к production provider; проверка backup/restore времени и access logs. Любая невосстановленная внешняя настройка фиксируется как отдельный gap. Наличие файла dump или PGlite тестов не удовлетворяет этому критерию.

Ранее зафиксированные ограничения проекта дают ориентир RPO/RTO, но фактические значения не измерены. До теста restore RPO/RTO — **неизвестны**, восстановление в срок не гарантировано.

## PT-01 V4 и PT-08 rehearsal

- V4 migration — транзакционная, forward-only; текущие PGlite тесты моделируют синтетическую legacy схему, сохранение истории, per-set backfill, RPC, RLS и частичную ошибку/rollback.
- В рамках Phase 5B изолированный `bun run test:db` — допустимое доказательство локального контракта, но **не** rehearsal на восстановленном production baseline.
- PT-01 rehearsal на восстановленной копии — **BLOCKED** до разрешённого полного backup + успешного restore.
- PT-08 migration локально проверяет библиотечные grants и defaults роли `postgres`; hosted состояние не исправлялось. Обнаруженный `supabase_admin` default ACL требует DBA-совместимой процедуры/проверки полномочий и последующего read-only preflight.
- Никакие hosted SQL migrations, reset, restore или seed не запускались.

## PT-13 schema contract / release gate

Прочитаны live metadata через Supabase connector: project identity, migration journal, таблицы/колонки, RLS, policies, constraints, indexes, RPC, extensions и default ACL. Полный application preflight `bun run preflight:release` из checkout выполнить нельзя: отсутствует разрешённый least-privilege `RELEASE_DATABASE_URL`; credentials не извлекались и не печатались. Локальная команда `bun run preflight:schema-contract` проверяет исходники и capability contract, но не hosted состояние.

Результаты read-only live inventory достаточны, чтобы доказать несовместимость production с текущим V4 release contract и широкие ACL; они не заменяют запуск канонического preflight по подтверждённому DB URL.

## PT-14 удаление аккаунта

Документ Phase 4 остаётся основанием политики. Account deletion должна охватывать program days/exercises, workout entries/sets, operation ledgers, tombstones, template applications и legacy orphans, при этом не удаляя глобальный template catalog и не смешивая удаление аккаунта с архивацией/удалением exercise. Нужны явное решение по retention, аудит, подтверждённый owner scope, атомарный/повторяемый процесс и recovery window. Product/retention approval отсутствует: **BLOCKED**. В этой фазе не добавлялась destructive SQL и не удалялись пользователи.

## Порядок будущего релиза и восстановления

1. Получить отдельное разрешение на production backup/export и определить, какие приватные пользовательские данные разрешено переносить.
2. Создать защищённый backup и manifest; проверить артефакты/контрольные суммы.
3. Восстановить в новый изолированный target; пройти все assertions выше. Если любой шаг не прошёл — остановиться, production не менять.
4. Устранить PT-08 owner-default ACL drift способом, имеющим полномочия на фактического owner; не расширять права браузерных ролей.
5. Пройти read-only preflight на backup baseline. Должны совпасть project identity и все prerequisite/capability условия.
6. В isolated restore применить отдельно PT-08, проверить effective grants, defaults, RLS и работу приложения.
7. На той же изолированной копии применить V4 одной транзакцией, затем проверить backfill, retries, ownership, tombstones, RPC signatures и приложение.
8. Для production сначала пройти утверждённый backup/restore gate и повторный preflight. Поскольку production ещё без V4, PT-08 можно применить первым, затем V4; после каждой миграции повторить read-only preflight. Application release разрешается только после успешного DB capability check. Staging уже содержит V4: миграции не переигрывать; сначала согласовать PT-08 correction и проверить актуальное capability.
9. Новых Phase 5A backend RPC в релизном контракте этой фазы не обнаружено.

После любого V4 write не выполнять destructive rollback/drop set tables: клиент можно откатить к совместимому приложению, а схема и per-set данные должны сохраниться. Предпочтителен проверенный roll-forward. Если транзакция не завершилась, проверить фактический transaction outcome и capability заново; вручную не исполнять части migration.

## Результаты проверок

| Проверка                                                 | Статус                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Git baseline/ancestry/branch                             | PASS — Phase 5B ветка от ожидаемого Phase 5A HEAD                                        |
| Production/staging identity и read-only schema inventory | PASS                                                                                     |
| Frozen install                                           | PASS — `bun install --frozen-lockfile`, lockfile без изменений                           |
| PGlite/SQL migrations                                    | PASS — `bun run test:db`, 61/61                                                          |
| Toolchain/release contracts                              | PASS — `bun run test:toolchain`, 14/14                                                   |
| Application unit/component suite                         | PASS — `bun run test`, 304/304, 32 файлов                                                |
| TypeScript / ESLint / Prettier                           | PASS — `bun run typecheck`, `bun run lint`, `bun run format:check`                       |
| Локальный schema capability contract                     | PASS — `bun run preflight:schema-contract`; это не live preflight                        |
| Канонический `preflight:release`                         | BLOCKED — отсутствует approved least-privilege DB URL                                    |
| Hosted backup artifact и restore                         | BLOCKED — не предоставлены/не разрешены                                                  |
| V4 на restored baseline                                  | BLOCKED — нет verified restore                                                           |
| Hosted PT-08 ACL state                                   | BLOCKED/FAIL — реальные широкие library/default ACL найдены; миграция не применялась     |
| PT-14 destructive account deletion                       | BLOCKED — retention policy не утверждена                                                 |
| Production build                                         | BLOCKED — guard требует build-mode Supabase URL/publishable key; credentials не читались |
| Production/staging mutation                              | НЕ ВЫПОЛНЯЛАСЬ                                                                           |

## Решение

**Database GO: NO-GO.** Обязательные причины: нет verified full restore, V4 production gap, canonical preflight не запущен, PT-08 defaults `supabase_admin` остаются широкими, account deletion policy не утверждена. Требуемые human gates: разрешение на controlled backup/restore с private-data handling plan; выделение disposable restore target и минимальных DB credentials; DBA approval/возможность исправить ACL фактического owner; product approval retention до account deletion; отдельное разрешение на будущие hosted migrations/deployment.
