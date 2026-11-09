# Phase 5B.1 — Recovery, ACLs, and V4 Rehearsal

> Historical report. Checked on 2026-10-20 for branch `phase5b1/recovery-acl-remediation`, based on `phase5b/database-recovery` at `cee802d694b249e5a8341c6a749f17378e6d50c0`. It records that phase's evidence and must not be read as current hosted-system status.

Hosted SQL access was read-only. No DDL, DML, Auth or Storage changes, migrations, backup export, or restore were performed.

## A. Git and scope

- Phase 5A commit `fecbef59d212978836ccf3301bde1c4f2010834a` and Phase 5B commits `17a5c66` and `cee802d` were confirmed as ancestors.
- The source worktree was clean. No new worktree was required and other worktrees were not changed.
- `.env` was not read or changed; no secret values were requested.
- Phase changes were intended for separate local commits. Push and merge were outside the phase scope.

## B. Project identity and backup evidence

Production ref `szdmzvsenrnjxgjgregf` and staging ref `fdzcwhzszbmpxyawrzzf` were cross-checked using Supabase project metadata, database host/ref, and `get_project`. In both SQL sessions, `current_database()` and `current_user` were `postgres`, and the server was PostgreSQL 17.11. Both projects reported `ACTIVE_HEALTHY` and PostgreSQL `17.11.0.003`; production was in `eu-west-1`, staging in `eu-central-1`. Organization metadata reported the Free plan. The refs matched the expected projects.

Legacy ref `jbxbgcqaywkbnsohjzcx` returned `permission denied`; its identity and schema were not confirmed, and no connection was made.

The read-only public-table inventory found:

- Production: `program_days`, `program_exercises`, `workout_entries`, `workout_entry_operations`, `workout_entry_operation_tombstones`, and five `training_*` catalog/template tables. `workout_entry_sets` and set tombstones were absent.
- Staging: the same application/template tables plus `workout_entry_sets` and `workout_entry_set_tombstones`.
- Both projects: `supabase_vault 0.3.1`, `uuid-ossp 1.1`, `pgcrypto 1.3`, `plpgsql 1.0`, and `pg_stat_statements 1.11`. Policy, constraint, index, and migration-journal counts are recorded in the [Phase 5B report](PHASE5B-DATABASE-RECOVERY.md).
- The V4 signatures checked were `save_workout_entry_sets(uuid, uuid, uuid, date, jsonb, text)`, `add_workout_entry_set(uuid, uuid, text, integer, text, text, text)`, `update_workout_entry_set(uuid, uuid, text, integer, text, text, text)`, `delete_workout_entry_set(uuid, uuid)`, and `reorder_workout_entry_sets(uuid, uuid[])`. The read-only inventory reported them absent in production and present in staging.

Within this checkout, `rg --files` found no original audit, backup dump, backup/restore report, or recovery script; only SQL preflight and migration tests were present. The local Supabase CLI, `psql`, `pg_dump`, and Docker CLI were unavailable. `.env` did not exist and was not tracked. The earlier restore was recorded as `RESTORE NOT VERIFIED` because of `supabase_vault` / `vault.secrets`; the stopped image was neither run nor copied.

The available Supabase connector supported reading project, migration, table, extension, and SQL metadata, but did not provide backup listing/download, PITR restore, or isolated restore. The Management API reported no project branches for production or staging. Supabase's then-current documentation stated that automatic daily backups are available on Pro, Team, and Enterprise, recommended `supabase db dump` for Free projects, and did not make Free backups downloadable from the dashboard. No managed backup artifact was verified. See [Database Backups](https://supabase.com/docs/guides/platform/backups) and the [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

| Backup component                         | Evidence in this phase                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Public schema/data and migration journal | Not exported. A logical backup requires an authorized read-only database URL and separate authorization to copy personal data. |
| Auth database dependencies               | May be part of a PostgreSQL export; email/OAuth providers, SMTP, redirects, and Auth secrets were not inventoried.             |
| Roles, grants, and default privileges    | `supabase db dump --role-only` can describe some roles. Managed roles/passwords require review and must not be copied blindly. |
| Functions, triggers, extensions          | Metadata only was inventoried; no dump was obtained.                                                                           |
| Storage metadata                         | Read-only aggregates showed 0 buckets and 0 object rows in both projects.                                                      |
| Storage object bytes                     | No bucket was found; SQL dumps do not include object bytes.                                                                    |
| External secrets/configuration/functions | Not obtained and not covered by a verified artifact.                                                                           |
| Checksum, size, format, creation time    | Not applicable; no candidate backup file was found.                                                                            |

Supabase's CLI backup procedure separates role, schema, and data dumps. Its documentation also calls out customizations to `auth`/`storage`, managed `supabase_admin`, custom-role passwords, and migration-journal restoration. A dump or backup file is not proof of a successful restore. See [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

### Operator procedure for a future backup

This is a procedure, not an executed backup. Prerequisites are written authorization for a production export containing user rows, an approved retention/deletion date and secure host, a least-privilege connection string delivered through a secret manager, encrypted restricted storage, and a review of expected load and size. Do not use a production restore endpoint; it interrupts project availability.

After approval, provide the source URL to the process environment as `PHASE5B_SOURCE_DB_URL` from the secret manager, not shell history or Git. In a protected isolated directory, use a Supabase CLI version checked against its official documentation:

```powershell
supabase db dump --db-url $env:PHASE5B_SOURCE_DB_URL -f roles.sql --role-only
supabase db dump --db-url $env:PHASE5B_SOURCE_DB_URL -f schema.sql
supabase db dump --db-url $env:PHASE5B_SOURCE_DB_URL -f data.sql --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
Get-FileHash roles.sql -Algorithm SHA256
Get-FileHash schema.sql -Algorithm SHA256
Get-FileHash data.sql -Algorithm SHA256
```

Decide whether to include `auth` and the migration journal under a separate restore contract. Do not blindly run examples that restore every role or disable triggers on managed schemas. Compare source DDL read-only and prepare an allowlist of managed Supabase objects. Record file sizes, checksums, CLI/PostgreSQL versions, date, source ref, exclusions, and custody. Keep dumps outside the repository, encrypted at rest, access-restricted, and subject to a deletion date.

For local artifact checks, prepare a `schemaVersion: 1` manifest with `source.projectRef`, `source.postgresVersion`, `createdAt`, `authorization.ticketId`, `authorization.approvedBy`, and an `artifacts` array containing relative `path`, `component`, `bytes`, and `sha256`. Record status and reason for each coverage item: `publicSchema`, `publicData`, `authDependencies`, `migrationHistory`, `rolesAndAcl`, `extensions`, `storageMetadata`, `storageBytes`, `authProviderConfig`, and `secretsAndExternalServices`. Validate it with `node scripts/verify-backup-manifest.mjs <manifest.json>`. The validator checks identity, approval, scope, byte counts, and SHA-256; it says nothing about completeness or restore success.

## C. Restore and recovery

No approved empty disposable target was available. Staging contained real application records and was prohibited as a target; production was prohibited; the legacy ref was unconfirmed. No Supabase branch/project was created because no target or approval was designated and provisioning may incur cost.

Destination identity, emptiness, ownership, engine/extensions, immutable project ID, and disposal procedure were therefore unverified. No restore command ran; row reconciliation, constraints, RPCs, RLS/ACLs, application queries, restore duration, RPO, and RTO were not measured.

Once a project owner verifies a new project's exact ref in the dashboard and confirms that it is an empty disposable target, the pre-restore guard expects process environment variables `PHASE5B_RESTORE_DATABASE_URL`, `PHASE5B_RESTORE_PROJECT_REF`, `PHASE5B_RESTORE_APPROVED_PROJECT_REF` (the same exact ref), `PHASE5B_RESTORE_TARGET_NAME=phase5b1-disposable`, and `PHASE5B_RESTORE_CONFIRM=I_APPROVE_EMPTY_DISPOSABLE_TARGET`, followed by `bun run verify:restore-target`. The script uses TLS and a read-only transaction, checks the URL ref, rejects production/staging/legacy, and checks for user public tables (excluding extension-owned tables), `auth.users`, and `storage.objects`. It never clears the target. Load variables from a secret manager outside shell history; the approval marker does not replace dashboard identity/emptiness checks.

**Restore: BLOCKED.** The project owner must provide or create a separately designated empty disposable Supabase project or compatible isolated PostgreSQL host, supply its ref/engine/extensions, confirm it contains no user data, and approve its disposal policy. Until then, do not run `psql --file` or a restore endpoint.

## D. PT-01 V4 rehearsal

The prior read-only inventory found no V4 schema in production and V4 in staging. Without a restore, production-baseline assertions and a backup snapshot were impossible. The production-baseline V4 rehearsal was therefore **BLOCKED**, not completed. Existing PGlite fixture tests are separate synthetic evidence: `bun run test:db` checked backfill/legacy preservation, RLS, retries, reapplication, and rollback on a synthetic schema; this is not a production restore.

On a restored copy, capture non-identifying count/hash aggregates and tables/ACL/RLS/RPC state before migration; apply exactly `20261016204330_per_set_workout_v4.sql` transactionally; reconcile entries, operation snapshots, sets, tombstones, weights, reps, RIR, notes, and dates without printing row contents; verify owner FKs, RLS/policies, indexes, and RPC signatures; then run read-only application compatibility checks. Test failure/retry only on a disposable copy. After the first V4 write, do not drop V4 objects as rollback; use a verified roll-forward or restore to a new disposable target.

## E. PT-08 ACLs and Supabase-managed `supabase_admin`

Read-only catalogs showed the same state in both projects:

- Existing application tables were owned and granted by `postgres`.
- Five `training_*` library tables effectively granted `SELECT, INSERT, UPDATE, DELETE` to `anon` and `authenticated`, granted by `postgres`. This was excessive. The local forward-only migration can remove those grants and retain `authenticated SELECT` plus explicit RPCs.
- `pg_default_acl` contained broad table, sequence, and function defaults for `postgres` and `supabase_admin`, each granted by the corresponding owner.
- `pg_has_role('postgres','supabase_admin','MEMBER')` and `USAGE` were false. Metadata showed `supabase_admin` as a managed role with the superuser bit. No role switch or privilege escalation was attempted.
- A migration running as `postgres` cannot change defaults granted by `supabase_admin`. Do not add membership in that role or copy/override the managed role.
- `snapshot_entry_day()` and `valid_workout_reps(integer[])` had `PUBLIC EXECUTE` and were callable by `anon`/`authenticated`; both were owned by `postgres` and were `SECURITY INVOKER`. `record_workout_entry_operation()` was already unavailable to browser roles and `PUBLIC`.

### Scoped release policy and remediation

`20261020100000_training_library_least_privilege.sql` is intentionally scoped: it removes application grants and defaults only for `postgres`, the app migration-path owner. `supabase_admin` defaults remain a managed-service exception, not authorization for application DDL.

The separate forward-only migration `20261020120000_public_helper_function_privileges.sql` revokes direct execution of trigger-only `snapshot_entry_day()` from `PUBLIC`, `anon`, and `authenticated`, and leaves `valid_workout_reps(integer[])` available only to `authenticated` for new constraint writes. A synthetic PGlite test confirmed authenticated calls and ordinary history writes still work while direct `anon`/`PUBLIC` execution is closed. Neither ACL migration was applied to hosted databases.

The release gate requires contract application tables/RPCs/helpers to be owned by `postgres`, effective browser grants and helper ACLs to match an allowlist, and broad `postgres` defaults to block release. `supabase_admin` defaults are inventoried read-only and reported explicitly, but do not alone fail release when the owner gate is satisfied. Any app object owned by `supabase_admin`, an unknown owner, or another deployment principal blocks release pending DBA review. Run app migrations only under the verified `postgres` role; never run DDL as a Supabase-managed role.

Hosted PT-08 remained **BLOCKED**: direct library grants and `postgres` defaults were not repaired. The scoped policy does not deem those existing ACLs acceptable; canonical preflight is required after an approved migration. Supabase documentation describes default grants for API roles and limits on managed roles; only the grantor/role with sufficient authority may change grants on objects owned by another role. See [Custom role inherits privileges](https://supabase.com/docs/guides/troubleshooting/custom-role-inherits-privileges-that-were-not-explicitly-granted-ddaa1c) and [Roles and superuser access](https://supabase.com/docs/guides/database/postgres/roles-superuser).

The shared read-only query [default-privileges-preflight.sql](../scripts/default-privileges-preflight.sql) reports owner, schema, object type, grantor, grantee, and privilege. Release preflight requires `postgres` ownership for contract tables/RPCs, fails closed for unknown owners, and does not attempt to change Supabase-managed defaults. `verify-backup-manifest.mjs` and `verify-restore-target.mjs` are also fail-closed; they make no changes and do not print connection strings.

## F. PT-13 canonical preflight

Expected production/staging project identities were checked with `get_project`; the unknown ref returned an access error. The official connector allowed catalog reads, but that was **not** canonical preflight. No approved `RELEASE_DATABASE_URL` was available, and no connection string was requested or created. `bun run preflight:release` therefore remained **BLOCKED** pending approved credentials.

Minimum database privileges are a connection and catalog `SELECT` on `pg_class`, `pg_namespace`, `pg_roles`, role membership, `pg_default_acl`, `pg_policy`, `pg_constraint`, `pg_proc`, `pg_index`, and `information_schema`; effective `has_*_privilege` checks; and read-only access to the migration journal and protected reconciliation flags. DDL/DML, role membership, service-role secrets, and Auth-user access are not needed. The canonical script requires TLS, `max: 1`, project-ref validation, and `SET TRANSACTION READ ONLY`; it does not repair the database.

After securely providing a URL from a secret manager, without placing it in command arguments/history, the operator can run:

```powershell
$env:SUPABASE_ENVIRONMENT = 'staging'
$env:SUPABASE_PROJECT_REF = 'fdzcwhzszbmpxyawrzzf'
# Load RELEASE_DATABASE_URL from the approved secret manager into the process environment.
bun run preflight:release
```

Repeat for `production` / `szdmzvsenrnjxgjgregf` only after the schema release contract and required recovery are satisfied. Preflight should exit non-zero while production lacks V4 or broad `postgres` defaults/effective grants remain.

For a post-migration gate on a separate disposable restore ref, `SUPABASE_ENVIRONMENT=recovery` is supported. Before running it, manually verify the exact project name/ref in the dashboard, then set `SUPABASE_PROJECT_REF`, `PHASE5B_RESTORE_APPROVED_PROJECT_REF`, `PHASE5B_RESTORE_TARGET_NAME=phase5b1-disposable`, `PHASE5B_RESTORE_CONFIRM=I_APPROVE_EMPTY_DISPOSABLE_TARGET`, and `RELEASE_DATABASE_URL` from the secret manager. `bun run preflight:release` rejects protected refs and URL/ref mismatches and always connects read-only. Recovery mode expects full V4 capability and is not a pre-migration checker.

On the approved restored copy, first run the supplemental legacy assertion file, then apply these migrations one at a time and transactionally, in this order: `20261020100000_training_library_least_privilege.sql`, `20261020120000_public_helper_function_privileges.sql`, `20261016204330_per_set_workout_v4.sql`. Use a preconfigured protected libpq service/passfile, without passing URL/password in arguments:

```powershell
psql -X 'service=phase5b1_restore' --set ON_ERROR_STOP=1 --file=scripts/release-schema-preflight.sql
psql -X 'service=phase5b1_restore' --set ON_ERROR_STOP=1 --file=drizzle/migrations/20261020100000_training_library_least_privilege.sql
psql -X 'service=phase5b1_restore' --set ON_ERROR_STOP=1 --file=drizzle/migrations/20261020120000_public_helper_function_privileges.sql
psql -X 'service=phase5b1_restore' --set ON_ERROR_STOP=1 --file=drizzle/migrations/20261016204330_per_set_workout_v4.sql
```

This is an instruction, not an executed procedure. Before restore, require a manifest with reconciliation baseline, verified restore, explicit DBA change approval, and a successful empty-target guard. `ON_ERROR_STOP` stops psql on failure; each migration has its own `BEGIN`/`COMMIT`. After successful migrations, canonical read-only `preflight:release` in `recovery` mode checks capability/ACLs. Until the first successful restore, count reconciliation and these assertions cannot be marked as a passed V4 rehearsal.

## G. Checks recorded for this phase

| Check                                 | Historical result                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Git baseline/branch ancestry          | PASS — branch based on `cee802d`; Phase 5A/5B commits were ancestors.                                |
| Backup artifact inventory in checkout | PASS — `rg --files` and migration/recovery scripts checked; no candidate artifact found.             |
| Project identity                      | PASS — production/staging independently verified; legacy ref BLOCKED by permission denial.           |
| Read-only ACL/default ACL inventory   | PASS — effective grants, owners, grantors, and role membership collected; hosted projects unchanged. |
| `bun install --frozen-lockfile`       | PASS — lockfile unchanged.                                                                           |
| `bun run test:db`                     | PASS — 63/63, including multi-owner ACL/helper regression and synthetic V4 rollback tests.           |
| `bun run test:toolchain`              | PASS — 17/17, including manifest/target-guard fixtures.                                              |
| `bun run test`                        | PASS — 304/304 across 32 files.                                                                      |
| TypeScript, ESLint, Prettier          | PASS.                                                                                                |
| `bun run preflight:schema-contract`   | PASS — local contract only.                                                                          |
| `bun run build`                       | PASS — `.invalid` CI-only URL and test publishable key.                                              |
| `bun run check:client-bundle`         | PASS — 40 files.                                                                                     |
| `bun run smoke:runtime`               | PASS — `/`, `/auth`, manifest through local Wrangler.                                                |
| `bun run audit`                       | PASS — 0 vulnerabilities across 649 packages.                                                        |
| `bun run test:e2e`                    | PASS — 157 passed, 5 skipped, 0 failed; Chromium and WebKit.                                         |
| Real backup manifest validation       | BLOCKED — no backup artifact; manifest tested only with a sanitized fixture.                         |
| `bun run verify:restore-target`       | BLOCKED — no approved project ref/URL/attestation; guard stopped before connecting.                  |
| `bun run preflight:release`           | BLOCKED — no approved least-privilege database URL.                                                  |
| Full restore / production-baseline V4 | BLOCKED — no approved empty destination or authorized data export.                                   |
| Canonical hosted `preflight:release`  | BLOCKED — no approved least-privilege database URL.                                                  |
| Hosted ACL repair                     | BLOCKED — hosted DDL was prohibited in this phase.                                                   |

The test/build results above describe that branch at that time; they do not imply remote database acceptance checks.

## H. GO/NO-GO and required operator actions

**Database GO: NO-GO.** Reasons: no authorized production backup artifact, no verified disposable restore target, no completed restore/reconciliation, PT-01 production-baseline rehearsal blocked, hosted PT-08 ACLs unrepaired, and PT-13 canonical preflight not run.

Minimum gates:

1. Product/data owner gives written authorization for a limited production personal-data export, sets retention/deletion date, and names an approved secure host.
2. Supabase owner provides an appropriate backup path/plan and approved read-only database credential, plus backup metadata/artifact or approval for a CLI dump. Install CLI/PostgreSQL tools on the approved host; deliver secrets outside chat and Git.
3. Owner creates a new empty disposable restore target, supplies its immutable ref and compatible version/extensions, confirms no user data, and approves cleanup.
4. DBA confirms the scoped PT-08 policy and separately authorizes a future migration/change window. Hosted changes are future work and were not performed in this phase.
5. Securely provide separate least-privilege staging/production URLs adequate for read-only catalog/contract assertions.

Backup/export/restore remain blocked until gates 1–3 are satisfied; hosted migration and release remain blocked until gates 4–5 are satisfied.
