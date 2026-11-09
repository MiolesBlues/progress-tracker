# Track A — Recovery infrastructure (historical report)

**Review date:** 20 October 2026. All local results below used synthetic data; they do not verify production recovery.

## Local tools

- Windows PowerShell 7.6.5; Bun 1.4.3; Node.js 24.14.
- PostgreSQL 17.11 client/server tools came from official EDB Windows binary ZIP. Bin path: `%LOCALAPPDATA%\ProgressTracker\track-a-recovery\pgsql17\pgsql\bin`; `psql`, `pg_dump`, `pg_restore`, `pg_ctl`, `postgres` were 17.11. ZIP SHA-256: `80379B2C04D51C30225532E0AE04509899141E9957ED096FE749D7FD9DF8F82F`, checked against EDB's published hash. ZIP binaries were not individually Authenticode-signed.
- A validly signed official EDB installer was checked; `--extract-only` did not produce the toolset. It did not run a system install or create a service.
- PostgreSQL 18.6 was already installed as separate Windows service `postgresql-x64-18`; it was not used or changed. Docker, WSL, and Supabase CLI were not found.
- C: had about 147 GiB free before local run. Automation now requires at least 1 GiB and fails if fixed port is occupied.

EDB describes official Windows installer/ZIP downloads in [PostgreSQL Windows documentation](https://www.postgresql.org/download/windows/) and [EDB binary downloads](https://www.enterprisedb.com/download-postgresql-binaries). Applied archive/published hash: [EDB installer issue #731](https://github.com/EnterpriseDB/edb-installers/issues/731).

## Isolated synthetic restore

Run with `scripts/recovery/Invoke-SyntheticRecovery.ps1`; target directory `%LOCALAPPDATA%\ProgressTracker\track-a-recovery\synthetic-track-a-10`.

- PostgreSQL 17.11; system identifier `7698847078948223796`; address `127.0.0.1:55432`; target DB `pt_synthetic_restore`, source synthetic DB `pt_synthetic_source`.
- Before creating target, script checks path uniqueness, free loopback port, and explicit confirmation text. Cluster binds only to loopback. Random local password is stored in ACL-limited `pgpass`, not report.
- Fake owner UUIDs `11111111-1111-4111-8111-111111111111` and `22222222-2222-4222-8222-222222222222`; synthetic workouts, repository local migrations, and separate `pg_dump` custom-format artifacts for public schema, public data, and minimal Auth dependency.
- Before/after restore row counts and MD5 of full legacy workout-entry set matched. Fingerprint reveals no rows and applies only to this local fixture.
- ACL migrations and V4 were then applied to restored synthetic copy. Result before test: 3 entries, 3 operations, 6 sets, 3 snapshots, 1 operation tombstone, 0 set tombstones. Five V4 RPCs passed structure/owner/RLS/FK/index/search_path/ACL checks. Synthetic tombstone retry was rejected; entry/operation counts remained `3|3`.
- RLS check returned 5 and 1 sets belonging to the respective users.
- Manifest SHA-256: `ab4b02ba24be981fce82f3ee45d79d538698f84729b5f45c0bc8e89f329edfdc`. Machine report: `%LOCALAPPDATA%\ProgressTracker\track-a-recovery\synthetic-track-a-10\report.json`; detailed log: adjacent `logs\synthetic-recovery.log`.
- Instance was left running only on loopback for inspection. Stop via `Stop-SyntheticRecovery.ps1 -TargetId synthetic-track-a-10 -ConfirmStop STOP_SYNTHETIC_TRACK_A_TARGET`. No deletion occurred; preview is available with `Remove-SyntheticRecovery.ps1 -WhatIf` plus explicit confirmations.

This demonstrates local synthetic dump/restore and local migration assertions only; it is **not** production backup, restore, or production-baseline rehearsal.

## Hosted backup and Supabase coverage

An authorized production backup artifact and approved safe storage/restore target were not available. No real-data export was attempted. Production ref `szdmzvsenrnjxgjgregf` and staging ref `fdzcwhzszbmpxyawrzzf` were not used as restore targets and were unchanged.

- Production backup acquisition: **BLOCKED** pending operator-approved export and protected storage.
- Production-baseline restore: **BLOCKED**; no permitted artifact or isolated Supabase-compatible target.
- PT-01 production-baseline V4 rehearsal: **BLOCKED**; completed V4 check was synthetic only.
- PT-08: local ACL assertions passed for checked objects/application owners on synthetic PG17. Managed `supabase_admin` privileges/defaults cannot be credibly simulated outside Supabase; that role was not impersonated.
- PT-13 canonical hosted preflight: not run; no approved least-privilege URL. Prior read-only inventory/contract did not replace current hosted preflight.

Ordinary PostgreSQL cluster does not reproduce managed Supabase components. Synthetic fixture lacked managed Auth/Storage services, object bytes, OAuth/provider config, project secrets, managed role defaults, publication/replication settings, and platform extensions. `auth.users` was a minimal RLS-test table, not Auth restore.

Supabase separately documents coverage of [automatic backups](https://supabase.com/docs/guides/platform/backups) and limits of [backup/restore during project migration](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Include them in operator plan.

After data owner authorizes export, provides verified TLS CA bundle, and allocates protected storage outside repo, an operator may run supplemental PostgreSQL dump from interactive PowerShell. `Read-Host` asks for non-secret username; `pg_dump -W` prompts for password without process arguments. Do not save URL/password in history. Directory must be approved encrypted media with defined retention.

```powershell
$pgBin = Join-Path $env:LOCALAPPDATA 'ProgressTracker\track-a-recovery\pgsql17\pgsql\bin'
$backupDir = 'D:\APPROVED_ENCRYPTED_BACKUP\progress-tracker'
$caFile = 'D:\APPROVED_CERTS\supabase-root.crt'
$dbUser = Read-Host 'Approved database username'
if (-not (Test-Path -LiteralPath $backupDir -PathType Container)) { throw 'Approved backup directory is missing' }
if (-not (Test-Path -LiteralPath $caFile -PathType Leaf)) { throw 'Verified CA bundle is missing' }
$dsn = "host=db.szdmzvsenrnjxgjgregf.supabase.co port=5432 dbname=postgres user=$dbUser sslmode=verify-full sslrootcert=$caFile"
$dump = Join-Path $backupDir 'progress-tracker-production.custom.dump'
& (Join-Path $pgBin 'pg_dump.exe') --password --format=custom --no-owner --no-privileges --verbose --file $dump --dbname $dsn
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed; quarantine partial artifact and investigate before retrying' }
Get-FileHash -Algorithm SHA256 -LiteralPath $dump
```

This is production database export only, not full Supabase disaster-recovery backup. It requires explicit written approval for personal data, approved backup account, CA/hostname validation, verified storage capacity/encryption/retention, and cleanup plan. `--no-owner --no-privileges` excludes global roles/ACL and requires separate owner/grant review; export without restore/tests is not a verified backup.

## Safe operator recovery sequence

1. Obtain production-export authorization and protected, access-restricted encrypted storage with retention; keep dumps out of Git/shared workdir.
2. Export from verified project ref with least-privilege process, store manifest/checksum, and separately document Auth/Storage/config/secrets coverage.
3. Create/approve a separate empty disposable Supabase-compatible target and record immutable identity. Do not use production, staging, or legacy ref.
4. Verify manifest/hash and destination identity before restore; stop on mismatch.
5. Restore and compare schema, rows, constraints, RLS, grants, RPC, legacy workouts, operation ledger, and tombstones. Only then repeat V4/ACL rehearsal.
6. Agree a separate maintenance window/approvals before hosted changes. This document itself does not authorize export or hosted mutation.

## Readiness

- Local tooling/synthetic recovery: **PASS**.
- Local synthetic V4 and ACL rehearsal: **PASS**, limited to listed components.
- Production recoverability and production-baseline rehearsal: **NO-GO / BLOCKED** pending authorized backup and isolated target.
- No hosted DB change, deployment, or remote migration in Track A.

## Track A checks

| Check                                                                                      | Recorded result                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                                            | PASS, 579 installs; lockfile unchanged                                                                                                                                                 |
| `bun run typecheck` / `bun run lint` / `bun run format:check`                              | PASS                                                                                                                                                                                   |
| `bun run test`                                                                             | PASS, 32 files / 304 tests                                                                                                                                                             |
| `bun run test:db`                                                                          | PASS, 63 tests including PGlite ACL, V4, tombstone, retry, RLS                                                                                                                         |
| `bun run test:toolchain`                                                                   | PASS, 20 tests including recovery guard assertions                                                                                                                                     |
| `bun run preflight:schema-contract`                                                        | PASS local contract; no hosted preflight                                                                                                                                               |
| `bun run check:dependencies`                                                               | PASS                                                                                                                                                                                   |
| `bun run build` with synthetic `*.invalid` URLs/test-only keys                             | PASS, Cloudflare Worker bundle generated                                                                                                                                               |
| `bun run check:client-bundle`                                                              | PASS, 40 public files; no secrets found                                                                                                                                                |
| `bun run smoke:runtime`                                                                    | PASS, `/`, `/auth`, manifest via local Wrangler                                                                                                                                        |
| `bun run test:e2e`                                                                         | 157 PASS, 5 SKIP, 0 FAIL; Chromium/WebKit, 18.8 min. Four WebKit-only responsive/theme duplicates skipped by explicit “run once in Chromium”; one WebKit touch drag used Chromium CDP. |
| `bun run audit`                                                                            | FAIL, one Moderate `GHSA-698v-4r3x-3vcv` in transitive `launch-editor` via Vite 8.1.5; dependencies not changed in Track A                                                             |
| Hosted backup/export, verified restore, production-baseline V4, canonical hosted preflight | BLOCKED; no authorized artifact, protected storage/restore target, or approved least-privilege URL                                                                                     |

`git diff --check` and Prettier on added/changed source/docs also passed before commit.
