# Готовность к публичному релизу V2 — Прогресс Тренер

Дата: 15 октября 2026 года. Вердикт: **NO-GO**.

В проверенной ветке закрыты 11 из 13 проблем V2. Для B09 и B12 подготовлены и проверены серверные изменения, но действующий Supabase не изменён. Критические настоящие JWT/Auth и managed backup/restore ещё не проверены. Успешные локальные тесты и сборка не заменяют эту приёмку.

## 1. Git и область работы

- Ветка: `fix/v2-release-hardening`, создана от `fix/v2-build-and-e2e`.
- HEAD на старте и во время проверок рабочего дерева: **`7fec95a37177ef1a6ca76f3e91b9f319ba14fe98`**. Проверялись этот HEAD плюс изменения заключительного этапа, содержащиеся в коммите с данным отчётом. Итоговый SHA доступен через `git log -1` и указан в итоговом ответе; документ не выдаёт базовый SHA за SHA будущего коммита.
- Рабочее дерево на старте чистое. `cd17afe` и `7fec95a` подтверждены как предки HEAD; прочитаны полный [AUDIT-V2-RU.md](../workout-audit-v2-2026-10-15/AUDIT-V2-RU.md) и отчёты [этапа 1](V2-DATA-INTEGRITY-RU.md), [этапа 2](V2-BUILD-AND-E2E-RU.md).
- Реальные тренировочные строки, пользовательские черновики, RLS и действующее окружение не менялись. Merge, push, deploy и production-миграции не выполнялись. Нет новых зависимостей, глобальных overrides, `any`, `@ts-ignore` или массового рефакторинга.

## 2. Все 13 проблем AUDIT-V2-RU.md

Координаты в колонке «Исходное место» относятся к аудируемой ревизии `509a88d`. Статус «исправлена» относится к проверенной ветке, а не к автоматически развёрнутому клиенту. Отдельно отмечены неподтверждённые серверные изменения.

| ID  | Приоритет | Проблема и исходное место                                                      | Перед этапом 3                                   | Итоговый статус и доказательство                                                                                                                                                   |
| --- | --------- | ------------------------------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B01 | HIGH      | Frozen install/esbuild: package.json:27, bun.lock:96/1294                      | исправлена, этап 2                               | **исправлена**: новый пустой node_modules, frozen install 546 пакетов; lock v3 неизменён, audit 0                                                                                  |
| B02 | HIGH      | Устаревшие E2E: release.spec.ts:10/12/39/100                                   | исправлена, этап 2                               | **исправлена**: полный актуальный набор 38/38 Chromium/WebKit, без skips/retries                                                                                                   |
| B03 | HIGH      | Старый last-entry: workout-form.tsx:70/93, queries.ts:133                      | исправлена, этап 1                               | **исправлена**: fresh refetch, повторное открытие после save, dirty/late response, A→B; unit/E2E повторно PASS                                                                     |
| B04 | HIGH      | Дата старого черновика: workout-form.tsx:49/79, workout-page.tsx:106/230       | исправлена, этап 1                               | **исправлена**: дата сессии сохраняется при авто-переходе; явное восстановление старого dirty/pending draft; unit/E2E PASS                                                         |
| B05 | MEDIUM    | Выбор дня: program-manager.tsx:36/47/368                                       | не исправлена                                    | **исправлена**: user-scoped preference, активный Select/count, fallback, архив в управлении; component/E2E PASS                                                                    |
| B06 | MEDIUM    | Ошибка за диалогом: program-manager.tsx:253/441/664                            | не исправлена                                    | **исправлена**: отдельная ошибка внутри редактора, aria-describedby, ввод сохраняется; validation/network/E2E PASS                                                                 |
| B07 | MEDIUM    | NULL day_id: entries-page.tsx:41/44/52                                         | не исправлена                                    | **исправлена**: группа без дня, включая архив и отсутствие всех дней; только чтение, component/E2E PASS                                                                            |
| B08 | MEDIUM    | Все карточки истории: entries-page.tsx:110/123/182                             | не исправлена                                    | **исправлена**: UI по 20, сброс страницы при фильтре/сортировке; 1200 строк/maxRows 137 → 9 запросов/20 карточек                                                                   |
| B09 | HIGH      | Избыточные ACL: production-permissions-preflight.json:55; SQL 0000–0002        | частично исправлена, подготовлен REVOKE TRUNCATE | **частично исправлена**: добавлена нормализация ACL трёх таблиц, локальные SQL/concurrency/restore PASS; удалённые grants остаются, требуется применение/внешняя проверка defaults |
| B10 | LOW       | Склеенные ссылки: auth.tsx:246                                                 | не исправлена                                    | **исправлена**: один inline-контейнер с пробелом; геометрия текста и 44 px target в обоих движках/4 ширинах PASS                                                                   |
| B11 | LOW       | Светлый toast: ui/sonner.tsx:7, __root.tsx:113                                 | не исправлена                                    | **исправлена**: явная dark theme, проверены data-sonner-theme и фактический тёмный фон; длительность workout-toast сохранена                                                       |
| B12 | MEDIUM    | SELECT→INSERT race: program-manager.tsx:131/142, 0003_program_management.sql:3 | не исправлена                                    | **частично исправлена**: owner-locked серверный INSERT guard, две очередности конкурентных транзакций PASS; SQL ещё не применён к Supabase                                         |
| B13 | MEDIUM    | Drag при busy: program-manager.tsx:53/302, Sortable.tsx:77                     | не исправлена                                    | **исправлена**: disabled sensor/activator и синхронный guard операции; delayed rename, mouse/touch/keyboard, повторное включение PASS                                              |

Подтверждённых новых CRITICAL-инцидентов, удалённого HTTP-эксплойта TRUNCATE или потери реальных данных не установлено. Это ограниченный результат проверки, не гарантия отсутствия неизвестных проблем.

## 3. Причины, минимальные исправления и риск изменений

**B05.** Локальный state принимал архивный UUID и терялся при уходе. [ProgramManager](src/components/program-manager.tsx:43) читает `program:day:v1:<userId>`, сразу вычисляет только активный день и сохраняет fallback. Radix Select выводит доступный count и порядок источника. Ошибка загрузки не очищает preference. Архивные упражнения остаются доступны в управлении архивным днём, редактор позволяет явный перенос. Риск низкий–средний: изменён источник выбранного дня, покрыты reload, архив, пустое состояние и разные пользователи.

**B06.** Общий error state выводился за overlay и попадал в окно дней. [Редактор](src/components/program-manager.tsx:754) получил отдельный scoped error и связь с полями через aria-describedby. Сохранение/patch рабочей модели не изменены; невалидный диапазон и отказ сети сохраняют значения. Риск низкий.

**B07/B08.** [Дневник](src/components/entries-page.tsx:12) группирует NULL day_id виртуальным вариантом только в UI, ничего не назначая в БД. Полная проверенная выборка сохраняет прежнюю сортировку performed_on/created_at/id; вес использует тот же tie-break. [UI-страницы](src/components/entries-page.tsx:200) ограничены 20 карточками, есть Назад/Далее и счётчик; фильтр/сортировка/упражнение сбрасывают страницу, уменьшение данных ограничивает её допустимым диапазоном. Серверная пагинация и аналитика не урезаны. Риск низкий; полная сетевая загрузка остаётся сознательным ограничением текущей архитектуры.

**B10/B11.** [Auth](src/routes/auth.tsx:248) содержит один inline text container, поэтому пробел не схлопывается на границе flex-item. Цвета/состояния ссылки и touch target сохранены. [Sonner](src/components/ui/sonner.tsx:8) явно использует dark theme без новых цветов или системы уведомлений. Toast сохранения остаётся 3000 мс, форма доступна сразу. Риск низкий.

**B13.** [Sortable](src/components/Sortable.tsx:82) передаёт disabled в dnd-kit и нативную ручку. ProgramManager блокирует обе sortable-группы при мутации; синхронный ref не позволяет начать две операции до обновления React state. Начатое недоступное действие больше не выглядит успешно выполненным. UUID/RPC/порядок по drag end и прежний откат при ошибке сохранены. Риск низкий–средний; keyboard, held touch и delayed mutation проверены.

**B12.** Клиентский recheck оставлен для сообщения, но окончательная проверка находится в [SQL guard](drizzle/migrations/20261015144732_guard_new_exercise_day.sql:1). INSERT с ненулевым day_id проверяет существование, владельца и archived_at под той же транзакционной advisory owner-lock, что архивирование/порядок. UPDATE существующего архивного упражнения и прежние NULL-связи не меняются. SECURITY INVOKER/search_path и сигнатура функции сохранены, новых RPC/типов нет. Риск средний: требует согласованного применения к целевой БД; локально проверены обе очередности конкуренции, необязательный Upper/Lower, новые save/replay и история.

## 4. Подготовленный SQL и статус B09/B12

В journal восемь файлов: базовые 0000–0004 и три V2-миграции. Имена новых файлов созданы локальным Supabase CLI; удалённый CLI target не использовался.

| Файл                                                                                                                    | Действие                                                                                               | Статус                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| [20261015112617_revoke_workout_truncate.sql](drizzle/migrations/20261015112617_revoke_workout_truncate.sql)             | Этап 1: TRUNCATE у PUBLIC/anon/authenticated                                                           | локально проверен, production не применён               |
| [20261015144732_guard_new_exercise_day.sql](drizzle/migrations/20261015144732_guard_new_exercise_day.sql)               | B12: атомарная проверка INSERT                                                                         | PGlite и native PostgreSQL PASS, production не применён |
| [20261015144758_restrict_workout_table_grants.sql](drizzle/migrations/20261015144758_restrict_workout_table_grants.sql) | B09: REVOKE ALL на трёх таблицах у PUBLIC/anon/authenticated; GRANT SELECT/INSERT/UPDATE authenticated | PGlite и native PostgreSQL PASS, production не применён |

Последний файл снимает TRUNCATE/REFERENCES/TRIGGER/MAINTAIN и ненужный DELETE, не меняя service_role, функции, RLS, другие таблицы или данные. Проверены собственные DML/RPC, отказ чужого пользователя, архив, неизменность истории и повторное выполнение миграций. Creator-wide default privileges намеренно не меняются: затрагивание других объектов/создателей требует отдельной оценки владельца. Нормализация текущих таблиц не гарантирует безопасных defaults будущих таблиц.

**В действующей БД B09 и B12 остаются актуальны.** Production-проверка TRUNCATE не выполнялась. PostgreSQL исключает операции целой таблицы из RLS, но обычный PostgREST CRUD не предоставляет произвольный TRUNCATE; HTTP-эксплуатация не доказана. [Границы RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

## 5. Повторная оценка A01–A17

| ID первого аудита | Текущий результат и граница доказательства                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01               | User-scoped cache, AbortSignal, generation boundary, поздние ответы и A→B→A повторно PASS. Реальные JWT — staging                                    |
| A02               | Актуальная модель UUID дней, typecheck/build и воспроизводимая установка PASS                                                                        |
| A03               | Личные 1–7 дней, названия, CRUD/архив/restore/порядок и упражнения повторно PASS; B05/B06/B13 закрыты в UI, B12 ждёт SQL                             |
| A04               | Пустой вес/подход не превращается в результат; 0, запятая, целые reps, 1–20 подходов, диапазон ввода проверены unit/SQL                              |
| A05               | Fresh last-entry и dirty protection, выбор даты/упражнения, поздний ответ повторно PASS                                                              |
| A06               | UUID/payload/reload/retry/double submit PASS; также два native SQL-соединения → одна строка. Настоящий API — staging                                 |
| A07               | CHECK присутствуют в реальном каталоге; девять read-only флагов нарушений false. Пять CHECK остаются NOT VALID; автоматического ремонта/VALIDATE нет |
| A08               | Unit-формулы, предыдущая сессия/календарная неделя, 0 baseline, RIR/подходы PASS; E2E проверяет сравнение 50→52,5 кг (+5%)                           |
| A09               | Составные owner FK/RESTRICT, snapshot дня и архивная история подтверждены каталогами/SQL; grants B09 и настоящий JWT-тест ещё требуют действия       |
| A10               | Loading/error/empty/Retry повторно PASS, ошибка редактора теперь внутри Sheet                                                                        |
| A11               | Пользовательские drafts, явное восстановление старой даты, addressable UUID cleanup и retry PASS. Полной offline-синхронизации нет                   |
| A12               | Двусторонние периоды 7/30/90/365/all и исключение будущего проверены unit; метрики графика — E2E                                                     |
| A13               | Полная стабильная HTTP-пагинация сохранена; обе истории теперь имеют UI-предел 20. Offset не даёт транзакционного snapshot при конкурентных правках  |
| A14               | Bun audit: 0 advisories/596 пакетов; lockfile v3 и адресный override сохранены, версии этого этапа не обновлялись                                    |
| A15               | Confirmation/Enter/autocomplete/busy и ошибки SDK PASS; JWT-проверки не ослаблены. SMTP/Google/redirects настоящего проекта — staging                |
| A16               | TypeScript/ESLint/Prettier/LF/diff --check PASS; массового форматирования нет                                                                        |
| A17               | README/AGENTS/техническая модель/инструкции E2E актуализированы; старые отчёты остаются историческими, текущий вердикт дан здесь                     |

## 6. Автоматические проверки

Node.js 24.14.0, Bun 1.4.3, закреплённый Playwright 1.64.0. Проверки прошли на отдельной копии с новым node_modules; `.env`, Git metadata и несвязанный вложенный проект туда не копировались. Frozen install использовал существующий проверенный пакетный кэш, не прежнюю установленную директорию. Все обязательные команды возвращают ненулевой код при отказе; retries=0/forbidOnly сохранены.

| Проверка                                        | Фактический итог                                                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Clean frozen install, новый пустой node_modules | PASS, 546 пакетов, lockfile не изменён                                                                           |
| TypeScript                                      | PASS                                                                                                             |
| ESLint                                          | PASS                                                                                                             |
| Prettier всего проекта                          | PASS; итоговые документы дополнительно проверены после обновления                                                |
| Unit/component                                  | PASS, 181/181, 16 файлов                                                                                         |
| SQL/PGlite                                      | PASS, 37/37: 32 прежних и 5 новых hardening-проверок                                                             |
| Toolchain                                       | PASS, 3/3, Bun/manifest/lock/CI и legacy esbuild/Drizzle                                                         |
| Production build                                | PASS, client + SSR + Nitro/Cloudflare output                                                                     |
| Dependency audit                                | PASS, 0 уязвимостей, 596 пакетов                                                                                 |
| Chromium E2E                                    | PASS, 19/19                                                                                                      |
| WebKit E2E                                      | PASS, 19/19                                                                                                      |
| Полный E2E                                      | PASS, 38/38, 0 skipped/failed/flaky, без retries, 8,3 минуты                                                     |
| Native PostgreSQL 18.6                          | PASS, 7 проверок: тела функций, история, две гонки B12, concurrent retry, права/изоляция, dump/restore           |
| Удалённые типы/сигнатуры                        | PASS, 30 колонок трёх таблиц и 4 RPC, включая optional/defaults                                                  |
| Git/окружение/клиентский bundle, поиск секретов | PASS по использованным шаблонам; 334 исторических blobs до текущего commit, текущие файлы и 31 public build-файл |
| GitHub Actions на Ubuntu                        | НЕ ЗАПУСКАЛСЯ: push не выполнялся; локальный аналог всех gates PASS                                              |

Основной последовательный pipeline прошёл на чисто установленной копии. После него добавлена отдельная SQL-регрессия шаблона/new save/архива и повторена SQL-команда: 37/37. Последние изменения документации/тестов отдельно прошли lint/format; прикладной код, миграции и browser-сценарии после полного E2E не менялись. Первые ошибки harness (пробел в locale assertion, SQLSTATE, атрибут Sonner, lazy запуск native retry) исправлялись в тестах, без отключения проверок; неуспешные логи сохранены.

## 7. Security audit и реальный Supabase

Доступен только действующий `ProgressTracker`, PostgreSQL 17.11.0.003; отдельного staging/development branch нет. Выполнены только READ ONLY каталоги, флаги нарушений, list_migrations и Security Advisor. Пользовательские строки, пароли/JWT/ключи не выгружались.

- RLS включён на трёх таблицах; owner predicates/WITH CHECK, составные FK и RESTRICT, индексы и snapshot-trigger присутствуют.
- Четыре RPC существуют с ожидаемыми именами/типами аргументов/defaults/returns, SECURITY INVOKER/search_path=public; anon EXECUTE запрещён, authenticated разрешён.
- Тела восьми базовых функций совпадают с репозиторными 0000–0004. Новая версия lock_program_owner ожидаемо существует только в подготовленной миграции.
- У anon/authenticated нет superuser/BYPASSRLS или обнаруженного дополнительного членства. Однако **шесть эффективных TRUNCATE grants** на трёх таблицах подтверждены повторно; прямых PUBLIC ACL нет. service_role BYPASSRLS ожидаем и не менялся.
- Все девять проверенных признаков нарушений — false: legacy NULL, reps/examples, числовые веса/RIR, owner-связи упражнения/дня/записи. Это не полный export/repair, не автоматическая валидация старых CHECK и не доказательство всех возможных инвариантов.
- Supabase migration list пуст при установленной схеме. Journal необходимо согласовать с каталогами; повторять старые миграции из-за этого нельзя.
- Security Advisor: WARN о выключенной leaked password protection, не ERROR RLS. Настройка не менялась; оценка владельцем и [документация Auth](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) включены в staging-план.
- `.env` игнорируется и не отслеживается. Git history/текущий код не содержат обнаруженных private key/sb_secret/service-role JWT/AWS access key по шаблонам; историческая `.env` с публичным ключом не удалялась переписыванием истории. Совпадение локальных frontend/server URL/publishable key с подключённым проектом подтверждено без раскрытия значений.
- В 31 файле public production build не обнаружены привилегированные ключи, включая сравнение с приватными локальными env-значениями. Сборка тестовая с фиктивным публичным ключом; hosting runtime и реально опубликованный bundle не проверены. CI/E2E также явно подставляют фиктивное серверное окружение и пустой service-role key.

Сканирование шаблонов не находит все неизвестные форматы секретов. Mock Auth/SET ROLE с тестовым auth.uid() не подтверждают проверку подписей JWT настоящего Supabase.

## 8. Целостность данных и регрессионные цепочки

Согласованная модель сохраняется: day_id/exercise_id/user_id — UUID и владелец, `position` — порядок, archived_at — мягкий архив, workout day_name — серверный исторический снимок. Архив/restore/rename/move не переписывают историю. SQL-файлы изменяют функцию/ACL, не выполняют UPDATE/DELETE/backfill пользовательских строк.

Проверены цепочки регистрации с confirmation → onboarding → программа; создание/переименование/порядок/упражнение/архив/restore; выбор дня/упражнения → полное автозаполнение → изменение повтора → save/toast/следующее; save → «Записи»/фильтр/сортировка; «Прогресс»/графики/сравнения; A→B→A с кэшем и черновиками. E2E использует реальный React UI с мокированным HTTP; каждый внешний адрес, кроме фиктивного backend, блокируется.

Native PostgreSQL 18.6 в отдельном локальном кластере с синтетическими UUID подтвердил блокировку INSERT после выигравшего архива и ожидание архива после выигравшего INSERT. Два соединения retry одного UUID создали одну строку. pg_dump восстановлен в другую пустую БД; сериализованные строки трёх таблиц совпали. Кластер после проверки остановлен. Это репетиция синтетической БД, не backup/restore действующего Supabase/Auth и не испытание на его версии PostgreSQL.

## 9. Мобильный UX

Chromium и Playwright WebKit, 320/375/390/430 px: регистрация/вход/onboarding, программа/Select, редактор дней/упражнения, тренировка, записи, прогресс. Измерены date/weight bounding boxes, отсутствие пересечения/выхода за колонки и горизонтального overflow; сохранён native date picker. Проверены длинные названия, keyboard Select/Escape/focus, Enter, mouse/held-touch/keyboard DnD, toast над dock и отсутствие блокировки формы.

Новые E2E проверяют геометрию пробела Auth, тёмный фактический фон Sonner, сообщение внутри активного диалога, busy activator, пользовательский выбор, страницы и restore. Визуально просмотрены WebKit снимки ошибки редактора 320 px и дневника 430 px. R1 из аудита (пустой вес после reload в одном старом WebKit-прогоне) в текущем полном наборе не воспроизвёлся: до/после reload есть явные проверки веса/reps/notes. Универсальное устранение нелокализованного R1 этим не доказано.

**Физический iPhone, системная клавиатура, доверенный нативный touch, реальная safe-area, VoiceOver/TalkBack и установка PWA не проверены.** TouchEvent сценарий проверяет обработчики; эмуляция WebKit не выдаётся за Safari на устройстве. Полного redesign или service worker/offline engine нет.

## 10. Изменённые файлы

- `src/components/program-manager.tsx`, `src/components/program-manager.test.tsx` — B05/B06/B13, архивный доступ и регрессии.
- `src/components/Sortable.tsx`, `src/components/Sortable.test.tsx` — disabled activators/sensors.
- `src/components/entries-page.tsx`, `src/components/entries-page.test.tsx` — NULL-группа и страницы.
- `src/routes/auth.tsx`, `src/components/ui/sonner.tsx` — B10/B11.
- `drizzle/migrations/20261015144732_guard_new_exercise_day.sql`, `drizzle/migrations/20261015144758_restrict_workout_table_grants.sql`, `drizzle/migrations/meta/_journal.json` — подготовленные серверные изменения.
- `scripts/release-hardening-db.test.mjs`, `scripts/release-schema-preflight.sql`, `scripts/workout-privileges-preflight.sql`, `package.json` — SQL-регрессии, read-only диагностика и включение в обязательную команду.
- `e2e/hardening.spec.ts`, `e2e/helpers.ts`, `e2e/mock-supabase.ts`, `e2e/release.spec.ts` — актуальные сценарии и управляемые сетевые ответы; прежние полезные тесты сохранены.
- `playwright.config.ts`, `.github/workflows/quality.yml` — изоляция серверного test env от реальных credentials.
- `AGENTS.md`, `README.md`, `docs/PROGRAM-AND-DATABASE-RU.md`, `docs/E2E-RELEASE-RU.md`, `docs/STAGING-V2-RU.md`, `RELEASE-READINESS-V2.md` — модель, приёмка и результаты.

Всего 27 файлов; bun.lock и версии зависимостей этого этапа не менялись.

## 11. Staging, оставшиеся ограничения и решение

Полный безопасный план: [STAGING-V2-RU.md](docs/STAGING-V2-RU.md). Есть воспроизводимые [schema preflight](scripts/release-schema-preflight.sql) и [privilege preflight](scripts/workout-privileges-preflight.sql), список ровно отсутствующих подготовленных SQL и сценарии HTTP с JWT A/B. Staging-записи, регистрация реальных тестовых аккаунтов, Google/SMTP, настоящий API retry, managed backup/PITR и восстановление Auth **НЕ ВЫПОЛНЕНЫ**, поскольку разрешённого тестового проекта нет.

Минимальные препятствия GO:

1. Согласованная staging-репетиция и отдельное подтверждение применения B09/B12 к целевой БД; после применения — повтор ACL/схемы/RPC/DML/истории. Сейчас подтверждённые опасные production grants и race остаются.
2. Настоящие JWT двух тестовых пользователей, Auth confirmation/redirects/OAuth и негативные API-сценарии; согласованный журнал миграций, подтверждённый managed backup/restore и hosting environment. Моки/локальная роль не заменяют эти проверки.
3. Приёмка основного iPhone/Safari-сценария с клавиатурой/датой/safe-area на устройстве и повтор R1 на медленном API, как предусмотрено аудитом.

Остальные ограничения: defaults будущих таблиц, пять NOT VALID CHECK; optional peer Vite/esbuild (build/legacy API проходят, глобального override нет); неизвестная версия Bun внешнего редактора; offset без snapshot, полная загрузка истории до UI-пагинации, localStorage quota/очистка/multi-tab drafts; нет offline app shell. Удалённый Ubuntu CI и реальный Cloudflare runtime не запускались. Эти факты не скрыты под количеством прошедших тестов.

Артефакты вне Git: [workout-v2-stage3-2026-10-15](../workout-v2-stage3-2026-10-15/): clean-install/ci/sql-final/native-postgres логи, JSON E2E, screenshots, remote metadata/flags/advisors, сверка типов и security scan. Они не содержат выгрузки реальных тренировок или ключей. Синтетический dump предназначен только для локальной репетиции.

**Готов ли проект к публичному запуску? NO-GO.** Кодовый этап завершён, но закрытие серверных рисков и критическая внешняя приёмка требуют действий владельца. Автоматического продолжения в production, merge, push или deploy нет.
