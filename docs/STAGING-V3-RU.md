# Приёмка V3 на отдельном Supabase

Этот документ — план, а не разрешение на создание платного проекта, применение SQL или работу с production-данными. На 16 октября 2026 доступен действующий `ProgressTracker` (`szdmzvsenrnjxgjgregf`); development branches отсутствуют. Выполнена только read-only сверка. Настоящие JWT/Auth и удаление через hosted API ещё не проверены.

## 1. Зафиксировать цель и baseline

1. Владелец предоставляет отдельный разрешённый staging-проект с контролируемыми email A/B и без реальных тренировок. Записать project ref, URL, PostgreSQL version, Git SHA и настройки email/OAuth redirects. Не определять целевую БД только по `supabase/config.toml`.
2. Проверить frontend/server Supabase URL и publishable key. В браузере не использовать service_role; пароли/JWT/ключи не помещать в Git, отчёты или trace. Реальные permission-тесты используют обычные JWT A/B.
3. Подготовить synthetic baseline через 0000–0004 и B09/B12 **только в новом пустом staging** либо восстановить разрешённый baseline. До следующего шага выполнить [release-schema-preflight.sql](../scripts/release-schema-preflight.sql) и [workout-privileges-preflight.sql](../scripts/workout-privileges-preflight.sql). Сверить тела функций, сигнатуры, RLS, ACL, составные FK, индексы и triggers с локальным SQL. Не применять `drizzle-kit push`.
4. Для действующего ProgressTracker уже применены remote migrations `20261015162555_revoke_workout_truncate`, `20261015162607_guard_new_exercise_day`, `20261015162616_restrict_workout_table_grants`. Их локальные соответствия — `20261015112617`, `20261015144732`, `20261015144758`. **Не повторять эти файлы на существующей БД.** Пустой drizzle journal не означает пустую схему. Remote EXECUTE для authenticated на двух trigger-функциях отличается от чистого локального baseline; сверить явно, не выдавать или отзывать права автоматически.
5. Сделать backup staging и доказать его восстановление в отдельную пустую БД. Зафиксировать до миграции все synthetic записи, UUID, day_id/day_name, даты, timestamps, веса, reps/RIR/notes. Сравнение должно учитывать полный JSON полей и данные второго аккаунта, а не только количество строк.

## 2. Репетиция единственной недостающей миграции

После отдельного разрешения на staging применить ровно [20261015202500_archived_object_deletion.sql](../drizzle/migrations/20261015202500_archived_object_deletion.sql), в состоянии, содержащем исправление C03 из `2e24e13`. Зафиксировать SHA-256 файла. Не использовать раннюю версию SQL из аудита. Проверить отсутствие одноимённых ledger/tombstone tables и RPC перед запуском: файл не предназначен для слепого повторного применения.

В файле уже есть BEGIN/COMMIT. Штатным миграционным процессом задать на выделенном соединении `lock_timeout = '5s'` и `statement_timeout = '30s'` **до** выполнения файла. При timeout/ошибке остановиться, откатить незавершённую транзакцию и проверить каталоги; не повторять автоматически и не расширять права. При большой synthetic истории отдельно измерить время копирования исходных операций в ledger и требуемое место. Исторические workout_entries при установке не переписываются; исходные day_id, date и payload не угадываются для legacy NULL-day строк.

Проверить:

- `delete_archived_program_day(uuid)` и `delete_archived_program_exercise(uuid)` существуют, SECURITY DEFINER, безопасный search_path, явная проверка auth.uid(); PUBLIC/anon EXECUTE запрещён, authenticated разрешён.
- `archive_deletion_capabilities()` — read-only SECURITY INVOKER, доступен authenticated, возвращает true. До миграции и при отсутствующем RPC UI не показывает destructive controls даже при включённом preference.
- `workout_entry_operations` и `workout_entry_operation_tombstones` имеют RLS/FORCE RLS и owner-scoped SELECT; прямые INSERT/UPDATE/DELETE authenticated запрещены. `record_workout_entry_operation` не является публичным RPC.
- Обновлённые `save_workout_entry` и `snapshot_entry_day` соответствуют локальной версии; B09/B12, composite RESTRICT FK, RLS и необходимые SELECT/INSERT/UPDATE сохраняются. TRUNCATE и прямой DELETE у anon/authenticated отсутствуют.
- Штатный migration journal содержит именно успешно применённую недостающую миграцию; после установки выполнить оба preflight и отдельную сверку новых объектов.

## 3. Настоящие Auth/JWT и безопасность удаления

Зарегистрировать A и B через приложение; проверить пустое/несовпадающее подтверждение пароля до signup, email confirmation, повторный login/reload, logout, Google consent/cancel/error и redirect allowlist. Подтверждение пароля не должно попадать в API payload. Все далее перечисленные удаления выполняются только на синтетических данных staging.

| Проверка                                                     | Критерий PASS                                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Anon/JWT B читает или изменяет UUID A, вызывает delete RPC A | Нет чужих строк или изменений; операции запрещены/возвращают пустой результат согласно контракту                      |
| Удаление активного дня/упражнения                            | Отказ всей операции, история и программа неизменны                                                                    |
| Удаление архивного дня A                                     | Только day_id ссылок становится NULL; упражнения, все поля результатов и исторический day_name сохранены; B неизменён |
| Retry исходного UUID после удаления дня                      | Возвращается исходный UUID, одна запись; payload с отличиями отвергается                                              |
| Удаление архивного упражнения A                              | Удалён только выбранный exercise_id и его история; одинаковое имя другого UUID, другие упражнения и B неизменны       |
| Повтор удаления / поздний save удалённого UUID               | Повтор безопасен; tombstone не позволяет восстановить удалённую историю                                               |
| Два независимых соединения: save→delete и delete→save        | Операции сериализованы, нет orphan/частичных записей; отказавший save сохраняет локальный draft                       |
| Перенесённое упражнение + удаление старого дня               | Текущий day_id упражнения не теряется; старые результаты сохраняют исходный day_name                                  |
| Spoofed detach GUC, подмена user_id/day_id/exercise_id       | Нет обхода owner/FK/snapshot проверок                                                                                 |
| Сервер commit удаления → клиент теряет ответ/503             | Reload/retry подтверждает результат; очищаются только выбранные cache/drafts; A→B не очищает данные B                 |

Для lost reply использовать разрешённый proxy, отбрасывающий только ответ после реального commit; не заменять RPC обработчиком mockSupabase. Для конкуренции зафиксировать блокировки и итоговые строки двумя независимыми подключениями. Synthetic SQL SET ROLE проверяет PostgreSQL, но сам по себе не заменяет hosted JWT/PostgREST.

## 4. UI, устройства и решение о выпуске

Повторить [E2E-RELEASE-RU.md](E2E-RELEASE-RU.md) с настоящим staging API: 1–7 дней, редактирование, reorder, архив/восстановление, unassigned-day, entries/progress, автозаполнение только из прошлых дат, веса/reps/RIR, UUID retry, auto-advance on/off, сохранение даты, A→B→A, React Query cache и dirty drafts.

На 320/375/390/430 px проверить RU/EN и публичные маршруты без настроек, Sheet/Dialog Close, DnD инструкции/объявления/отмену Escape, уведомления, старый draft (`ru-RU`/`en-GB` только для отображения), reload и SSR fallback. Cookie `app_display_language` содержит только текущий UI hint; она не является сессией или серверной настройкой аккаунта. Отдельно проверить заблокированные cookies, две вкладки и смену аккаунта: собственные localStorage preferences сохраняются.

Нужна физическая iPhone/Safari/VoiceOver приёмка: системный date picker, клавиатура, safe area/dock/toast, modal focus, Select, touch DnD и PWA install/standalone. Playwright WebKit не заменяет устройство. Выполнить удалённый CI, проверить настоящий hosting env и собранный SHA, SMTP/OAuth, backup restore и Security Advisor; отдельно принять решение по предупреждению leaked password protection.

Публичный GO возможен только после подтверждённых Auth/JWT A/B, безопасности удаления, серверных функций и обязательной staging/device/hosting-приёмки. Production-применение требует нового явного разрешения и отдельного окна с проверяемым backup; этот этап его не выполняет.
