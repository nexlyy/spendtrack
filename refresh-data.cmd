@echo off
rem Re-download a fresh copy of your real data from the VPS, then you can
rem restart the web (run.cmd) to see the latest.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync\pull-db.ps1"
echo.
echo Done. Start the web with run.cmd to view the refreshed data.
pause
