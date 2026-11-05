# Безопасность ручного schema gate

`release-schema-preflight.yml` запускает hosted проверку только вручную с ref `main`. Для PR, feature ref, push или reusable workflow job не получает DB URL и не запускается. Полный synthetic regression остаётся в `quality.yml` и не использует hosted credentials.

Actions закреплены по полным SHA, сверенным 2026-11-05 с официальными GitHub tag refs:

| Action             | Tag    | Commit                                   |
| ------------------ | ------ | ---------------------------------------- |
| actions/checkout   | v6.1.0 | d23441a48e516b6c34aea4fa41551a30e30af803 |
| actions/setup-node | v7.1.0 | 949feb2413d6458794dcd2491c4babbbce0c15c1 |
| oven-sh/setup-bun  | v2.2.0 | 0c5077e51419868618aeaa5fe8019c62421857d6 |

Источник каждого pin — `https://api.github.com/repos/<owner>/<repo>/git/ref/tags/<tag>`, object type `commit`, SHA совпадает. Это фиксирует происхождение выбранной версии; проверка исходников action не является полной сертификацией dependency supply chain.

GitHub token имеет только `contents: read`; checkout не сохраняет credentials. Node, Bun и runner согласованы с quality workflow. Установка использует frozen lockfile и `--ignore-scripts`. DB URL передаётся только шагу read-only preflight, а не setup/install.

Ограничения: step-scoping уменьшает доступ к secret, но не изолирует шаг от уже скомпрометированного общего runner. Проверенный immutable action pin нужен отдельно. Read-only транзакция скрипта также не превращает административный credential в роль с ограниченными правами.

Перед отдельным разрешённым hosted запуском владелец должен подтвердить least-privilege DB role и защиту доступа к main/workflow dispatch/secrets. Фактические privileges secret URL и GitHub environment protection здесь не проверялись и не менялись. Сам schema workflow во время remediation не запускался; production/staging остаются UNKNOWN.
