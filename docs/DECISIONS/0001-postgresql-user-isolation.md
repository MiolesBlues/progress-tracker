# ADR 0001: PostgreSQL-enforced user data isolation

- Status: Accepted
- Recorded: 4 November 2026

## Context

The application stores personal programs, exercises, workout entries, and template applications for multiple users in one PostgreSQL database. Browser-only checks do not protect data from direct requests.

## Decision

Use Supabase Auth for identity and PostgreSQL RLS/owner checks as the access boundary for personal data. Clients may add user-scoped filters, but those filters do not replace RLS. Any RPC using a privileged context must verify ownership and operation validity itself. A service-role helper must never enter a client bundle.

## Consequences

- Migrations must define policies and ownership constraints; changes require SQL tests.
- Client checks support UX but are not security controls.
- Local tests validate only the local model; hosted configuration must be checked separately.

## Evidence

`drizzle/migrations/`, `scripts/*db.test.mjs`, `src/integrations/supabase/client.ts`, and `src/integrations/supabase/client.server.ts`.
