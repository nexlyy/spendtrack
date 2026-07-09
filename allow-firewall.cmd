@echo off
rem Открывает порт 8770 для входящих подключений (нужно для телефона).
rem Запросит права администратора (UAC) и добавит правило брандмауэра.
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -Command "Start-Process '%~f0' -Verb RunAs"
  exit /b
)
netsh advfirewall firewall delete rule name="SpendTrack 8770" >nul 2>&1
netsh advfirewall firewall add rule name="SpendTrack 8770" dir=in action=allow protocol=TCP localport=8770 profile=private,domain
echo.
echo Готово: порт 8770 открыт для локальной сети.
pause
