# ADR 0005: Revision и идемпотентность редактирования подхода

- Статус: Принято в исходниках; hosted rollout не выполнен
- Дата: 2026-11-05

## Контекст

Создание entry уже имеет immutable operation snapshot. Но row/advisory lock не определяет, насколько свежий edit прислал клиент. Поздний edit или повтор после потерянного ответа мог затереть более новую правку.

## Решение

Добавить монотонную integer revision подхода и `edit_workout_entry_set` с expected revision и отдельным operation UUID. В одной транзакции проверяются владелец, прошлый результат operation, revision и payload; нормализованные поля проверяет существующая SQL-валидация. Точный повтор возвращает сохранённую result revision, не изменяя текущие sets. Изменённый payload того же UUID отклоняется. Старый update RPC без revision закрывается для `authenticated`, оставаясь внутренней реализацией проверки значений.

UI фиксирует revision при открытии редактора, сохраняет ввод при конфликте и не делает автоматических blind retries. При неизвестном сетевом результате сохраняется frozen operation в открытом редакторе; повтор использует тот же UUID/payload. Полноценное восстановление редактора истории после закрытия вкладки этим решением не добавляется.

## Последствия и выпуск

Нужна forward SQL migration. Старые browser clients не смогут редактировать подходы через прежний RPC; reads и create сохраняются. Перед выпуском нового клиента требуется отдельно разрешённая rehearsal и проверка установленной migration/ACL. На старой hosted базе новый клиент должен завершать edit ошибкой, без небезопасного fallback.

Ledger edit хранит персональный payload, изолирован правами/RLS и удаляется вместе с entry или Auth owner. Удаление подхода не позволяет позднему повтору создать его заново. Исторические create snapshots не меняются.

## Дополнение: Program PATCH (ARCH-002)

Forward migration `20261105030000_program_edit_revisions.sql` добавляет revisions дней и упражнений. Browser PATCH передаёт `revision=base+1`, фильтрует по base revision и проверяет подтверждённые ID/revision. Trigger сравнивает предложенную revision с актуальной строкой и отклоняет semantic update без CAS (40001), поэтому старый direct PATCH не может обойти клиентский predicate. Все UPDATE увеличивают revision. Position-only reorder остаётся доступен старым invoker RPC, также увеличивая revision; доверенные definer maintenance операции сохраняют работу. RLS и owner constraints не меняются.

Формы фиксируют revision при открытии, сохраняют ввод при конфликте/refetch, не подставляют новую revision автоматически. Перенос упражнения в другом окне не перемонтирует editor; rename draft дня хранится по ID даже при перемещении в архив. Для пересмотра новой версии нужно явно закрыть/отменить и снова открыть editor. Данные draft живут в памяти текущего компонента, не восстанавливаются после закрытия страницы.

Program PATCH не получает новый operation ledger: это условная замена, а не составная операция создания. После потери ответа повтор с прежней base revision безопасно даёт конфликт/ноль строк и не меняет новую версию. Он не выдаёт доказательство исхода предыдущего запроса: нужно сверить обновлённую строку; автоматического rebase/retry нет. Workout operation ledger и семантика create retry сохранены.

Нужно согласованное обновление hosted schema и клиентов. Старые program clients без revision теряют semantic update, сохраняя reads/create/reorder. Эта несовместимость требуется для закрытия unsafe write path. Пока migration не применена, новый клиент не использует fallback. Lifecycle удаления аккаунта остаётся отдельным продуктовым решением.

## Источники

`20261105010000_workout_set_edit_revisions.sql`, `src/lib/edit-workout-set.ts`, `HistorySetRow`, `scripts/release-integrity-db.test.mjs`, `src/lib/edit-workout-set.test.ts`.
