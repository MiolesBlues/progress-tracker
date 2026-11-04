# Progress Tracker — топология Git

Дата сверки: 2026-10-30. Репозиторий: `https://github.com/MiolesBlues/progress-tracker.git`.

## Каноническая линия

| Роль                                                 | Ветка / SHA                                                           | Родитель / положение                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Защищённая main                                      | `main` — `2bddc62fe82f6672a9ab1b15c671bc196911d90d`                   | Общий предок ранних веток; не изменялась                                                       |
| Полная проверенная интеграция Phase 1–5B.1 и Track A | `fix/dev-staging-opt-in` — `db07b889b55d42501872ae303fcb70bbb735c7d0` | Потомок Track A `a98b069`; все указанные этапы являются предками                               |
| Канонический кандидат                                | `integration/canonical-release-candidate` — текущий HEAD              | От `db07b88`: `760252d` удаляет вложенный snapshot; последующие commits содержат только отчёты |

Новый linked worktree: `C:\Users\vitvl\Code\progress-tracker`. Он создан рядом с имеющимися копиями и не заменял их. Все исходные worktrees остались зарегистрированы. Локальный `main` и существующие `origin/*` не переключались.

Проверены ancestry для `phase4/product-hardening` (`2978591`), `phase5a/functional-integrity` (`fecbef5`), `phase5b1/recovery-acl-remediation` (`15cad66`), `track-a/recovery-infrastructure` (`a98b069`) и `fix/dev-staging-opt-in` (`db07b88`): все — предки кандидата.

## GitHub и расхождение

Read-only fetch актуального remote выполнен в отдельное пространство `refs/remotes/recovery-20261030/*`; существующие remote refs не перезаписывались. Проверен canonical URL GitHub. До fetch известная интегрированная вершина `db07b88` совпадала с GitHub `fix/dev-staging-opt-in`. Сейчас в общем хранилище: 30 локальных веток (29 исходных + новый кандидат), 29 исходных `origin` веток и 29 свежих `recovery-20261030` веток. Различие `fix/v2-release-hardening` подтверждено: локальная вершина `15b5945`, GitHub — `5ba4f3d`; локальная линия на 4 commit впереди и 9 позади удалённой.

Обе стороны расхождения сохранены: исходная локальная ветка и `refs/remotes/origin/fix/v2-release-hardening`, а дополнительный свежий remote tip — `refs/remotes/recovery-20261030/fix/v2-release-hardening`. Не применялись merge, rebase, force push и переписывание истории.

## Сохранность истории

- Исходные 29 локальных branch refs не удалялись и не перемещались.
- Remote metadata fetch добавил отдельный namespace refs.
- Snapshot `C:\Users\vitvl\ProgressTracker-Recovery\snapshot-20261030` содержит `all-refs.bundle`; manifest/report фиксируют 339 052 SHA-проверенных файла и 0 ошибок. Восстановление sample worktree из bundle дало точное совпадение 36 строк Git status.
- `git fsck --no-reflogs --unreachable` не показал unreachable commit объектов; имеются только неиспользуемые tree/blob объекты.
- Stash `refs/stash` сохранён. Его восстановление из bundle ранее проверено отдельным fetch.

## Изменения рабочего состояния

Исходный основной clone `C:\Users\vitvl\Code\project-c7efcdd9-ad98-4274-8b6f-fd8abfebd574` оставлен с прежним состоянием: изменённый `.env` и untracked вложенная папка сохранены. Грязные worktrees не модифицировались. В новом worktree `.env` не входит в Git; исходная интеграционная ветка `db07b88` содержала только tracked приложение и не содержала корневой `.env`.
