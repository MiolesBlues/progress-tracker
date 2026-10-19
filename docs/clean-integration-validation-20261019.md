# Проверка чистой интеграции — 2026-10-19

Рабочая ветка: `integration/clean-merge-20261019`. База: `08801935ef40cce34ef9488abebbacc0b6cc40de`.
Это актуализация тестов и исправление регрессий, без дополнительных merge.

## Требования и границы

- Задания пользователя: пустые фактические результаты новых подходов, независимые Weight/Reps/RIR, сохранение ID и значений при перестановке, общий черновик Standard/Focus.
- `docs/per-set-workout-v4-stage-3.md`: Focus использует тот же WorkoutForm, V2 draft и атомарный saveWorkoutSets.
- `README.md`, `docs/E2E-RELEASE-RU.md`, `docs/STAGE2-BUILD-QA-RU.md` явно предусматривают RU/EN.
- Корневой `AGENTS.md` задаёт Russian-only/dark single theme. Это конфликт документации/границ интеграции, а не доказательство отмены английского языка. Языковые E2E сохранены; отсутствующие LanguageProvider/selector/SSR English считаются блокером незавершённой интеграции.
- system-theme, light-blue-palette и несовместимые части hardening остаются исключены. Тесты, требующие этих возможностей, не превращены в успешные проверки и не удалены.
- Моки/preview используют фиктивный endpoint; hosted Auth/RLS/БД этими тестами не подтверждаются.

## Разбор «усечения» имени на 320 px

`programName(name, 60)` делает trim и проверку длины, без slice. Событие input и React state содержат 15 символов «Силовой день с »; обработчик сохранения удаляет только завершающий пробел через trim и отправляет 14 символов в PATCH. Дополнительного обрезания в React/валидации/API нет. На 320 px ширина native input в существующем дизайне — 26 px; maxlength — 60. Исходное имя содержит 45 символов.

Диагностический HTML без React и API:
`<input style="width:26px;padding:4px 12px" maxlength="60" value="Силовой день с произвольным длинным названием">`.
В используемой связке Playwright/Chromium вызов `fill(longDay + "!")` воспроизводит значение `"Силовой день с "` уже в input (15 символов). Это показывает, что прежний вывод о функциональном баге React-редактора был неверен: он отправлял усечённый автоматизацией ввод.

Регрессионный `e2e/day-rename.spec.ts` вводит «!» обычными клавишами, проверяет полное input.value, maxlength=60, полный PATCH, mock storage, отсутствие overflow и повторную загрузку на 320/375/390/768 px в Chromium/WebKit.
Для программной замены в старых E2E helper replaceText сначала очищает input, затем заполняет и проверяет полное значение. Дизайн редактора, лимит 60 и модель не изменены.

## Все 40 исходных падений Vitest

Сценарии не отбрасывались по признаку падения. Основные lifecycle/security проверки переписаны на V2; дублирующиеся базовые проверки используют уже существующий per-set-workout.test.tsx. Счётчик уменьшился за счёт консолидации, а не skip.

| №   | Исходный тест                                                                                  | Причина                 | Что сделано                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | shows active days with exercise counts and filters exercises after selection                   | UI                      | Убрана проверка исчезнувшей сводки «Было»; выбор и фильтрация дней сохранены.                                                                                         |
| 2   | rejects empty weight without sending or losing input                                           | UI, актуальный сценарий | Проверка пустого веса переписана для отдельного подхода.                                                                                                              |
| 3   | prefills weight, every rep and RIR from the last record, including weight 50                   | Автозаполнение          | Заменена на проверку пустых полей при весе истории 50.                                                                                                                |
| 4   | prefills weight, every rep and RIR from the last record, including weight 0                    | Автозаполнение          | Заменена на проверку пустых полей при весе истории 0.                                                                                                                 |
| 5   | uses program weight, target sets and example reps when exercise history is absent              | Автозаполнение          | Плановое число подходов сохранено; фактические результаты должны быть пустыми.                                                                                        |
| 6   | leaves reps empty when there is no history and no example reps                                 | UI                      | Вместо удалённого статуса «Истории нет» проверяются число подходов и пустые результаты.                                                                               |
| 7   | refreshes the suggested weight for the selected date and ignores future history                | Автозаполнение          | Покрыто новым сценарием отсутствия автозаполнения и per-set восстановлением только выбранной сохранённой даты.                                                        |
| 8   | saves explicit weight 0 and all four sets exactly                                              | UI/per-set              | Проверяется _sets с явным нулём и отдельными ID/позициями.                                                                                                            |
| 9   | saves explicit weight 52,5 and all four sets exactly                                           | UI/per-set              | Проверяется нормализация запятой и _sets вместо _weight/_reps.                                                                                                        |
| 10  | advances after server confirmation and prefills the next exercise history                      | Автозаполнение/UI       | Подтверждение сохранения и переход сохранены; следующее новое упражнение пустое.                                                                                      |
| 11  | keeps the exercise selected with auto-advance off and adds separate historical entries safely  | UI/V1                   | Сценарий сохранён в workout-auto-advance-preference E2E; старый дублирующий UI-путь удалён.                                                                           |
| 12  | loads only the selected exercise's own recorded reps and RIR                                   | Автозаполнение          | Покрыто per-set восстановлением выбранной даты и изоляцией ответов разных упражнений.                                                                                 |
| 13  | saves only the edited fourth set and shows it as the latest result when returning              | UI/per-set              | Переписано в roundtrip сохранённых подходов и заметки; выявлена реальная потеря заметки в форме.                                                                      |
| 14  | does not let late next-exercise history overwrite a weight the user has started editing        | Автозаполнение          | Поздняя история не заполняет даже нетронутые поля; ручной ввод сохраняется.                                                                                           |
| 15  | keeps invalid approach "" visible instead of dropping/concatenating it                         | UI/per-set              | Проверка пустых повторений сохранена с новыми именами полей.                                                                                                          |
| 16  | keeps invalid approach "8-8-7-6" visible instead of dropping/concatenating it                  | UI/per-set              | Проверка ошибочного списка повторений в одном поле сохранена.                                                                                                         |
| 17  | late last-entry only fills untouched fields, and subsequent refetch cannot overwrite the draft | Автозаполнение          | Удалено заполнение нетронутых полей; проверяется сохранность всех ручных данных.                                                                                      |
| 18  | shows no invented plan values when an exercise has no targets                                  | UI                      | Проверка отсутствия выдуманной сводки уже есть в per-set-workout; дубликат удалён.                                                                                    |
| 19  | a reply for previously selected exercise cannot change the current exercise                    | UI/per-set              | Поздний ответ предыдущего упражнения не изменяет текущий V2-черновик.                                                                                                 |
| 20  | double click submits once, including a second submit event before acknowledgement              | UI/per-set              | Двойной submit по-прежнему отправляет только одну операцию до подтверждения.                                                                                          |
| 21  | a timeout after INSERT and reopening the app retry the same UUID and immutable payload         | V1 → V2                 | Проверяется remount после потерянного ответа, один UUID и неизменный per-set payload.                                                                                 |
| 22  | a definite INSERT failure retains editable input and retries with the same UUID                | UI/V1                   | Отказ сервера сохраняет редактируемый V2-ввод и UUID повторной попытки.                                                                                               |
| 23  | an intentional second entry on the same date gets a new UUID                                   | V1 → V2                 | Сохранена проверка нового UUID для намеренной второй записи на той же дате.                                                                                           |
| 24  | restores the selected exercise and its raw draft after reopening                               | V1 → V2                 | Сохранён отдельный remount-тест выбранного второго упражнения с raw-значениями, нулевым RIR и неизменными ID. Он дополняет базовый per-set remount без дублирования.  |
| 25  | success for previous exercise clears only that draft and leaves the new form intact            | V1 → V2                 | Позднее подтверждение очищает только черновик завершённой операции.                                                                                                   |
| 26  | account A → B → A never exposes A's draft to B and restores A's own draft                      | V1 → V2                 | Сохранена A→B→A изоляция настоящих V2-значений и ID.                                                                                                                  |
| 27  | storage failure prevents network submission and preserves the visible fields                   | UI/V1                   | Проверка отказа хранилища до сетевого вызова сохранена.                                                                                                               |
| 28  | a corrupt existing draft is preserved and cannot silently be overwritten                       | V1 → V2                 | Повреждённый V2-черновик остаётся нетронутым, отправка заблокирована.                                                                                                 |
| 29  | failed last-entry load allows manual input and Retry preserves dirty fields                    | UI/per-set              | Ошибка загрузки/Retry не затирают вручную введённые значения подходов.                                                                                                |
| 30  | a thrown transport error keeps a retryable operation and a Russian error                       | V1 → V2                 | Объединено с remount/retry потерянного ответа; сетевой TypeError остаётся покрыт.                                                                                     |
| 31  | an operation conflict preserves the frozen draft and asks to inspect history                   | UI/V1                   | Конфликт сохраняет замороженную V2-операцию; обновлена актуальная ошибка.                                                                                             |
| 32  | a late save for A does not clear B's persisted draft                                           | V1 → V2                 | Поздний save A не удаляет сохранённый V2-черновик B.                                                                                                                  |
| 33  | verifies cached last-entry again and applies the newer response to a pristine form             | Автозаполнение          | Актуальная сохранённая дата и свежий ответ проверяются в release E2E; новая тренировка не заполняется.                                                                |
| 34  | a fresh cached-key response cannot replace fields edited while it was loading                  | Автозаполнение          | Объединено с проверкой позднего ответа/кэша и ручного per-set ввода.                                                                                                  |
| 35  | cancels pre-save history and reopening uses the newly confirmed fourth rep                     | UI/V1                   | Roundtrip сохранённых подходов и E2E stage-1 проверяют повторное открытие свежих данных.                                                                              |
| 36  | keeps the session date on auto-advance past a pristine draft of another date                   | V1/автозаполнение       | Release stage-1 сохраняет дату сессии и игнорирует старый pristine V1-черновик следующего упражнения.                                                                 |
| 37  | displays an older English draft as en-GB while preserving ISO storage and save payload         | Локализация/V1          | Дата/данные проверяются V2 и V1 migration тестами; формат en-GB покрыт i18n unit tests. RU/EN E2E сохранены как блокер интеграции, английский не объявлен отменённым. |
| 38  | restores an older edited draft explicitly, preserving both dates and pending=false             | V1 → V2                 | Старые данные проверяются явным выбором даты и миграцией; removed old draft banner не является текущим UI.                                                            |
| 39  | restores an older edited draft explicitly, preserving both dates and pending=true              | V1 → V2                 | Замороженная старая операция повторяется без смены payload; отдельные даты V2 не теряются.                                                                            |
| 40  | rapidly switching A's exercises and then accounts ignores a late cached-key response           | UI/V1                   | Покрыто независимыми проверками позднего ответа упражнения и A→B→A; дублирование удалено.                                                                             |

## Все 46 исходных падений Playwright

Каждая строка учитывает все viewport-варианты/движки указанного сценария.

| Группа                                               | Число | Причина и действие                                                                                                                                                                                       |
| ---------------------------------------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| accessibility-i18n: EN на четырёх ширинах            |     8 | Отсутствует selector языка. Сохранены как незавершённая RU/EN интеграция.                                                                                                                                |
| accessibility-i18n: standalone fallback              |     2 | Устаревшее требование отсутствия любых scripts: существующий theme-bootstrap не является React-гидратацией. Теперь запрещены module/external scripts, проверены локализация RU/EN, bootstrap и overflow. |
| i18n-progress: English signup                        |     2 | Root не подключает LanguageProvider. Сохранён как блокер, не объявлен устаревшим.                                                                                                                        |
| i18n-progress: settings × 4 ширины                   |     8 | Отсутствует языковой selector. Сохранены как блокер.                                                                                                                                                     |
| i18n-progress: day/exercise/archive/account language |     2 | Сначала заменена старая сводка веса/повторений на per-set представление; выбор дня, архив и история остаются проверяемыми. Далее отсутствует языковой UI — эта проверка сохранена как блокер.            |
| centered-exercise-dialog                             |     1 | Системная тема исключена. Геометрия отделена в проходящий сценарий; исходная проверка переключения темы сохранена отдельно.                                                                              |
| compact-record-sort                                  |     1 | Старая сводка «60 кг · 6/6/6» заменена per-set сводкой с числом подходов и максимальным рабочим весом. Сортировка/клавиатура/размеры/память сохранены.                                                   |
| hardening × 4 ширины × 2 движка                      |     8 | Ошибка fill narrow maxlength и старый select сортировки. Заменены ввод и доступ к menuitemradio. Сохранены проверки ошибок, busy drag, legacy history, архив/restore.                                    |
| release mobile × 4 ширины × 2 движка                 |     8 | Старые поля/план/автозаполнение, старый select сортировки. Актуализированы на независимые подходы. Обнаружены отсутствующая имитация lost reply нового RPC и реальное перекрытие Dock уведомлением.      |
| release A→B→A × 2 движка                             |     2 | Старые labels. Сценарий изоляции/черновика/Retry сохранён с новыми полями.                                                                                                                               |
| release stage-1 × 2 движка                           |     2 | Старые labels и «Было»/автозаполнение. Проверки свежих сохранённых данных, позднего ответа, ручного ввода и session date сохранены.                                                                      |
| workout-auto-advance-preference × 2 движка           |     2 | Старый общий вес/повторения и предыдущие результаты. Preference, UUID, retry и отдельные даты сохранены; фактические значения вводятся явно по подходам.                                                 |

## Исправленные реальные регрессии

1. Возврат к сохранённой тренировке восстанавливал подходы, но оставлял пустые заметки. lastEntryQuery теперь выбирает notes; форма восстанавливает их только для совпадающей даты без замены ручного ввода. Unit roundtrip и запрос/форма в release E2E покрывают этот путь.
2. Toast успешного сохранения перекрывал Dock: у восстановленного root Toaster отсутствовали bottom/mobileOffset. Добавлены отступы с safe-area; геометрическая E2E-проверка сохранена.
3. Выбор старой даты не восстанавливал V1-черновик, а первоначальная миграция теряла dirty-флаги и могла заменить ручной ввод сохранённой историей. Выбор даты теперь читает V1, переносит dirty-флаги, а замороженная V1-операция сохраняет прежний RPC/payload. Добавлены проверки обоих состояний и приоритета ручного черновика над историей.
4. Тестовые моки понимали старый save_workout_entry, но не сохраняли/не имитировали потерянный ответ для save_workout_entry_sets. Моки приведены к per-set контракту, исходное поведение lost-reply/idempotency оставлено обязательным.

Поиск имени выполнялся в разрешённых файлах. Защищённый вложенный каталог не открывался. Основная, исходные и резервные ветки и stash не изменялись.

При полном параллельном Vitest существующий B08 (1 200 записей) нестабильно превышал неизменённый лимит 5 секунд из-за конкуренции jsdom-процессов. Для воспроизводимого запуска maxWorkers ограничен двумя; таймауты и объём проверяемых данных не увеличены/не уменьшены.

## Изменённые файлы

- `docs/clean-integration-validation-20261019.md`
- `e2e/accessibility-i18n.spec.ts`
- `e2e/centered-exercise-dialog.spec.ts`
- `e2e/compact-record-sort.spec.ts`
- `e2e/day-rename.spec.ts`
- `e2e/focus-mode-logging.spec.ts`
- `e2e/hardening.spec.ts`
- `e2e/helpers.ts`
- `e2e/i18n-progress.spec.ts`
- `e2e/mock-supabase.ts`
- `e2e/release.spec.ts`
- `e2e/workout-auto-advance-preference.spec.ts`
- `src/components/workout-flow.test.tsx`
- `src/components/workout-form.tsx`
- `src/lib/queries.ts`
- `src/routes/__root.tsx`
- `src/test/supabase-mock.ts`
- `vitest.config.ts`

## Итоги проверок

- TypeScript: PASS.
- ESLint: PASS.
- Vitest: 256/256, 23 файла, `bun run test`.
- Production build: PASS, только фиктивные test env.
- Production preview: 8/8 Playwright Chromium, production worker из `.output/server/wrangler.json`, mock API, без runtime errors в проверяемых сценариях. Проверены Standard/Focus, независимые подходы, retry, восстановление, дни, Program, Records, Progress, локализованный fallback. Снимок Progress на 320 px визуально просмотрен.
- Полный Playwright: **127 passed, 21 failed, 4 skipped** (152 теста, Chromium/WebKit, `bunx playwright test --workers=2`). Exit code 1 сохранён: 20 падений RU/EN и одно system-theme являются незавершённой интеграцией, а не объявлены устаревшими.

Полные машинные артефакты Playwright: `test-results/results.json` и `playwright-report/`; production preview: `test-results/production-preview.json`.

Новые проверки: day-rename (полный ввод/PATCH/перезагрузка на четырёх ширинах) и Focus logging (переход с заполненного Standard, два независимых подхода, один атомарный RPC, дата, отсутствие runtime errors).

## Оставшиеся падения по машинному отчёту

| Движок   | Сценарий                                                                    | Причина                                                | Точка отказа                                                                                                             |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| chromium | C07 en 320px: localized close, keyboard drag and notifications              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки', exact: true }).getByRole('combobox', { name: 'Язык интерфейса' }) |
| chromium | C07 en 375px: localized close, keyboard drag and notifications              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки', exact: true }).getByRole('combobox', { name: 'Язык интерфейса' }) |
| chromium | C07 en 390px: localized close, keyboard drag and notifications              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки', exact: true }).getByRole('combobox', { name: 'Язык интерфейса' }) |
| chromium | C07 en 430px: localized close, keyboard drag and notifications              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки', exact: true }).getByRole('combobox', { name: 'Язык интерфейса' }) |
| webkit   | C07 en 320px: localized close, keyboard drag and notifications              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки', exact: true }).getByRole('combobox', { name: 'Язык интерфейса' }) |
| webkit   | C07 en 375px: localized close, keyboard drag and notifications              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки', exact: true }).getByRole('combobox', { name: 'Язык интерфейса' }) |
| webkit   | C07 en 390px: localized close, keyboard drag and notifications              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки', exact: true }).getByRole('combobox', { name: 'Язык интерфейса' }) |
| webkit   | C07 en 430px: localized close, keyboard drag and notifications              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки', exact: true }).getByRole('combobox', { name: 'Язык интерфейса' }) |
| chromium | system theme integration changes the exercise editor between light and dark | Не подключена системная тема основного UI              | Locator: locator('html')                                                                                                 |
| chromium | English registration and onboarding keep the new account's language         | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('link', { name: 'Get started' })                                                                 |
| chromium | language settings and compact screens at 320px                              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки' }).getByRole('combobox', { name: 'Язык интерфейса' })              |
| chromium | language settings and compact screens at 375px                              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки' }).getByRole('combobox', { name: 'Язык интерфейса' })              |
| chromium | language settings and compact screens at 390px                              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки' }).getByRole('combobox', { name: 'Язык интерфейса' })              |
| chromium | language settings and compact screens at 430px                              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки' }).getByRole('combobox', { name: 'Язык интерфейса' })              |
| chromium | day then exercise selection, archived results, and account-scoped language  | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки' }).getByRole('combobox', { name: 'Язык интерфейса' })              |
| webkit   | English registration and onboarding keep the new account's language         | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('link', { name: 'Get started' })                                                                 |
| webkit   | language settings and compact screens at 320px                              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки' }).getByRole('combobox', { name: 'Язык интерфейса' })              |
| webkit   | language settings and compact screens at 375px                              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки' }).getByRole('combobox', { name: 'Язык интерфейса' })              |
| webkit   | language settings and compact screens at 390px                              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки' }).getByRole('combobox', { name: 'Язык интерфейса' })              |
| webkit   | language settings and compact screens at 430px                              | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки' }).getByRole('combobox', { name: 'Язык интерфейса' })              |
| webkit   | day then exercise selection, archived results, and account-scoped language  | Отсутствует языковой UI/провайдер основного приложения | - waiting for getByRole('dialog', { name: 'Настройки' }).getByRole('combobox', { name: 'Язык интерфейса' })              |

4 skip сохраняют ограничения движков: responsive editor, compact sort и выделенная theme-проверка выполняются только в Chromium; set-touch DnD также имеет существующее ограничение WebKit. Разделение редактора и темы добавило отдельный WebKit skip без сокращения исходного покрытия. Клавиатура/мышь/touch проверяются имеющимися автоматизированными сценариями; физический iPhone и VoiceOver не проверялись.

**Готовность к merge в main: НЕТ.** Реальные регрессии и текущие per-set сценарии исправлены, но обязательства RU/EN из README/V3 расходятся с текущим AGENTS.md, а системная тема исключена из интеграции. Эти проверки не отключены. system-theme, light-blue-palette и оставшиеся несовместимые части hardening не объединялись. Main и backup подтверждены на `c2d41efa81921c3dc8f43618c912bb82f32a489a`; push/deployment/production Supabase не выполнялись.
