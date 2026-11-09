# Phase 5B — Database recovery and migration readiness (historical report)

**Review date:** 20 October 2026. Production/staging requests in this phase were read-only; no migrations or hosted preflight ran. Database release status was **NO-GO** because full recovery was unverified and no isolated restore target without user data was provided.

## Git and evidence limits

Branch `phase5b/database-recovery` started from Phase 5A HEAD `fecbef59d212978836ccf3301bde1c4f2010834a`; Phase 3 (`96d8d7a2…`), Phase 4 (`2978591e…`), and Phase 5A ancestry were present. Earlier changes were preserved and hosted rows were not changed. The repository had SQL contracts and synthetic PGlite rehearsal tests; these are not production recovery. A 16 October restore report was marked `RESTORE NOT VERIFIED` after `supabase_vault`/`vault.secrets` failure. Its stopped instance must not be run or copied.

## Observed schema and project identity

Identity was checked against Supabase project metadata and URL, not only local config. The report recorded both projects active, PostgreSQL 17.11, and a Free plan.

| Capability                                              | Production `szdmzvsenrnjxgjgregf` | Staging `fdzcwhzszbmpxyawrzzf` |
| ------------------------------------------------------- | --------------------------------- | ------------------------------ |
| V4 `workout_entry_sets`, set tombstones, `set_snapshot` | Absent                            | Present                        |
| Five per-set RPCs                                       | Absent                            | Present                        |
| Library/template objects                                | Present                           | Present                        |
| Public tables with RLS                                  | All enabled                       | All enabled                    |
| Policies / custom public functions                      | 17 / 16                           | 18 / 24                        |
| Constraints / indexes                                   | 58 / 23                           | 69 / 28                        |
| Listed installed extensions, including `supabase_vault` | Matched                           | Matched                        |
| Storage buckets / object metadata rows                  | 0 / 0                             | 0 / 0                          |

Migration journal names/timestamps differed; staging had V4 under another timestamp. Compatibility was based on actual capability objects, not timestamps. Both environments had five known `NOT VALID` constraints; data rows were not extracted for this inventory.

At review time the read-only journal showed production migrations `20261015162555` revoke TRUNCATE, `20261015162607` guard new exercise day, `20261015162616` restrict workout grants, `20261016130756` archived deletion, and `20261016150000` training templates. Staging showed `20261016125453`/`20261016125644` restored backup baseline/ACL, `20261016130013` archived deletion, `20261016160651` template library, and `20261016212528` per-set V4.

### PT-08 observed ACL drift

Library tables in both hosted databases still had broad `anon` and `authenticated` privileges. `pg_default_acl` showed broad browser defaults for tables/sequences and function EXECUTE, owned by `postgres` and `supabase_admin`. Production `postgres` was not a member of `supabase_admin` (`pg_has_role` only). The prepared local migration revoked defaults for `postgres` but could not revoke `supabase_admin` defaults from an ordinary role. Hosted PT-08 was therefore **BLOCKED** and had to remain a release gate pending separately authorized remediation. Local preflight was corrected to inspect dangerous defaults for every object owner, not only `postgres`.

## Backup and restore

Before an authorized backup, the operator must record without publishing secrets: exact project ref/region/PostgreSQL version/UTC snapshot time/initiator/change ticket; backup type, schema scope, migration journal, object counts, and checksums of encrypted artifacts; included application `public`, required Auth tables/relationships, Storage metadata, and migration journal plus excluded platform schemas/reasons; DDL for tables/constraints/indexes/sequences/views/functions/triggers/RLS/policies/grants/default ACL/extensions/versions; external dependencies (Storage bytes, Auth/provider settings, SMTP/OAuth, Edge Functions, secrets, DNS/redirect URLs, integrations); and a new disposable restore target with compatible PostgreSQL/extensions, restricted access, and approved cleanup date.

Recorded status: full backup artifact and inventory access **BLOCKED/not provided**; restore into isolated environment **BLOCKED/no approved empty target** (staging and failed old restore could not be reused); post-restore row/schema comparison **BLOCKED**. Read-only Storage counts showed zero buckets/objects in both projects, but backup contract still had to treat object storage separately from SQL. Auth/provider config, custom role passwords, and secrets were unconfirmed and needed protected inventory.

Managed database backup does not cover all platform data: Storage object bytes are separate, as are provider/secrets and some external settings. Follow current [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) and [CLI backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) docs after checking plan/version limits.

A restore can PASS only after successful restore into an authorized isolated target with evidence: schema diff; table counts without exposing row contents; orphan/FK/CHECK checks; indexes/extensions; functions/triggers/RPC signatures; policies, RLS/FORCE RLS, effective grants/defaults; app reads with test accounts; auth without production provider; backup/restore timing and access logs. Unrestored external settings are separate gaps. A dump file or PGlite tests are insufficient. Project notes offered RPO/RTO as reference only; actual values were unmeasured and remain **unknown** until restore testing.

## PT-01 V4, PT-08, and PT-13 gates

- V4 migration is transactional and forward-only. Current PGlite tests modeled synthetic legacy schema, history preservation, per-set backfill, RPC, RLS, and partial failure/rollback.
- Phase 5B `bun run test:db` was acceptable local-contract evidence, not rehearsal on a restored production baseline. PT-01 restored-copy rehearsal was **BLOCKED** pending authorized full backup and successful restore.
- PT-08 migration locally checked library grants and `postgres` defaults; it did not change hosted state. The `supabase_admin` default ACL requires a DBA-compatible authorized procedure and read-only preflight.
- Supabase metadata reviewed included project identity, migration journal, tables/columns, RLS, policies, constraints, indexes, RPCs, extensions, and default ACL. Full `bun run preflight:release` could not run from checkout because approved least-privilege `RELEASE_DATABASE_URL` was unavailable; credentials were not extracted.
- Release contract required verifying current capability before releasing a client. If incomplete, stop release; do not compensate by adding a direct-table fallback. Staging already had V4 at the time; migrations must not be replayed. First agree PT-08 correction and inspect current capability.
- No new Phase 5A backend RPC was found in this phase's release contract.

After any V4 write, do not destructively roll back/drop set tables. Roll back the client if needed while preserving schema/per-set data; prefer a verified roll-forward. If a transaction outcome is uncertain, inspect actual transaction/capability state; do not manually execute migration fragments.

## Recorded checks

| Check                                                      | Status                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Git baseline/ancestry/branch                               | PASS — Phase 5B branch from expected Phase 5A HEAD                                  |
| Production/staging identity and read-only schema inventory | PASS                                                                                |
| Frozen install                                             | PASS — `bun install --frozen-lockfile`; lockfile unchanged                          |
| PGlite/SQL migrations                                      | PASS — `bun run test:db`, 61/61                                                     |
| Toolchain/release contracts                                | PASS — `bun run test:toolchain`, 14/14                                              |
| Application unit/component suite                           | PASS — `bun run test`, 304/304, 32 files                                            |
| TypeScript / ESLint / Prettier                             | PASS — `bun run typecheck`, `bun run lint`, `bun run format:check`                  |
| Local schema capability contract                           | PASS — `bun run preflight:schema-contract`; not live preflight                      |
| Canonical `preflight:release`                              | BLOCKED — no approved least-privilege DB URL                                        |
| Hosted backup and restore                                  | BLOCKED — unavailable/not authorized                                                |
| V4 on restored baseline                                    | BLOCKED — no verified restore                                                       |
| Hosted PT-08 ACL state                                     | BLOCKED/FAIL — broad library/default ACL observed; migration not applied            |
| PT-14 account deletion                                     | BLOCKED — retention policy not approved                                             |
| Production build                                           | BLOCKED — guard needs build-mode Supabase URL/publishable key; credentials not read |
| Production/staging mutation                                | NOT PERFORMED                                                                       |

## Decision

**Database GO: NO-GO.** Required gates: verified full restore; resolve production V4 gap; run canonical preflight; address broad `supabase_admin` defaults; approve account-retention policy. Human approvals required for controlled backup/restore with private-data handling, disposable restore target/minimal DB credentials, DBA ACL remediation for the actual owner, product retention decision, and any future hosted migration/deployment.
