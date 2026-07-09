@echo off
rem  SpendTrack launcher for cmd.exe.
rem    run.cmd          start the web at http://127.0.0.1:8770
rem    run.cmd seed     load demo data, then start the web
rem    run.cmd bot      start the Telegram bot  (needs a token in .env)
rem  Double-click this file, or in cmd:  cd into this folder, type  run
setlocal
set "ROOT=%~dp0"
set "PY=%ROOT%venv\Scripts\python.exe"
set "PYTHONUTF8=1"

if not exist "%PY%" goto :setup
goto :ready

:setup
echo [SpendTrack] First run: creating venv and installing dependencies...
python -m venv "%ROOT%venv"
"%PY%" -m pip install --upgrade pip
"%PY%" -m pip install -r "%ROOT%requirements.txt"

:ready
cd /d "%ROOT%"
if /I "%~1"=="seed" goto :seed
if /I "%~1"=="bot" goto :bot
goto :web

:seed
rem demo uses a separate db AND records folder so real data / Obsidian aren't touched
set "SPENDTRACK_DB=%ROOT%data\demo.db"
set "SPENDTRACK_RECORDS=%ROOT%data\demo-records"
echo [SpendTrack] Loading demo data into a separate demo.db...
"%PY%" -X utf8 -m scripts.seed --days 80 --reset
goto :web

:bot
rem local bot test uses the demo db/records (the real bot runs on the server)
set "SPENDTRACK_DB=%ROOT%data\demo.db"
set "SPENDTRACK_RECORDS=%ROOT%data\demo-records"
echo [SpendTrack] Starting Telegram bot. Press Ctrl+C to stop.
"%PY%" -X utf8 -m spendtrack.bot
goto :end

:web
echo.
echo [SpendTrack] Web on this PC:   http://127.0.0.1:8770
echo [SpendTrack] From your phone:  http://192.168.0.104:8770   (same Wi-Fi)
echo [SpendTrack] Press Ctrl+C here to stop.
echo.
"%PY%" -X utf8 -m uvicorn web.app:app --host 0.0.0.0 --port 8770
goto :end

:end
endlocal
