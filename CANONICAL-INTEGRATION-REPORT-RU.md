# Progress Tracker — отчёт канонической интеграции

Дата: 2026-10-30. Это локальный кандидат для последующего review; он не объединён с `main` и не отправлен на GitHub.

## A. Git state

- Рабочая ветка: `integration/canonical-release-candidate`.
- HEAD: `31f5598` — `docs: record canonical branch integration decisions`.
- Предыдущий commit `760252d` убрал nested snapshot; его родитель — проверенная интеграция `db07b889b55d42501872ae303fcb70bbb735c7d0` (`fix/dev-staging-opt-in`).
- Весь Phase 1–5B.1/Track A набор является предком нового HEAD.
- Новый worktree: `C:\Users\vitvl\Code\progress-tracker`.
- Исходные 12 worktrees, 29 исходных local branch refs, stash и remote refs сохранены. Dirty исходные копии не очищались.
- Ветка `main` осталась на `2bddc62`; merge/push не выполнялись.
- В tracked tree кандидата нет `.env` и нет каталога `progress-tracker-final-main-merge-20261019/`.

## B. Топология и выбор базы

`db07b88` стоит после `b6bb699` (явный staging opt-in). Перед ним присутствуют все фазовые commits до Track A. Сравнение root tree `b6bb699` и `db07b88`, исключая добавленный вложенный путь, не показало других изменений. Вложенный путь включал 175 файлов и 24 642 добавленных строк; 140 файлов совпадали с корневыми файлами, 34 были копиями более старого кода, один файл `src/lib/error-capture.ts` содержал прежний небезопасный process-global коррелятор. В текущей корневой реализации request error handling заменён generic request-local подходом. Поиск env/secret-подобных имён в снимке не нашёл таких файлов; значения файлов не печатались.

Удаление вложенной копии записано обычным дочерним commit `760252d`. Исторический `db07b88` и все исходные refs сохранены, история не переписывалась. Path-only проверка не нашла `.env`/env-подобных файлов или известных форм credential-токенов внутри snapshot; heuristic-проверка не является доказательством отсутствия любых секретов.

Проверены 29 локальных исходных веток и соответствующие remote refs; branch-by-branch решение приведено в [матрице интеграции](BRANCH-INTEGRATION-MATRIX-RU.md). Известное расхождение `fix/v2-release-hardening` остаётся без merge: local `15b5945` — +4/−9 относительно GitHub `5ba4f3d`. Обе линии доступны через исходные refs, отдельный recovery fetch namespace и preservation bundle. Новый кандидат не включает их как ancestry.

## C. Функциональная интеграция

В кандидате сохранены поведенческие фиксы:

- PT-02/03/04: UUID lifecycle, complete-set pagination и multi-tab draft handling.
- PT-07/11/15/16: retry-safe program creation, account-switch guards, локализация, точные analytics/weight sorting.
- PT-01/06/08/13: V4, environment identity, ACL contracts и schema release preflight.
- PT-05/09/17/20: Wrangler runtime, доступность, ранняя установка темы и SSR error isolation.
- Track A: synthetic recovery и fail-closed restore guards.

UI-ветки не cherry-pick-ались целиком: проверки их нужных сценариев уже присутствуют в текущем tree. История `compact-workout-logs` в её окончательном tip сама отменила accordion-компактную таблицу предыдущей тренировки; эта экспериментальная версия не перенесена.

## D. Preservation и исходные данные

Проверенный snapshot в `C:\Users\vitvl\ProgressTracker-Recovery\snapshot-20261030`: 339 052 проверенных SHA-256 файлов, 0 hash failures; complete Git bundle на 72 refs. Предыдущая sample restore проверка восстановила грязную копию с точным HEAD и совпавшим Git status (36 строк). Snapshot находится вне репозитория; доступ ограничен ACL владельца и SYSTEM. Шифрование диска не подтверждено.

Первичный clone остался dirty (`.env` modified и untracked вложенная папка); worktree `fix/pt-01-06-08-13` также остался dirty. Их состояние присутствовало в preservation snapshot и здесь не менялось. Все остальные исходники сохранены на местах. Никакие пользовательские файлы не переносились и не удалялись.

## E. Проверки

Новые выполнения в canonical worktree после `bun install --frozen-lockfile` (Bun 1.4.3):

| Проверка                            | Результат                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`     | PASS, 573 packages                                                            |
| `bun run typecheck`                 | PASS                                                                          |
| `bun run lint`                      | PASS                                                                          |
| `bun run format:check`              | PASS после форматирования отчётов                                             |
| `bun run test`                      | PASS, 32 files / 312 tests                                                    |
| `bun run test:db`                   | PASS, 63 tests                                                                |
| `bun run test:toolchain`            | PASS, 21 tests                                                                |
| `bun run preflight:schema-contract` | PASS, local contract                                                          |
| `bun run check:dependencies`        | PASS                                                                          |
| `bun run audit`                     | FAIL: 18 advisory findings (6 high, 11 moderate, 1 low); см. ограничения      |
| `bun run build`                     | PASS с безопасными `test` project refs/URLs, без `.env`                       |
| `bun run check:client-bundle`       | PASS, 40 файлов                                                               |
| `bun run smoke:runtime`             | PASS: `/`, `/auth`, manifest через локальный Wrangler                         |
| `bun run test:e2e`                  | PASS, 157 / 162; 5 ожидаемых SKIP, 0 failures, Chromium + WebKit, 20.1 минуты |

Hosted schema preflight намеренно не запускался: он проверяет реальный endpoint и не нужен для проверки локальной консолидации. Hosted DB, staging, production и Auth не менялись.

## F. Остаточные риски и release gate

`bun audit` сообщил 18 findings: high advisory для цепочки `undici` и `zod`, а также moderate/high для `@vitest/mocker`, `vite` и других transitives. Версии из текущего frozen lockfile намеренно не изменялись в задаче интеграции; release candidate не следует считать готовым к production, пока зависимости не обновлены и suite не пройден заново.

`fix/v2-release-hardening` расходится, но его уникальная template-library реализация совпадает с кодом кандидата; удалённые изменения с фиксированным backend и упрощённой обработкой pending operations несовместимы с нынешней защитой. Оригинальная история сохранена. Ветка `feature/light-blue-palette` оставлена как визуальный вариант, без переноса палитры.

## G. Итог

Git-кандидат **PASS для консолидации фазовой интеграции и сохранения истории**: полный E2E завершён с 157 PASS / 5 ожидаемых SKIP / 0 failures. **NO-GO для merge в main/production release на текущем evidence**: нужно устранить dependency advisories, повторить suite после обновления и провести отдельный review уникальной палитры. Никаких hosted действий для этого кандидата не выполнялось.
