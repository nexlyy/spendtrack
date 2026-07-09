@echo off
rem Сборка автономного APK SpendTrack. Веб-приложение бандлится прямо в APK
rem (assets\web), поэтому сервер и интернет не нужны. Этот скрипт каждый раз
rem заново копирует web\static в assets, чтобы они не разъезжались.
setlocal
if not defined JAVA_HOME set "JAVA_HOME=C:\Program Files\Java\jdk-17"
cd /d "%~dp0"

echo Копирую веб-приложение в assets...
if exist "app\src\main\assets\web" rmdir /S /Q "app\src\main\assets\web"
mkdir "app\src\main\assets\web"
xcopy /E /I /Y "..\web\static\*" "app\src\main\assets\web\" >nul

call gradlew.bat assembleDebug --console=plain
if errorlevel 1 goto :err
copy /Y "app\build\outputs\apk\debug\app-debug.apk" "..\SpendTrack.apk" >nul
echo.
echo Готово:  %~dp0..\SpendTrack.apk  (автономный, офлайн)
goto :end
:err
echo.
echo Сборка не удалась — смотрите сообщения выше.
:end
pause
