# Локальный запуск веб-версии на Windows.
#   .\run.ps1            — запустить веб на http://127.0.0.1:8770
#   .\run.ps1 -Seed      — сначала залить демо-данные
#   .\run.ps1 -Bot       — запустить Telegram-бота (нужен $env:SPENDTRACK_TOKEN)
param(
    [switch]$Seed,
    [switch]$Bot
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$py = Join-Path $root "venv\Scripts\python.exe"
$env:PYTHONUTF8 = "1"

if (-not (Test-Path $py)) {
    Write-Host "Создаю venv и ставлю зависимости..."
    python -m venv (Join-Path $root "venv")
    & $py -m pip install --upgrade pip
    & $py -m pip install -r (Join-Path $root "requirements.txt")
}

Push-Location $root
try {
    if ($Seed) { & $py -X utf8 -m scripts.seed --days 80 --reset }
    if ($Bot) {
        & $py -X utf8 -m spendtrack.bot
    } else {
        Write-Host "SpendTrack web → http://127.0.0.1:8770"
        & $py -X utf8 -m uvicorn web.app:app --host 127.0.0.1 --port 8770
    }
} finally {
    Pop-Location
}
