#  Install the improved VPS->PC synchronizer and (re)register the task
#  cleanly so it can be stopped properly and never runs two copies.
#  Run from PowerShell (NOT cmd):
#    powershell -ExecutionPolicy Bypass -File install-remote-sync.ps1
#  Revert: copy the newest sync.ps1.bak-* back over sync.ps1, restart task.
[CmdletBinding()]
param(
    [string]$Target = 'C:\Tools\SpendTrack\sync\sync.ps1'
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$new  = Join-Path $here 'sync_remote.ps1'
New-Item -ItemType Directory -Force -Path (Split-Path $Target) | Out-Null

# 1) Stop the task and kill any stale synchronizer instances (clean slate).
Stop-ScheduledTask -TaskName 'SpendTrackSync' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*SpendTrack*sync*.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

# 2) Back up the current script and install the new one.
if (Test-Path -LiteralPath $Target) {
    $bak = "$Target.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Copy-Item -LiteralPath $Target -Destination $bak -Force
    Write-Host "Backed up current script -> $bak"
}
Copy-Item -LiteralPath $new -Destination $Target -Force
Write-Host "Installed improved synchronizer -> $Target"

# 3) Re-register the task with a clean, TRACKED action (no cmd/conhost wrapper),
#    hidden window, and IgnoreNew so the scheduler never starts a second copy.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Target + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'SpendTrackSync' -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

Start-ScheduledTask -TaskName 'SpendTrackSync'
Write-Host "Re-registered and started SpendTrackSync (10s interval, single instance)."
