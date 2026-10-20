[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^synthetic-track-a-[0-9]{2}$')]
  [string]$TargetId,

  [Parameter(Mandatory = $true)]
  [ValidateSet('CREATE_SYNTHETIC_TRACK_A_TARGET')]
  [string]$ConfirmTarget,

  [Parameter(Mandatory = $true)]
  [string]$PostgresBin
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$binRoot = (Resolve-Path $PostgresBin).Path
$targetRoot = Join-Path (Join-Path $env:LOCALAPPDATA 'ProgressTracker\track-a-recovery') $TargetId
$dataDirectory = Join-Path $targetRoot 'data'
$artifactDirectory = Join-Path $targetRoot 'artifacts'
$logDirectory = Join-Path $targetRoot 'logs'
$port = 55432
$adminRole = 'track_a_local_admin'
$sourceDatabase = 'pt_synthetic_source'
$restoreDatabase = 'pt_synthetic_restore'
$pgCtl = Join-Path $binRoot 'pg_ctl.exe'
$initDb = Join-Path $binRoot 'initdb.exe'
$psql = Join-Path $binRoot 'psql.exe'
$pgDump = Join-Path $binRoot 'pg_dump.exe'
$pgRestore = Join-Path $binRoot 'pg_restore.exe'
$postgres = Join-Path $binRoot 'postgres.exe'

foreach ($tool in @($pgCtl, $initDb, $psql, $pgDump, $pgRestore, $postgres)) {
  if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) { throw "Required PostgreSQL tool is missing: $tool" }
}
if (Test-Path -LiteralPath $targetRoot) { throw "Target already exists; refusing to overwrite: $targetRoot" }
$targetDrive = [IO.Path]::GetPathRoot($targetRoot)
$availableBytes = (Get-PSDrive -Name $targetDrive.Substring(0, 1) -ErrorAction Stop).Free
if ($availableBytes -lt 1GB) { throw 'At least 1 GiB of free space is required for the isolated synthetic recovery target.' }
$listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
if ($listener) { throw "Loopback restore port $port is already in use; refusing to select another server implicitly" }

New-Item -ItemType Directory -Path $artifactDirectory, $logDirectory | Out-Null
$logFile = Join-Path $logDirectory 'synthetic-recovery.log'
$instanceMarker = Join-Path $targetRoot 'INSTANCE.txt'
"targetId=$TargetId`nbindAddress=127.0.0.1`nport=$port`nstatus=initializing" | Set-Content -LiteralPath $instanceMarker -Encoding ascii
$secretBytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($secretBytes)
$password = [Convert]::ToHexString($secretBytes)
$passwordFile = Join-Path $targetRoot 'initdb-password.tmp'
$passFile = Join-Path $targetRoot 'local-admin.pgpass'
$password | Set-Content -LiteralPath $passwordFile -NoNewline -Encoding ascii
('127.0.0.1:{0}:*:{1}:{2}' -f $port, $adminRole, $password) | Set-Content -LiteralPath $passFile -NoNewline -Encoding ascii
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$targetAcl = & icacls.exe $targetRoot /inheritance:r /grant:r "$($identity):(OI)(CI)(F)" 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the local recovery directory ACL' }
$passAcl = & icacls.exe $passFile /inheritance:r /grant:r "$($identity):(R)" 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the local recovery password file ACL' }
$previousPgpassFile = $env:PGPASSFILE
$previousPgHost = $env:PGHOST
$previousPgPort = $env:PGPORT
$previousPgUser = $env:PGUSER
$env:PGPASSFILE = $passFile
$env:PGHOST = '127.0.0.1'
$env:PGPORT = [string]$port
$env:PGUSER = $adminRole

function Invoke-LoggedNative {
  param([string]$FilePath, [string[]]$Arguments)
  $output = & $FilePath @Arguments 2>&1
  $exitCode = $LASTEXITCODE
  if ($output) { $output | Out-File -LiteralPath $logFile -Append -Encoding utf8 }
  if ($exitCode -ne 0) { throw "PostgreSQL tool failed ($exitCode): $([IO.Path]::GetFileName($FilePath)); details in local log." }
  return @($output | ForEach-Object { [string]$_ })
}

function Write-RecoveryStep {
  param([string]$Step)
  $line = '{0:u} {1}' -f [DateTimeOffset]::Now, $Step
  Add-Content -LiteralPath $logFile -Value $line -Encoding utf8
  Write-Output $line
}

function Invoke-PgCtl {
  param([string[]]$Arguments)
  $commandLog = Join-Path $logDirectory 'pg_ctl.log'
  & $pgCtl @Arguments *> $commandLog
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    Get-Content -LiteralPath $commandLog | Add-Content -LiteralPath $logFile -Encoding utf8
    throw "pg_ctl failed ($exitCode); details in local log."
  }
}

function Invoke-LocalPsql {
  param([string]$Database, [string[]]$Arguments)
  Invoke-LoggedNative -FilePath $psql -Arguments (@('-X', '-w', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', [string]$port, '-U', $adminRole, '-d', $Database) + $Arguments)
}

$clusterStarted = $false
try {
  Write-RecoveryStep 'Initialize isolated cluster'
  Invoke-LoggedNative -FilePath $initDb -Arguments @('-D', $dataDirectory, '-U', $adminRole, '--encoding=UTF8', '--locale=C', '--auth-host=scram-sha-256', '--auth-local=scram-sha-256', "--pwfile=$passwordFile") | Out-Null
  Remove-Item -LiteralPath $passwordFile -Force
  Add-Content -LiteralPath (Join-Path $dataDirectory 'postgresql.conf') -Value "`nlisten_addresses = '127.0.0.1'`nport = $port`npassword_encryption = 'scram-sha-256'" -Encoding ascii
  Write-RecoveryStep 'Start loopback-only isolated PostgreSQL process'
  $serverStdout = Join-Path $logDirectory 'postgres.stdout.log'
  $serverStderr = Join-Path $logDirectory 'postgres.stderr.log'
  $postgresArguments = '-D "{0}" -h 127.0.0.1 -p {1}' -f $dataDirectory, $port
  $serverProcess = Start-Process -FilePath $postgres -ArgumentList $postgresArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $serverStdout -RedirectStandardError $serverStderr
  $clusterStarted = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $serverProcess.Refresh()
    if ($serverProcess.HasExited) { throw 'Isolated postgres.exe exited during startup; inspect the target-local stderr log.' }
    $boundListener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
      Where-Object { $_.OwningProcess -eq $serverProcess.Id -and $_.LocalAddress -eq '127.0.0.1' }
    if ($boundListener) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Isolated PostgreSQL did not open the expected loopback listener within 30 seconds.' }

  Write-RecoveryStep 'Verify database identity, version, system identifier and loopback address'
  $identityQuery = "SELECT current_database() || '|' || current_setting('server_version') || '|' || host(inet_server_addr()) || '|' || inet_server_port() || '|' || (SELECT system_identifier FROM pg_control_system()) FROM pg_catalog.pg_database WHERE datname=current_database()"
  $identityResult = (Invoke-LocalPsql -Database 'postgres' -Arguments @('-At', '-F', '|', '-c', $identityQuery)) -join ''
  $identityParts = $identityResult.Split('|')
  if ($identityParts.Count -ne 5 -or $identityParts[0] -ne 'postgres' -or $identityParts[2] -ne '127.0.0.1' -or $identityParts[3] -ne [string]$port) {
    throw 'Local database identity did not match the dedicated loopback target.'
  }
  $postgresVersion = $identityParts[1]
  "targetId=$TargetId`nbindAddress=127.0.0.1`nport=$port`nclusterSystemIdentifier=$($identityParts[4])`nstatus=running" | Set-Content -LiteralPath $instanceMarker -Encoding ascii

  Write-RecoveryStep 'Create only local synthetic roles and source/restore databases'
  $roleSetup = @'
CREATE ROLE postgres NOLOGIN SUPERUSER;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
'@
  Invoke-LocalPsql -Database 'postgres' -Arguments @('-c', $roleSetup) | Out-Null
  Invoke-LocalPsql -Database 'postgres' -Arguments @('-c', ('CREATE DATABASE {0};' -f $sourceDatabase)) | Out-Null
  Invoke-LocalPsql -Database 'postgres' -Arguments @('-c', ('CREATE DATABASE {0};' -f $restoreDatabase)) | Out-Null
  foreach ($database in @($sourceDatabase, $restoreDatabase)) {
    Invoke-LocalPsql -Database $database -Arguments @('-c', ('ALTER SCHEMA public OWNER TO postgres; GRANT CONNECT, CREATE, TEMP ON DATABASE {0} TO postgres;' -f $database)) | Out-Null
  }

  Write-RecoveryStep 'Build synthetic pre-V4 baseline from repository migrations'
  Invoke-LocalPsql -Database $sourceDatabase -Arguments @('-f', (Join-Path $PSScriptRoot 'synthetic-baseline.psql')) | Out-Null
  $beforeQuery = @'
SELECT 'auth.users|' || count(*) FROM auth.users
UNION ALL SELECT 'program_days|' || count(*) FROM public.program_days
UNION ALL SELECT 'program_exercises|' || count(*) FROM public.program_exercises
UNION ALL SELECT 'workout_entries|' || count(*) FROM public.workout_entries
UNION ALL SELECT 'workout_entry_operations|' || count(*) FROM public.workout_entry_operations
UNION ALL SELECT 'workout_entry_operation_tombstones|' || count(*) FROM public.workout_entry_operation_tombstones
ORDER BY 1
'@
  $sourceCounts = (Invoke-LocalPsql -Database $sourceDatabase -Arguments @('-At', '-c', $beforeQuery)) -join "`n"
  $sourceHashQuery = "SELECT md5(string_agg(to_jsonb(w)::text, E'\n' ORDER BY w.id)) FROM public.workout_entries w"
  $sourceLegacyHash = (Invoke-LocalPsql -Database $sourceDatabase -Arguments @('-At', '-c', $sourceHashQuery)) -join ''

  Write-RecoveryStep 'Create schema/data dumps and synthetic checksum manifest'
  Invoke-LoggedNative -FilePath $pgDump -Arguments @('-h', '127.0.0.1', '-p', [string]$port, '-U', $adminRole, '-d', $sourceDatabase, '--format=custom', '--no-owner', '--schema-only', '--schema=public', '--file', (Join-Path $artifactDirectory 'public-schema.dump')) | Out-Null
  Invoke-LoggedNative -FilePath $pgDump -Arguments @('-h', '127.0.0.1', '-p', [string]$port, '-U', $adminRole, '-d', $sourceDatabase, '--format=custom', '--no-owner', '--data-only', '--schema=public', '--file', (Join-Path $artifactDirectory 'public-data.dump')) | Out-Null
  Invoke-LoggedNative -FilePath $pgDump -Arguments @('-h', '127.0.0.1', '-p', [string]$port, '-U', $adminRole, '-d', $sourceDatabase, '--format=custom', '--no-owner', '--schema=auth', '--file', (Join-Path $artifactDirectory 'auth.dump')) | Out-Null
  Invoke-LoggedNative -FilePath 'node.exe' -Arguments @((Join-Path $repoRoot 'scripts/recovery/create-synthetic-manifest.mjs'), $artifactDirectory, $postgresVersion) | Out-Null
  Invoke-LoggedNative -FilePath 'node.exe' -Arguments @((Join-Path $repoRoot 'scripts/verify-backup-manifest.mjs'), (Join-Path $artifactDirectory 'manifest.json')) | Out-Null

  Write-RecoveryStep 'Restore into the separately initialized empty database and reconcile baseline'
  Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-c', 'DROP SCHEMA public;') | Out-Null
  Invoke-LoggedNative -FilePath $pgRestore -Arguments @('--exit-on-error', '--no-owner', '--role=postgres', '--dbname=pt_synthetic_restore', (Join-Path $artifactDirectory 'auth.dump')) | Out-Null
  Invoke-LoggedNative -FilePath $pgRestore -Arguments @('--exit-on-error', '--no-owner', '--role=postgres', '--dbname=pt_synthetic_restore', (Join-Path $artifactDirectory 'public-schema.dump')) | Out-Null
  Invoke-LoggedNative -FilePath $pgRestore -Arguments @('--exit-on-error', '--disable-triggers', '--no-owner', '--role=postgres', '--dbname=pt_synthetic_restore', (Join-Path $artifactDirectory 'public-data.dump')) | Out-Null

  $restoredCounts = (Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-At', '-c', $beforeQuery)) -join "`n"
  $restoredLegacyHash = (Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-At', '-c', $sourceHashQuery)) -join ''
  if ($sourceCounts -cne $restoredCounts -or $sourceLegacyHash -ne $restoredLegacyHash) { throw 'Pre-migration row counts or legacy-entry fingerprint differ after restore.' }

  foreach ($migration in @(
    '20261020100000_training_library_least_privilege.sql',
    '20261020120000_public_helper_function_privileges.sql',
    '20261016204330_per_set_workout_v4.sql'
  )) {
    $migrationPath = Join-Path $repoRoot "drizzle/migrations/$migration"
    Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-c', 'SET ROLE postgres', '-f', $migrationPath) | Out-Null
  }

  $postQuery = @'
SELECT (SELECT count(*) FROM public.workout_entries) || '|' ||
       (SELECT count(*) FROM public.workout_entry_operations) || '|' ||
       (SELECT count(*) FROM public.workout_entry_sets) || '|' ||
       (SELECT count(*) FROM public.workout_entry_operations WHERE set_snapshot IS NOT NULL) || '|' ||
       (SELECT count(*) FROM public.workout_entry_operation_tombstones) || '|' ||
       (SELECT count(*) FROM public.workout_entry_set_tombstones)
'@
  $postCounts = (Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-At', '-c', $postQuery)) -join ''
  if ($postCounts -ne '3|3|6|3|1|0') { throw "Post-migration integrity counts mismatch: $postCounts" }
  $postLegacyHash = (Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-At', '-c', $sourceHashQuery)) -join ''
  if ($sourceLegacyHash -ne $postLegacyHash) { throw 'V4 rehearsal changed legacy workout-entry rows.' }
  Write-RecoveryStep 'Verify V4 data preservation, five RPCs, ACL behavior and two-user RLS'

  $rpcQuery = @'
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
 'save_workout_entry_sets','add_workout_entry_set','update_workout_entry_set',
 'delete_workout_entry_set','reorder_workout_entry_sets')
'@
  $rpcCount = (Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-At', '-c', $rpcQuery)) -join ''
  if ($rpcCount -ne '5') { throw "Expected five V4 RPCs, found $rpcCount" }
  $aclQuery = @'
SELECT has_function_privilege('authenticated','public.save_workout_entry_sets(uuid,uuid,uuid,date,jsonb,text)','EXECUTE')
 AND NOT has_function_privilege('anon','public.save_workout_entry_sets(uuid,uuid,uuid,date,jsonb,text)','EXECUTE')
 AND has_function_privilege('authenticated','public.valid_workout_reps(integer[])','EXECUTE')
 AND NOT has_function_privilege('anon','public.valid_workout_reps(integer[])','EXECUTE')
'@
  $aclResult = (Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-At', '-c', $aclQuery)) -join ''
  if ($aclResult -ne 't') { throw 'Synthetic ACL/RPC privilege assertions failed.' }

  $ownerIsolation = @{}
  foreach ($userId in @('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')) {
    $query = "SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$userId',false); SELECT count(*) FROM public.workout_entry_sets;"
    $result = (Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-At', '-c', $query)) | Where-Object { $_ -match '^[0-9]+$' } | Select-Object -Last 1
    $ownerIsolation[$userId] = [int]$result
  }
  if ($ownerIsolation['11111111-1111-4111-8111-111111111111'] -ne 5 -or $ownerIsolation['22222222-2222-4222-8222-222222222222'] -ne 1) {
    throw 'RLS owner isolation counts do not match synthetic users.'
  }

  $testTombstone = @'
INSERT INTO public.workout_entry_set_tombstones(user_id, workout_entry_id, set_id)
VALUES ('11111111-1111-4111-8111-111111111111', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '77777777-7777-4777-8777-777777777777');
'@
  Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-c', $testTombstone) | Out-Null

  $tombstoneRetry = @'
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.save_workout_entry_sets(
      '66666666-6666-4666-8666-666666666666',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      DATE '2026-10-20',
      '[{"id":"77777777-7777-4777-8777-777777777777","position":1,"weight":"40","reps":5,"rir":null,"set_type":"working","load_type":"external"}]'::jsonb,
      'synthetic tombstone retry'
    );
    RAISE EXCEPTION 'set tombstone retry unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$test$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
DO $test$
BEGIN
  BEGIN
    PERFORM public.save_workout_entry_sets(
      '88888888-8888-4888-8888-888888888888',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      DATE '2026-10-20',
      '[{"id":"55555555-5555-4555-8555-555555555555","position":1,"weight":"30","reps":5,"rir":null,"set_type":"working","load_type":"external"}]'::jsonb,
      'synthetic operation tombstone retry'
    );
    RAISE EXCEPTION 'operation tombstone retry unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$test$;
RESET ROLE;
'@
  Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-c', $tombstoneRetry) | Out-Null

  $schemaAssertions = @'
SELECT
  (SELECT count(*) = 12 AND bool_and(pg_get_userbyid(c.relowner) = 'postgres')
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname = ANY(ARRAY[
     'program_days','program_exercises','workout_entries','workout_entry_operations',
     'workout_entry_operation_tombstones','workout_entry_sets','workout_entry_set_tombstones',
     'training_exercise_catalog','training_templates','training_template_days',
     'training_template_slots','training_template_applications']))
 AND (SELECT bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname = ANY(ARRAY[
     'program_days','program_exercises','workout_entries','workout_entry_operations',
     'workout_entry_operation_tombstones','workout_entry_sets','workout_entry_set_tombstones',
     'training_exercise_catalog','training_templates','training_template_days',
     'training_template_slots','training_template_applications']))
 AND (SELECT bool_and(c.relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname = ANY(ARRAY[
     'workout_entry_operations','workout_entry_operation_tombstones',
     'workout_entry_sets','workout_entry_set_tombstones']))
 AND to_regclass('public.workout_entry_sets_entry_order_idx') IS NOT NULL
 AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workout_entry_sets_entry_owner_fkey' AND convalidated)
 AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname='workout_entry_sets_entry_position_key' AND condeferrable)
 AND (SELECT count(*) = 5 AND bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=""'])
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname = ANY(ARRAY[
     'save_workout_entry_sets','add_workout_entry_set','update_workout_entry_set',
     'delete_workout_entry_set','reorder_workout_entry_sets']))
 AND has_table_privilege('authenticated','public.workout_entry_sets','SELECT')
 AND NOT has_table_privilege('authenticated','public.workout_entry_sets','INSERT')
 AND NOT has_table_privilege('anon','public.workout_entry_sets','SELECT')
 AND has_function_privilege('authenticated','public.save_workout_entry_sets(uuid,uuid,uuid,date,jsonb,text)','EXECUTE')
 AND NOT has_function_privilege('anon','public.save_workout_entry_sets(uuid,uuid,uuid,date,jsonb,text)','EXECUTE')
 AND has_function_privilege('authenticated','public.valid_workout_reps(integer[])','EXECUTE')
 AND NOT has_function_privilege('anon','public.valid_workout_reps(integer[])','EXECUTE')
'@
  $schemaAssertionResult = (Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-At', '-c', $schemaAssertions)) -join ''
  if ($schemaAssertionResult -ne 't') { throw 'Post-restore owner, RLS, FK, index, SECURITY DEFINER or ACL assertions failed.' }
  $finalCounts = (Invoke-LocalPsql -Database $restoreDatabase -Arguments @('-At', '-F', '|', '-c', 'SELECT (SELECT count(*) FROM public.workout_entries) || ''|'' || (SELECT count(*) FROM public.workout_entry_operations) || ''|'' || (SELECT count(*) FROM public.workout_entry_set_tombstones)')) -join ''
  if ($finalCounts -ne '3|3|1') { throw 'Tombstone retry altered synthetic workout entries or operations.' }

  $manifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $artifactDirectory 'manifest.json')).Hash.ToLowerInvariant()
  $report = [ordered]@{
    targetId = $TargetId
    clusterSystemIdentifier = $identityParts[4]
    postgresVersion = $postgresVersion
    bindAddress = '127.0.0.1'
    port = $port
    sourceDatabase = $sourceDatabase
    restoredDatabase = $restoreDatabase
    sourceAndRestoreCountsMatch = $true
    legacyEntryFingerprintPreservedThroughV4 = $true
    postV4Counts = $postCounts
    v4RpcCount = [int]$rpcCount
    aclAssertions = 'PASS'
    schemaAssertions = 'PASS'
    rlsVisibleSetCounts = $ownerIsolation
    syntheticSetTombstoneInserted = $true
    operationAndSetTombstoneRetriesRejected = $true
    manifestSha256 = $manifestHash
    productionBackup = $false
    productionBaselineV4Rehearsal = $false
    cleanup = 'Use scripts/recovery/Stop-SyntheticRecovery.ps1 with exact target ID and confirmation. Do not delete before approved retention.'
  }
  $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $targetRoot 'report.json') -Encoding utf8
  Write-Output "Synthetic dump/restore and synthetic V4 rehearsal PASS. PostgreSQL $postgresVersion; loopback port $port; manifest SHA-256 $manifestHash. This is not production recovery."
}
catch {
  $_ | Out-String | Add-Content -LiteralPath $logFile -Encoding utf8
  if (Test-Path -LiteralPath $instanceMarker) { (Get-Content $instanceMarker -Raw) -replace 'status=\w+', 'status=failed' | Set-Content -LiteralPath $instanceMarker -Encoding ascii }
  if ($clusterStarted) {
    try { Invoke-PgCtl -Arguments @('stop', '-D', $dataDirectory, '-m', 'fast', '-w') } catch { }
  }
  Write-Error 'Synthetic recovery failed. Review the local sanitized log; no production or staging database was used.'
  throw
}
finally {
  $env:PGPASSFILE = $previousPgpassFile
  $env:PGHOST = $previousPgHost
  $env:PGPORT = $previousPgPort
  $env:PGUSER = $previousPgUser
  if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile -Force }
}
