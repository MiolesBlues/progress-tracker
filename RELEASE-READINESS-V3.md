# Progress Tracker — готовность к релизу V3

Дата проверки: 16 октября 2026 года. **Вердикт для публичного релиза: NO-GO.**

Исправления C01–C07 закрыты на уровне локального кода и изолированных проверок. Это не подтверждение готовности hosted удаления: в действующем Supabase отсутствуют необходимые новые RPC/ledger/tombstones, а настоящие JWT A/B и Auth ещё не прошли staging-приёмку. Конкретный план: [STAGING-V3-RU.md](docs/STAGING-V3-RU.md).

## 1. Git HEAD и проверенная ветка

- Репозиторий: `project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574`.
- Ветка: `fix/v2-release-hardening`.
- HEAD перед этим этапом: `53c79d1421762de7dcad800ad4303d09d3576847` (C01/C04/C05).
- Предыдущий этап C02/C03/C06: `2e24e13940ada4c9fd3f36e58468cad299e20838`.
- Проверен рабочий результат поверх обоих коммитов; этот отчёт включён в отдельный commit C07. Его SHA приведён в финальном сообщении и доступен через `git log -1` в этом checkout.
- До работы был только untracked `AUDIT-V3-RU.md`; он сохранён и не включён в новый commit. История не переписывалась. Push, merge, deploy и production-миграции не выполнялись.

## 2. Статус C01–C07

| ID  | Статус локального исправления              | Свежие доказательства и границы                                                                                                                                                        |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | CLOSED                                     | Bun 1.4.3, lockfile v3, parent-scoped core-utils/esbuild 0.25.12 и Vite/tsx esbuild 0.28.2 сохранены; clean frozen install с пустым кэшем, 6 toolchain checks, audit 0 vulnerabilities |
| C02 | CLOSED как fail-closed совместимость       | Без capability RPC UI скрывает удаление даже при включённом preference. Hosted deletion feature остаётся NOT READY; новые RPC отсутствуют                                              |
| C03 | CLOSED локально; rollout pending           | Исходный UUID retry после удаления дня сохраняет идемпотентность через immutable operation ledger; изменённый payload отклоняется. PGlite/native PostgreSQL PASS; hosted API NOT RUN   |
| C04 | CLOSED                                     | TypeScript, ESLint 0 errors/0 warnings, Prettier PASS; правила/ignores не ослаблены                                                                                                    |
| C05 | CLOSED                                     | Публичные landing/login/signup без шестерёнки; RU/EN после авторизации; английская UI-регистрация и onboarding с guest preference. Auth API в E2E мокирован                            |
| C06 | CLOSED локально; hosted acceptance pending | Lost reply/503, reload/reconcile/retry и адресная очистка cache/drafts проверены mock E2E и component tests; реальные dropped responses после hosted commit не проверены               |
| C07 | CLOSED локально                            | Sheet/Dialog Close, DnD инструкции/объявления/role description, Sonner region/close label, standalone SSR HTML и дата старого draft локализованы                                       |

### Что изменено в C07

Shared UI использует существующий `useI18n`/типизированный словарь; новых зависимостей нет. Toaster помещён внутрь существующего LanguageProvider, поэтому region label обновляется при смене языка. Имена дней/упражнений и notes не переводятся; DnD сообщает позиции/количество вместо UUID.

Escape отменяет активный keyboard drag, сохраняя Sheet/Dialog открытым; повторный Escape закрывает окно. В component tests проверены оба контейнера, в browser tests — отмена и повторный reorder. Завершение drag и отказ сохранения продолжают использовать прежние мутации/инвалидацию.

Дата старого черновика и его кнопка используют общий formatter: `ru-RU` (01.10.2026) / `en-GB` (01/10/2026). ISO storage и `_performed_on` остаются `2026-10-01`; UUID, weight/reps/RIR и пользовательские notes сохраняются. Неполная/повреждённая дата отображается без нормализации и исключения; валидация сохранения не ослаблена.

Standalone error page использует тот же словарь. `app_display_language` содержит только allowlisted `ru`/`en`, без user ID/JWT; provider обновляет hint при смене языка/аккаунта/logout. SSR использует cookie, затем Accept-Language, затем RU. Ответ 500 имеет Content-Language и Cache-Control: no-store. Это отдельный HTML без React/hydration; обычная авторизация и начальная SSR-разметка приложения не менялись. Тест hydrateRoot с сохранённым EN подтвердил отсутствие recoverable hydration errors.

## 3. Результаты технических проверок

Все команды выполнены заново на отдельной acceptance-копии без .env/.git. Результаты этапа 2 не подставлялись вместо новых запусков.

| Проверка                        | Итог                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Preinstall dependency contract  | PASS, закреплённый Bun 1.4.3                                                                                                                    |
| Clean frozen install            | PASS, 547 пакетов за 90.91 с; новая директория и пустой package cache, --no-cache --ignore-scripts; SHA-256 package.json/bun.lock не изменились |
| TypeScript                      | PASS                                                                                                                                            |
| ESLint                          | PASS, 0 errors / 0 warnings                                                                                                                     |
| Prettier                        | PASS                                                                                                                                            |
| Toolchain                       | PASS, 6/6; реальные direct packages, оба пути esbuild, Drizzle config                                                                           |
| Dependency audit                | PASS, 0 vulnerabilities; проверено 597 пакетов                                                                                                  |
| Unit/component                  | PASS, 241 тест / 23 файла                                                                                                                       |
| SQL/PGlite                      | PASS, 42/42                                                                                                                                     |
| Native PostgreSQL 18.6          | PASS, 10/10; новая synthetic БД stage3_final_20261016, два соединения, кластер остановлен                                                       |
| Chromium/WebKit E2E             | PASS, 84/84 (Chromium 42, WebKit 42), 0 skipped/flaky/unexpected, retries=0; 15.1 мин                                                           |
| Production build                | PASS, client/SSR/Nitro/Cloudflare, фиктивные Supabase env                                                                                       |
| Удалённый GitHub Actions/Ubuntu | NOT RUN: push не разрешён; локально выполнены все gates workflow                                                                                |

Первичные падения новых тестов сохранены отдельно: неверное ожидание неактивного aria-pressed, служебная кнопка Close, скрытая в day Sheet, и момент подключения KeyboardSensor. Исправлены локаторы/ожидания реального жизненного цикла; объявления, reorder, отмена, payload и остальные assertions сохранены. После найденного конфликта Escape добавлена продуктовая защита и отдельная регрессия. Неполный ранний E2E остановлен и не считается финальным PASS; retries=0, `.only`/skip и ослабление правил не использовались.

## 4. Полная регрессия бизнес-логики

| Область               | Что проверено повторно                                                                                                                                                  | Источник доказательств                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Auth/settings         | Signup, mismatch/показ подтверждения пароля, login/logout/reload, отсутствие Settings на публичных страницах, немедленное RU/EN, account-scoped preferences             | Component + mock HTTP E2E; настоящие SMTP/JWT/OAuth NOT RUN  |
| Дни/упражнения        | Создание 1–7 дней, rename/reorder, ошибки редакторов, архив/restore, активный выбор, открытый архив при переключении дня                                                | PGlite + component + mock E2E                                |
| Удаление дня          | Все записи/упражнения сохранены; только ссылки day_id обнулены; исходные day_name и остальные поля истории неизменны; перенос остаётся корректным                       | PGlite + native PostgreSQL + mock E2E                        |
| Удаление упражнения   | Только выбранный UUID и его история; одноимённые/чужие данные сохранены; повтор безопасен, tombstone защищает поздний retry                                             | PGlite + native PostgreSQL + mock E2E                        |
| Тренировка            | Собственная прошлая история weight/reps/RIR, dirty drafts, задержанный ответ, UUID retry/double submit, auto-advance on/off, дата сохранена                             | Component + SQL + mock E2E                                   |
| Записи/прогресс       | Текущий rename дня и historical fallback без переписывания истории, архив/unassigned-day, UUID-группировка, сортировка/пагинация/аналитика, актуализация после удаления | Unit + component + mock E2E                                  |
| Изоляция/cache/drafts | A→B→A, поздний ответ другого аккаунта, refresh той же identity, адресная cleanup и повторная загрузка React Query                                                       | Component + mock E2E; owner/FK/RLS отдельно в SQL            |
| Конкуренция           | save→delete и delete→save, параллельный retry одного UUID, move + day deletion, spoofed detach GUC                                                                      | Два native PostgreSQL соединения; hosted concurrency NOT RUN |

## 5. SQL-миграции и фактический Supabase

Read-only проверен `ProgressTracker` (`szdmzvsenrnjxgjgregf`), ACTIVE_HEALTHY, PostgreSQL 17.11. Локальный client URL соответствует этому ref; настоящий hosting environment этим не подтверждён. Development branches: 0. SQL выполнялся в BEGIN READ ONLY; пользовательские записи не выгружались. Сверены каталоги, сигнатуры/тела функций, RLS, policies, ACL, composite FK, triggers, migration list и обезличенные EXISTS-флаги нарушений.

| Локальный файл                               | Фактическое состояние                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 0000–0004                                    | Базовая схема существует; 8 тел функций/security mode/search_path совпали с локальным baseline при нормализации whitespace |
| 20261015112617_revoke_workout_truncate       | Уже применён как remote 20261015162555_revoke_workout_truncate                                                             |
| 20261015144732_guard_new_exercise_day        | Уже применён как remote 20261015162607_guard_new_exercise_day                                                              |
| 20261015144758_restrict_workout_table_grants | Уже применён как remote 20261015162616_restrict_workout_table_grants                                                       |
| 20261015202500_archived_object_deletion      | НЕ ПРИМЕНЁН; pending staging/отдельное разрешение                                                                          |

Supabase journal содержит три timestamped защитные миграции, drizzle journal в remote отсутствует. Поэтому буквальное равенство journal не заявляется; повторять исходные миграции нельзя. Восемь тел функций и шесть матриц табличных прав совпали с локальным baseline **до deletion migration**. Актуальный полный локальный journal отличается ожидаемо: новая миграция пока не установлена.

У трёх таблиц RLS включён, owner-scoped INSERT/SELECT/UPDATE policies сохранены, составные FK владельца имеют RESTRICT. Authenticated имеет SELECT/INSERT/UPDATE, без DELETE/TRUNCATE/REFERENCES/TRIGGER; anon не имеет этих табличных прав. Наличие старой DELETE policy на workout_entries не выдаёт DELETE при отсутствии ACL. Четыре прикладных RPC запрещены anon/PUBLIC, разрешены authenticated.

Отдельное расхождение ACL: remote `guard_program_days()` и `lock_program_owner()` разрешают authenticated EXECUTE, чистые локальные миграции такого grant не дают. Тела/search_path и SECURITY INVOKER совпадают; возвращаемый тип trigger и отсутствие TRIGGER grant не доказывают утечку/обход RLS. Это зафиксированный drift, требующий отдельной сверки baseline на staging; SQL не нормализовался автоматически. `snapshot_entry_day` и pure `valid_workout_reps` сохраняют прежние PUBLIC EXECUTE и invoker semantics.

Новые `delete_archived_program_day`, `delete_archived_program_exercise`, `archive_deletion_capabilities`, ledger/tombstones отсутствуют. Remote save_workout_entry/snapshot_entry_day остаются версиями до C03, что допустимо при отключённом permanent deletion, но не позволяет объявить серверный rollout завершённым. SHA-256 pending SQL: `A1CDD20E6FB1BE5255657A89A1FD5670DB97A6A03A9B442A8A681D578B2DC16C`.

## 6. Риски сохранности данных

В проверенных remote EXISTS-флагах нет invalid reps/examples/weight/RIR, нарушенных owner-связей или legacy NULL-day упражнений. Это point-in-time диагностика выбранных инвариантов, не backup и не доказательство отсутствия любой аномалии. Некоторые CHECK остаются NOT VALID для старых данных; автоматическая валидация/repair не выполнялись.

В изоляции подтверждены сохранность истории дня, атомарное UUID-specific удаление упражнения, отказ для активных/чужих объектов, rollback, immutable retry и блокировки владельца. Native PostgreSQL 18.6 отличается от целевого hosted 17.11; PGlite и SET ROLE не проверяют подпись настоящего JWT/PostgREST. Без hosted acceptance/восстановимого backup включать permanent deletion нельзя. UI gate до этого скрывает destructive controls и не проверяет серверную готовность пробным DELETE.

## 7. Мобильные результаты и accessibility

PASS: 320, 375, 390 и 430 px в Chromium и Playwright WebKit. Все 84 browser cases прошли; новые accessibility cases проверяют обе локали на каждой ширине. Переполнения в проверенных сценариях не обнаружены.

Добавлены 18 C07 browser cases: RU/EN × 320/375/390/430 × два движка и по одному standalone HTML fixture на движок, который также проверяет обе локали/четыре ширины. Проверяются доступные имена Sheet/Dialog, DnD role/instructions/move/drop/cancel, сохранение окна после Escape, Sonner region, cookie hint, reload, отсутствие hydration warnings и overflow. Существующие touch/pointer DnD, Select, date/weight, dock/toast, архивы, тренировка, записи и прогресс сохранены.

Standalone browser case отображает HTML fixture из настоящего renderer через setContent; это не искусственно вызванный production SSR crash. Throw/swallowed-500 пути actual server wrapper проверены unit tests с мокированным TanStack handler. Физические iPhone/Safari/VoiceOver, экранная клавиатура ОС и доверенный системный touch — NOT RUN. WebKit Playwright ими не называется.

## 8. Готовность настоящего Supabase и ограничения

| Проверка                                                       | Статус                                           |
| -------------------------------------------------------------- | ------------------------------------------------ |
| Каталоги/RLS/ACL/FK/triggers и уже применённые B09/B12         | READ-ONLY VERIFIED с указанным trigger ACL drift |
| Новые deletion RPC и исправленный ledger retry на hosted БД    | ABSENT / NOT READY                               |
| Настоящие JWT A/B, RLS через PostgREST, удаление по hosted API | NOT RUN                                          |
| Настоящая регистрация/email confirmation/SMTP/Google OAuth     | NOT RUN                                          |
| Backup restore на managed Supabase                             | NOT RUN                                          |
| Настоящий hosting/deployment environment и удалённый CI        | NOT RUN                                          |
| Физический iPhone/VoiceOver/PWA приёмка                        | NOT RUN                                          |

Security Advisor вернул WARN: [Leaked Password Protection Disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Настройка не менялась; требуется решение владельца. Текущие RLS/ACL сверены с [официальной моделью Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), но metadata inspection не заменяет пользовательский JWT.

При blocked cookies standalone fallback использует Accept-Language/RU и не может узнать сохранённую в localStorage настройку. Cookie — общий display hint origin: последняя вкладка может определить язык отдельной аварийной страницы другой вкладки. Обычные account-scoped preferences и labels остаются в LanguageProvider/localStorage и не объединяются. Ключей/данных аккаунта в hint нет; это ограничение SSR fallback, а не новая схема авторизации.

## 9. Вердикт и следующие шаги

**NO-GO для публичного релиза.** Блокеры:

1. Новые deletion RPC/ledger/tombstones и исправления save/snapshot не применены и не приняты на hosted staging.
2. Реальные JWT/Auth A/B, RLS/PostgREST и безопасность удаления не подтверждены.
3. Backup restore, hosting environment/удалённый CI и необходимая iPhone/VoiceOver приёмка остаются NOT RUN.

Код C01–C07 готов к отдельной staging-приёмке. Выполнить [точный план V3](docs/STAGING-V3-RU.md), сверить ACL drift, собрать реальные доказательства и лишь затем заново принять release verdict. Ни старые PASS, ни зелёный локальный pipeline не являются публичным GO.

Диагностика вне исходников: [workout-stage3-2026-10-16](../workout-stage3-2026-10-16/). Логи: [install](../workout-stage3-2026-10-16/artifacts/clean-frozen-install.log), [pipeline](../workout-stage3-2026-10-16/artifacts/final-pipeline-results.json), [unit](../workout-stage3-2026-10-16/artifacts/final-test.log), [PGlite](../workout-stage3-2026-10-16/artifacts/final-test-db.log), [native](../workout-stage3-2026-10-16/artifacts/native.log), [E2E](../workout-stage3-2026-10-16/artifacts/final-e2e.log), [remote catalogs](../workout-stage3-2026-10-16/artifacts/remote-schema.json), [baseline comparison](../workout-stage3-2026-10-16/artifacts/baseline-comparison.json).
