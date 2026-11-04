[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^synthetic-track-a-[0-9]{2}$')]
  [string]$TargetId,

  [Parameter(Mandatory = $true)]
  [ValidateSet('REMOVE_SYNTHETIC_TRACK_A_TARGET')]
  [string]$ConfirmRemoval,

  [Parameter(Mandatory = $true)]
  [switch]$RemoveLocalTarget,

  [Parameter(Mandatory = $true)]
  [string]$PostgresBin
)

$ErrorActionPreference = 'Stop'
$parent = (Resolve-Path (Join-Path $env:LOCALAPPDATA 'ProgressTracker\track-a-recovery')).Path
$target = Join-Path $parent $TargetId
$target = (Resolve-Path -LiteralPath $target).Path
$expectedPrefix = $parent + [IO.Path]::DirectorySeparatorChar + 'synthetic-track-a-'
if (-not $target.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Resolved deletion target is outside the named synthetic recovery directory.'
}
$markerFile = Join-Path $target 'INSTANCE.txt'
$reportFile = Join-Path $target 'report.json'
if (-not (Test-Path -LiteralPath $markerFile) -or -not (Test-Path -LiteralPath $reportFile)) {
  throw 'Target report or identity marker is missing; refusing recursive deletion.'
}
$marker = Get-Content -LiteralPath $markerFile -Raw
if ($marker -notmatch [regex]::Escape("targetId=$TargetId") -or $marker -notmatch 'bindAddress=127\.0\.0\.1') {
  throw 'Local target identity does not match the requested cleanup target.'
}
$dataDirectory = Join-Path $target 'data'
if (Test-Path -LiteralPath (Join-Path $dataDirectory 'postmaster.pid')) {
  throw 'Stop the verified target before cleanup; no running database will be deleted.'
}
$report = Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json
$pgCtl = Join-Path (Resolve-Path $PostgresBin).Path 'pg_controldata.exe'
if (-not (Test-Path -LiteralPath $pgCtl)) { throw 'pg_controldata.exe is missing; cannot verify cluster identity.' }
$controlOutput = & $pgCtl $dataDirectory 2>&1
if ($LASTEXITCODE -ne 0) { throw 'Could not read the stopped cluster identity; refusing cleanup.' }
$systemLine = $controlOutput | Where-Object { $_ -match 'Database system identifier' } | Select-Object -First 1
if (-not $systemLine -or $systemLine -notmatch [regex]::Escape([string]$report.clusterSystemIdentifier)) {
  throw 'Cluster system identifier differs from the recorded target; refusing cleanup.'
}
if (-not $PSCmdlet.ShouldProcess($target, 'Remove the stopped synthetic-only local cluster and artifacts')) { return }
Remove-Item -LiteralPath $target -Recurse -Force
Write-Output "Removed only verified synthetic target $TargetId. No production backup artifact was included."
