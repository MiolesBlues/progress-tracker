# Progress Tracker

Progress Tracker is a browser-based strength-training log. Users can build a personal program with 1–7 active training days, define exercises and goals, record working sets, and review workout history and analytics.

Workout records include the date, working weight, repetitions for each set, optional RIR, and notes. An unfinished entry is saved locally per user and exercise so it can be restored on that device. This is not offline synchronization: sign-in and communication with the database require a network connection.

Archiving preserves history. Permanent deletion is a separate, opt-in action for archived objects and is guarded by database RPCs. Deleting a training day preserves its workout records; deleting an exercise also deletes its records. Account deletion is not implemented. See [archive and deletion guidance](docs/ARCHIVE-DELETION-RU.md) before changing this behavior.

The app supports English and Russian, Light/Dark/System themes, and responsive mobile layouts. It is built with React, TypeScript, TanStack Start/Router/Query, Tailwind CSS, and Supabase/PostgreSQL with row-level security. Current architecture details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local development

Use Node.js 24 and Bun 1.4.3, as pinned by the repository's toolchain checks and lockfile.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run dev
```

The browser client needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for a development Supabase project. Never put a service-role or other secret key in a `VITE_*` variable, browser code, or Git. See `.env.example` and [the database release contract](docs/DATABASE-RELEASE-CONTRACT-RU.md) for environment rules. Development configuration must not target production. Staging use in the Vite development server requires the explicit `ALLOW_STAGING_DEV=true` opt-in.

## Quality checks

```sh
bun run typecheck
bun run lint
bun run format:check
bun run test
bun run test:db
bun run test:toolchain
bun run build
bun run audit
bun run test:e2e
```

Run the exact scripts listed by `package.json`; some checks may require local browser or database dependencies. CI is defined in [`.github/workflows/quality.yml](.github/workflows/quality.yml). A passing workflow validates only the tested commit and configured test environment. It does not apply database migrations or prove the state of a hosted backend.

## Database and releases

SQL migrations in `drizzle/migrations/` define the database contract. Do not use `drizzle-kit push` for this project. Review the migration manifest, perform the documented read-only preflight, and follow an explicitly approved release procedure before applying migrations to any hosted project. Local migrations and tests do not prove that those migrations have been applied remotely.

For Supabase CLI commands, explicitly identify the target project and use the current CLI's local-versus-remote safeguards. Never run a remote migration or hosted configuration change as part of ordinary local development.

## Documentation

Project guidance and architecture documents are in `docs/`. Dated readiness, staging, security, and integration reports are historical evidence tied to their recorded date, commit, and environment; they are not live release-status dashboards.
