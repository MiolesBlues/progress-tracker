[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^synthetic-track-a-[0-9]{2}$')]
  [string]$TargetId,

  [Parameter(Mandatory = $true)]
  [ValidateSet('STOP_SYNTHETIC_TRACK_A_TARGET')]
  [string]$ConfirmStop,

  [Parameter(Mandatory = $true)]
  [string]$PostgresBin
)

$ErrorActionPreference = 'Stop'
$targetRoot = Join-Path (Join-Path $env:LOCALAPPDATA 'ProgressTracker\track-a-recovery') $TargetId
$targetRoot = (Resolve-Path -LiteralPath $targetRoot).Path
$expectedParent = (Resolve-Path (Join-Path $env:LOCALAPPDATA 'ProgressTracker\track-a-recovery')).Path
if (-not $targetRoot.StartsWith($expectedParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Target path is outside the dedicated local recovery directory.'
}
$instanceFile = Join-Path $targetRoot 'INSTANCE.txt'
if (-not (Test-Path -LiteralPath $instanceFile)) { throw 'Target identity marker is missing.' }
$marker = Get-Content -LiteralPath $instanceFile -Raw
foreach ($expected in @("targetId=$TargetId", 'bindAddress=127.0.0.1', 'port=55432')) {
  if ($marker -notmatch [regex]::Escape($expected)) { throw 'Target identity marker does not match the requested instance.' }
}
$dataDirectory = Join-Path $targetRoot 'data'
$pidFile = Join-Path $dataDirectory 'postmaster.pid'
if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Output "Target $TargetId is already stopped. No files were removed."
  exit 0
}
$expectedPid = [int](Get-Content -LiteralPath $pidFile -TotalCount 1)
$listener = Get-NetTCPConnection -State Listen -LocalPort 55432 -ErrorAction SilentlyContinue
if ($listener -and @($listener | Where-Object { $_.OwningProcess -eq $expectedPid }).Count -eq 0) {
  throw 'Port 55432 belongs to another process; refusing to stop any server.'
}
$pgCtl = Join-Path (Resolve-Path $PostgresBin).Path 'pg_ctl.exe'
if (-not (Test-Path -LiteralPath $pgCtl)) { throw 'pg_ctl.exe is missing from the selected PostgreSQL tool directory.' }
$output = & $pgCtl -D $dataDirectory -m fast -w stop 2>&1
$code = $LASTEXITCODE
if ($output) { $output | ForEach-Object { Write-Output $_ } }
if ($code -ne 0) { throw "pg_ctl stop failed with exit code $code." }
Write-Output "Stopped only the verified loopback synthetic target $TargetId. Files and backup artifacts were retained."
