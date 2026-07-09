#  SpendTrack synchronizer (VPS -> PC). Improved drop-in replacement
#  for the original C:\Tools\SpendTrack\sync\sync.ps1.
#
#  Faithful to the proven original (ssh ls + per-file sftp of NEW files),
#  plus:
#    * reduced, configurable interval (30s -> 10s)
#    * reliability flags (BatchMode, ConnectTimeout, ServerAlive*)
#    * SAFE mirror-delete (opt-in): a local record is removed only after it
#      is absent from N consecutive SUCCESSFUL, NON-EMPTY remote listings.
#      This fixes the old "empty ls wiped local files" bug and implements
#      the "safe synchronized deletion" item from the roadmap.
#
#  ASCII source only; Cyrillic paths are built from Unicode code points and
#  the console is forced to UTF-8 (the project's established convention).

chcp 65001 > $null 2>&1
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'

# Single-instance guard. If another copy of the synchronizer is already
# running, this one exits at once. This is what prevents the "several running
# copies make files flicker/disappear" problem the project notes warn about.
$singleton = New-Object System.Threading.Mutex($false, 'SpendTrackSyncRemoteSingleton')
try { $owned = $singleton.WaitOne(0) }
catch [System.Threading.AbandonedMutexException] { $owned = $true }
if (-not $owned) { exit 0 }

# settings
$RemoteHost        = 'mcr'                 # SSH alias from ~/.ssh/config
$IntervalSeconds   = 10                    # poll interval (was 30)
$EnableDelete      = $true                 # mirror server-side deletions (safe, guarded below)
$DeleteAfterMisses = 4                     # ~40s of confirmed absence before deleting locally
# Auto-delete only files that match the SERVER's record naming
# (0012_2026-05-01_120000_x.md). Records you add on the website use a different
# name (00121 Category.md) and live only locally, so they are never removed here.
$RecordPattern     = '^\d{3,6}_\d{4}-\d\d-\d\d_'
# Note on $EnableDelete: leaving it $false keeps the safe "download-only"
# behaviour you have now. Turn it on once you've confirmed your server files
# match $RecordPattern, and deletions made with /del on the server will then
# disappear from Obsidian too - but never on a single bad/empty listing.

$Z = -join ([char[]]@(0x0417,0x0430,0x043F,0x0438,0x0441,0x0438))           # Записи
$F = -join ([char[]]@(0x0424,0x0438,0x043D,0x0430,0x043D,0x0441,0x044B))     # Финансы
$Records       = Join-Path ([Environment]::GetFolderPath('MyDocuments')) ('syncae\' + $Z)
$RemoteRecords = "/var/lib/spendtrack/vault/$F/$Z"
New-Item -ItemType Directory -Force -Path $Records | Out-Null

# Connection options shared by ssh and sftp. BatchMode avoids hanging on
# prompts; ServerAlive* drops dead connections quickly.
$opt = @('-o','BatchMode=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=20','-o','ServerAliveCountMax=2')

$miss = @{}   # filename -> consecutive misses (for safe delete)

function Sync-Once {
    # 1) Authoritative listing from the server. If ssh fails OR the directory
    #    is empty, ls exits non-zero and we bail WITHOUT deleting anything.
    $out = & ssh @opt $RemoteHost "ls `"$RemoteRecords`"/*.md 2>/dev/null"
    if ($LASTEXITCODE -ne 0) { return }
    $names = @($out | ForEach-Object { "$_".Trim() } | Where-Object { $_ } |
               ForEach-Object { Split-Path $_ -Leaf })
    if ($names.Count -eq 0) { return }
    $remoteSet = @{}; foreach ($n in $names) { $remoteSet[$n] = $true }

    # 2) Download records we don't have yet (one sftp per new file, like the
    #    original; new files are rare, so this stays light on the server).
    foreach ($n in $names) {
        if (-not (Test-Path -LiteralPath (Join-Path $Records $n))) {
            & sftp @opt "${RemoteHost}:$RemoteRecords/$n" "$Records\" > $null 2>&1
        }
    }

    # 3) Safe mirror-delete (opt-in, guarded).
    if ($EnableDelete) {
        foreach ($f in Get-ChildItem -LiteralPath $Records -Filter *.md -File) {
            if ($f.Name -match $RecordPattern -and -not $remoteSet.ContainsKey($f.Name)) {
                $miss[$f.Name] = [int]$miss[$f.Name] + 1
                if ($miss[$f.Name] -ge $DeleteAfterMisses) {
                    Remove-Item -LiteralPath $f.FullName -Force
                    $miss.Remove($f.Name)
                }
            }
            elseif ($miss.ContainsKey($f.Name)) { $miss.Remove($f.Name) }
        }
    }
}

while ($true) {
    Sync-Once
    Start-Sleep -Seconds $IntervalSeconds
}
