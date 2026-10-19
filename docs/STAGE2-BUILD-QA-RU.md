# Этап 2: C01, C04 и C05 — Build и QA

Дата: 16 октября 2026 года. Ветка: `fix/v2-release-hardening`. Исходный HEAD: `2e24e13940ada4c9fd3f36e58468cad299e20838`.

Исправления C02/C03/C06 сохранены. SQL-миграции, `program-manager.tsx`, `archive-delete-dialog.tsx` и `archive-deletion.ts` совпадают с предыдущим commit. Исходный `AUDIT-V3-RU.md` сохранён отдельно и не включён в commit этого этапа. Push, merge, deploy и production SQL не выполнялись.

## C01: причина и исправление

Generated/sync commit `2061582` вернул `bun.lock` v1 без объявленного в manifest родительского override; merge `efb4537` сохранил расхождение. Поэтому frozen install отклонял lockfile, toolchain проверка падала, а уязвимый `esbuild@0.18.20` вернулся через legacy loader Drizzle. Существовавший node_modules дополнительно содержал Lovable preset 2.25.3 вместо объявленного 2.26.5.

Lockfile восстановлен закреплённым Bun 1.4.3 через `bun install --lockfile-only --ignore-scripts`. Сохранены `rolldown: 1.2.1` и адресный `@esbuild-kit/core-utils → esbuild: 0.25.12`. Глобального override esbuild нет. [Bun использует lockfile v3 для вложенных overrides](https://bun.com/docs/pm/overrides).

Проверка module resolution выявила дополнительное расхождение: Vite 8.1.5 видел esbuild 0.25.12 при optional peer `^0.27.0 || ^0.28.0`. В devDependencies явно закреплён esbuild 0.28.2, уже присутствовавший в lockfile через tsx. Теперь Vite/tsx разрешают 0.28.2, а core-utils/Drizzle — отдельный 0.25.12. Toolchain tests проверяют оба пути, legacy transform/transformSync и загрузку Drizzle-конфига без БД.

Сравнение наборов разрешённых версий до/после: новых версий пакетов не добавлено; удалён esbuild 0.18.20 и его platform binaries. Массовый upgrade и audit fix --force не использовались.

| Пакет                                   | Фактически установленная версия |
| --------------------------------------- | ------------------------------- |
| Bun / Node                              | 1.4.3 / 24.14.0                 |
| Lovable preset                          | 2.26.5                          |
| Vite                                    | 8.1.5                           |
| TanStack Start / Router / Router plugin | 1.168.60 / 1.170.41 / 1.168.42  |
| Drizzle Kit / ORM                       | 0.31.11 / 0.45.4                |
| esbuild для Vite/tsx                    | 0.28.2                          |
| esbuild для core-utils/Drizzle          | 0.25.12                         |
| rolldown                                | 1.2.1                           |

Все 84 прямых пакета сверены с manifest/lockfile и реально установленными package.json. Для preset, Vite, TanStack и Drizzle проверены 19 установленных peer-ограничений и Node engines; несовпадений нет. [Снимок установленных версий и SHA-256](../../workout-stage2-2026-10-16/artifacts/dependency-versions.json), [peer checks](../../workout-stage2-2026-10-16/artifacts/peer-compatibility.log).

Финальная frozen-установка выполнена в новой `workout-stage2-2026-10-16/acceptance`, без node_modules, .env и .git, с новым пустым `final-empty-package-cache` и `--no-cache --ignore-scripts`. Установлено 547 пакетов за 93.12 с, exit 0. SHA-256 manifest и lockfile после установки совпадают с исходниками. Старый node_modules рабочего checkout сохранён в диагностическом каталоге; рабочий checkout также переустановлен и проходит проверку фактического resolution. Существующая установка не использовалась как доказательство clean install.

### Защита от повторной регрессии

- `check:dependencies` выполняется в CI до установки, использует только Node built-ins и закреплённый Bun. Проверяет версию Bun/lockfile, overrides, соответствие direct specs, esbuild и pinned preset.
- Fixture без node_modules подтверждает, что старый v1 и потерянный parent override отклоняются до установки.
- Frozen install сохранён; следующий CI шаг требует `git diff --exit-code -- package.json bun.lock`.
- ESLint запускается с `--max-warnings 0`. Правила и ignores не ослаблялись.
- Требования закреплены в AGENTS.md и документации зависимостей. Lifecycle hooks и собственный merge driver не добавлялись. Внешний Lovable sync может перезаписать файл; guard обнаружит это и остановит CI.

## C04: адресные исправления

`previewAuthStorage.ts`, `pending-rpc.ts` и `save-workout.ts` приведены к действующему Prettier; timer в preview storage объявлен const. `program-manager.tsx` уже отформатирован предыдущим этапом и повторно проходит проверки.

Девять Fast Refresh warnings устранены разделением словаря/hooks (`i18n.ts`) и компонента (`i18n-provider.tsx`). Импорты provider в root route и тестах обновлены. Сравнение исходников подтвердило неизменность словаря, hooks и тела provider при переносе. ESLint config, глобальные ignores и ts-ignore не добавлялись; массового форматирования нет.

## C05: актуальный E2E контракт

- На landing, входе и регистрации явно проверяется отсутствие Settings/Настройки; все четыре ширины проходят эти assertions.
- Настройки открываются после авторизации. RU→EN переключает диалог и страницу без reload; reload сохраняет EN; EN→RU также проверяется без reload.
- Английский Auth начинается с поддерживаемого `app:language:v1:guest = en`. Тест проходит UI регистрации, проверяет отправку signup, английский onboarding, Day A, Program и сохранение языка после reload.
- Дополнительно проверены logout, отсутствие Settings на Auth, повторный английский login, Workout и Program.
- Сохранены проверки архивной истории, пользовательских имён и независимого языка аккаунтов A/B. Шестерёнка в публичный UI не возвращалась, assertions не отключались.

## Финальные проверки

Проверки выполнены на финальном графе в чистой acceptance-копии. Промежуточные диагностики до исправления peer resolution, locator ошибок и подготовки production CSS не считаются итоговым результатом.

| Проверка                                      | Результат                                                        |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Clean frozen install, пустая директория/cache | PASS, 547 пакетов; manifest/lock не изменены                     |
| Dependency contract до установки              | PASS                                                             |
| Toolchain                                     | PASS, 6 тестов                                                   |
| Dependency audit                              | PASS, 0 vulnerabilities, проверено 597 пакетов                   |
| TypeScript                                    | PASS                                                             |
| ESLint                                        | PASS, 0 errors, 0 warnings                                       |
| Prettier, весь проект по действующему config  | PASS                                                             |
| Unit/component                                | PASS, 220 тестов / 20 файлов                                     |
| SQL/PGlite                                    | PASS, 42 теста                                                   |
| Native PostgreSQL 18.6                        | PASS, 10 проверок; новая синтетическая БД, кластер остановлен    |
| Chromium/WebKit E2E                           | PASS, 66/66 (Chromium 33, WebKit 33), 0 skipped/flaky, retries 0 |
| Production build                              | PASS, client/SSR/Nitro/Cloudflare, фиктивный env                 |

Мобильные размеры: 320, 375, 390, 430 px в Chromium и Playwright WebKit. Проверены отсутствие overflow, layout date/weight, модальные настройки, программа, архивы, записи, прогресс и тренировочные flows. Физический iPhone не использовался.

Выполнены все локальные gates workflow `quality.yml` на Windows/Node 24/Bun 1.4.3. Удалённый GitHub Actions job на Ubuntu — NOT RUN: push запрещён текущей задачей. Linux browser system dependency install не подменяется локальными Windows binaries. Итог относится к локальному выполнению полного набора проверок.

## Настоящий Supabase и изолированные проверки

В этом этапе настоящий Supabase не вызывался и не изменялся. Hosted JWT A/B, SMTP/email confirmation, Google OAuth и фактическое состояние production schema — NOT RUN; прежний аудит не используется как новое доказательство PASS.

E2E используют локальное приложение и mock HTTP `workout-e2e.invalid`, блокируя другие внешние запросы. Signup/login здесь проверяют настоящий UI приложения с мокированным Auth API. Unit/component используют mock client. SQL/PGlite и native PostgreSQL создают synthetic auth.uid()/roles и данные в изоляции; они проверяют RLS/ACL/FK/транзакции, но не подпись managed Supabase JWT. Native concurrency сценарии повторно подтвердили C03, UUID tombstone, сохранность истории и сериализацию save/delete на финальном dependency graph.

## Оставшиеся ограничения

C01/C04/C05 закрыты локально. C07 из аудита (accessibility/localization) в этот этап не входил. Миграция удаления из предыдущего этапа остаётся локальной; C02 gate сохраняется. Hosted staging acceptance, production environment, backup restore и физический iPhone не проверялись в этом этапе. Зелёный локальный pipeline не закрывает эти release gaps.

Работа ограничена этапом 2; переход к этапу 3 и rollout не выполнялись.

Логи: [диагностические артефакты](../../workout-stage2-2026-10-16/artifacts/). Основные: [final install](../../workout-stage2-2026-10-16/artifacts/final-clean-frozen-install.log), [toolchain](../../workout-stage2-2026-10-16/artifacts/final-test-toolchain.log), [unit](../../workout-stage2-2026-10-16/artifacts/final-test.log), [SQL](../../workout-stage2-2026-10-16/artifacts/final-test-db.log), [native](../../workout-stage2-2026-10-16/artifacts/final-native.log), [E2E](../../workout-stage2-2026-10-16/artifacts/final-e2e.log), [build](../../workout-stage2-2026-10-16/artifacts/final-build.log), [audit](../../workout-stage2-2026-10-16/artifacts/final-audit.log).
