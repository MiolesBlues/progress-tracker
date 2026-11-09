# Progress Tracker project context

> Source review date: 4 November 2026. This document describes the repository, not the current state of hosted Supabase or a production deployment. Verify behavior in source code and SQL before relying on it.

## Product

Progress Tracker is a personal strength-training log. A signed-in user creates a program from training days and exercises, records sets, and reviews performance over time. The interface supports English and Russian, Light/Dark/System themes, and responsive mobile layouts. It is a web application; no native iOS application or full offline synchronization is present in the repository.

Users can create a personal program with one to seven active days or optionally choose a published template. Registration does not automatically create a program. Training days and exercises can be ordered and archived. Workout history is kept when a day is archived or deleted; deleting an exercise also removes its own history through the dedicated deletion flow.

Workout entries include a date, exercise, optional note, and a list of sets. A set records position, weight, repetitions, optional RIR, working/warmup classification, and external/bodyweight load type. Legacy entry fields and snapshots remain for compatibility. A stable operation UUID makes save retries idempotent. Editing sets uses revisions and explicit conflict handling; the editor does not silently overwrite a newer edit.

Analytics provide weight, repetitions, and volume charts over 7/30/90/365-day or all-time ranges, and comparisons with the prior session and prior calendar week. A displayed best working set is scoped to a workout entry; it is not a global personal-record entity. Volume trends do not guarantee strength gains.

## Data and security

Supabase Auth provides identity. User-owned PostgreSQL rows carry `user_id`; RLS, owner checks, constraints, and transactional SQL functions enforce access and domain rules. Client-side user filters support correct query behavior but are not a security boundary. Never expose a service-role key through `VITE_*` variables or client bundles.

Archived-object permanent deletion is a separate opt-in behavior guarded by owner-checked RPCs. Account deletion is not implemented. Local source migrations and PGlite tests do not prove that the same schema or grants are installed on a hosted project.

The SQL migrations in `drizzle/migrations/` are the schema source of truth. `drizzle/schema.ts` is intentionally empty and Drizzle ORM is not used for runtime access. Do not use `drizzle-kit push`. Any hosted migration needs explicit authorization, target verification, read-only preflight, backup/recovery planning, and a rehearsal appropriate to the change.

## Runtime and local development

The stack uses React, TypeScript, TanStack Start/Router/Query, Vite, Tailwind CSS, and Supabase. The build targets a Cloudflare Worker module through Nitro, and Wrangler can run the built artifact locally. The repository does not contain a deployment workflow; this does not prove the app is not deployed elsewhere.

Use the pinned Node.js/Bun toolchain and committed lockfile. The standard local command is `bun run dev`; scripts are listed in `package.json`. The browser client needs a development Supabase URL and publishable key. Secret/service-role credentials must never use a `VITE_*` variable. The environment guard rejects production configuration in development; staging use with Vite requires explicit `ALLOW_STAGING_DEV=true`.

CI uses local mocks and synthetic `.invalid` endpoints. Unit, database, concurrency, build/security, worker-artifact, and Playwright checks provide repository-level evidence, not proof of hosted Auth/RLS configuration or deployment. A successful CI run applies only to its exact commit and completed checks.

## Current evidence versus historical reports

The codebase contains program management, exercise catalog/templates, per-set workout logging, idempotent save operations, revision-checked edits, analytics, auth, environment guards, and localized UI. Confirm current behavior in source, migrations, tests, and CI before making changes.

Readiness, staging, branch-integration, security, and phase reports in this repository are dated historical snapshots. Their outcomes apply to the recorded date, commit, and environment only; do not use them as current release status. Hosted database configuration, applied migrations, live Auth/RLS behavior, and actual deployment state remain unknown unless separately verified.

## Roadmap

The repository roadmap currently lists these open items without dates or priorities:

1. Move training-day controls into a dedicated mobile editor with a compact program summary.
2. Verify editor operations, automatic refresh, history preservation, and mobile layout.
3. Run available automated checks and review a production build without changing the database.

Confirm scope and priority with the product owner before expanding the roadmap.

## Useful references

- [Project README](../README.md)
- [Architecture](ARCHITECTURE.md)
- [Architecture decision records](DECISIONS/README.md)
- [Database release contract](DATABASE-RELEASE-CONTRACT.md)
- [Archive and deletion behavior](ARCHIVE-DELETION.md)
- [Application routes](../src/routes/README.md)
- [SQL migrations](../drizzle/migrations/)
- [Quality workflow](../.github/workflows/quality.yml)
- [Documentation index](README.md)
