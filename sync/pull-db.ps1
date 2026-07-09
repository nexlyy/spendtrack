# Pull a fresh, consistent copy of the real SpendTrack DB from the VPS.
# Uses SQLite's read-only online backup on the server (does NOT modify the
# production database or touch the bot), then downloads the snapshot.
#   powershell -ExecutionPolicy Bypass -File pull-db.ps1
[CmdletBinding()]
param(
    [string]$RemoteHost = 'mcr',
    [string]$RemoteDb   = '/var/lib/spendtrack/spend.db',
    [string]$Target     = (Join-Path (Split-Path $PSScriptRoot -Parent) 'data\real-spend.db')
)
$ErrorActionPreference = 'Stop'

$py = @'
import sqlite3
s = sqlite3.connect('file:__DB__?mode=ro', uri=True)
d = sqlite3.connect('/tmp/st_snap.db')
s.backup(d); d.close(); s.close()
print('snapshot rows:', sqlite3.connect('/tmp/st_snap.db').execute('select count(*) from entries').fetchone()[0])
'@ -replace '__DB__', $RemoteDb

$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($py))
Write-Host "Snapshotting on $RemoteHost (read-only)..."
& ssh -o BatchMode=yes -o ConnectTimeout=15 $RemoteHost "echo $b64 | base64 -d | python3"
if ($LASTEXITCODE -ne 0) { throw "ssh snapshot failed (is the server reachable?)" }
& scp -o BatchMode=yes -o ConnectTimeout=15 "${RemoteHost}:/tmp/st_snap.db" "$Target"
if ($LASTEXITCODE -ne 0) { throw "scp download failed" }
& ssh -o BatchMode=yes $RemoteHost "rm -f /tmp/st_snap.db"
Write-Host "Downloaded fresh copy -> $Target"
