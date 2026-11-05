# ADR 0006: Compare-and-swap для редактирования программы

- Статус: Принято в исходниках; hosted rollout не выполнен
- Дата: 2026-11-05

## Контекст

Обычный PATCH дня или упражнения не имел признака свежести. Блокировка строки сериализовала изменения, но позволяла форме с устаревшими данными затереть более новую правку. ADR 0005 сохраняет самостоятельное решение для подходов и не заменяется этим ADR.

## Решение и последствия

Forward migration `20261105030000_program_edit_revisions.sql` добавляет revisions дней и упражнений. Browser PATCH передаёт `revision=base+1`, фильтрует по base revision и проверяет подтверждённые ID/revision. Trigger сравнивает предложенную revision с актуальной строкой и отклоняет semantic update без CAS (40001), поэтому старый direct PATCH не может обойти клиентский predicate. Все UPDATE увеличивают revision. Position-only reorder остаётся доступен старым invoker RPC, также увеличивая revision; доверенные definer maintenance операции сохраняют работу. RLS и owner constraints не меняются.

Формы фиксируют revision при открытии, сохраняют ввод при конфликте/refetch, не подставляют новую revision автоматически. Перенос упражнения в другом окне не перемонтирует editor; rename draft дня хранится по ID даже при перемещении в архив. Для пересмотра новой версии нужно явно закрыть/отменить и снова открыть editor. Данные draft живут в памяти текущего компонента, не восстанавливаются после закрытия страницы.

Program PATCH не получает новый operation ledger: это условная замена, а не составная операция создания. После потери ответа повтор с прежней base revision безопасно даёт конфликт/ноль строк и не меняет новую версию. Он не выдаёт доказательство исхода предыдущего запроса: нужно сверить обновлённую строку; автоматического rebase/retry нет. Workout operation ledger и семантика create retry сохранены.

Нужно согласованное обновление hosted schema и клиентов. Старые program clients без revision теряют semantic update, сохраняя reads/create/reorder. Эта несовместимость требуется для закрытия unsafe write path. Пока migration не применена, новый клиент не использует fallback. Lifecycle удаления аккаунта остаётся отдельным продуктовым решением.

## Источники

`20261105030000_program_edit_revisions.sql`, `src/components/program-manager.tsx`, `src/lib/queries.ts`, `scripts/release-integrity-db.test.mjs`, `scripts/postgres-concurrency.test.mjs`, `src/components/program-manager.test.tsx`.
