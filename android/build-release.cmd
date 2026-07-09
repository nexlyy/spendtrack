@echo off
rem Релизная сборка SpendTrack для Google Play: подписанный App Bundle (.aab)
rem плюс подписанный APK для проверки на телефоне. Веб-приложение бандлится в
rem assets (офлайн, без сервера). Нужны android\keystore.properties и .keystore.
setlocal
if not defined JAVA_HOME set "JAVA_HOME=C:\Program Files\Java\jdk-17"
cd /d "%~dp0"

if not exist "keystore.properties" (
  echo [!] Нет keystore.properties - релиз будет НЕподписанным, Play его не примет.
  echo     Создай ключ и keystore.properties по инструкции в android\README.md.
  goto :end
)

echo Копирую веб-приложение в assets...
if exist "app\src\main\assets\web" rmdir /S /Q "app\src\main\assets\web"
mkdir "app\src\main\assets\web"
xcopy /E /I /Y "..\web\static\*" "app\src\main\assets\web\" >nul

echo Собираю подписанный App Bundle (.aab)...
call gradlew.bat bundleRelease --console=plain
if errorlevel 1 goto :err
copy /Y "app\build\outputs\bundle\release\app-release.aab" "..\SpendTrack-release.aab" >nul

echo Собираю подписанный APK (для проверки на телефоне)...
call gradlew.bat assembleRelease --console=plain
if errorlevel 1 goto :err
copy /Y "app\build\outputs\apk\release\app-release.apk" "..\SpendTrack-release.apk" >nul

echo.
echo Готово:
echo   ..\SpendTrack-release.aab   (загружать в Google Play Console)
echo   ..\SpendTrack-release.apk   (поставить на телефон для проверки)
goto :end
:err
echo.
echo Сборка не удалась - смотрите сообщения выше.
:end
pause
