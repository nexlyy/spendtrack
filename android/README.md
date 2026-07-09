# SpendTrack — Android

Автономное приложение: веб-часть (`web/static`) бандлится прямо в APK, WebView
открывает локальные ассеты (`file:///android_asset/web/index.html`), данные лежат
в IndexedDB на устройстве. Сервера и интернета нет — в манифесте даже не
запрашивается разрешение `INTERNET`.

Проект намеренно минимальный: без androidx-зависимостей, только `WebView` и мост
для сохранения файлов. Поэтому APK весит меньше сотни килобайт и собирается за
секунды. `minSdk 26` (Android 8.0+), `targetSdk 35`, `allowBackup=false` —
финансовую базу не должно уносить в облачный автобэкап Google.

## Собрать для себя (debug)

Дважды кликнуть **`build-apk.cmd`** (нужны JDK 17 и Android SDK). Скрипт копирует
`web/static` в assets и собирает `../SpendTrack.apk`. Вручную то же самое:
`gradlew.bat assembleDebug`, APK окажется в `app/build/outputs/apk/debug/`.

Поставить на телефон: скинуть `SpendTrack.apk` любым способом и открыть (Android
попросит разрешить установку из этого источника) или по кабелю `adb install SpendTrack.apk`.

## Собрать для Google Play (release, подпись)

Релиз нужно подписать своим ключом. Один раз создай keystore:

```
keytool -genkeypair -v -keystore spendtrack-release.keystore ^
  -alias spendtrack -keyalg RSA -keysize 2048 -validity 10000
```

и рядом `android/keystore.properties` (в `.gitignore`, в репозиторий не попадает):

```
storeFile=spendtrack-release.keystore
storePassword=…
keyAlias=spendtrack
keyPassword=…
```

Ключ и пароль храни в надёжном месте: потеряешь — не сможешь выпускать обновления
(Play придётся заводить заново под другим package). Дальше — **`build-release.cmd`**:
он собирает подписанные `SpendTrack-release.aab` (грузить в Play Console) и
`SpendTrack-release.apk` (проверить на телефоне) и кладёт их в корень проекта.

## Что внутри

- `MainActivity.java` — `WebView` c включённым JS и DOM-storage, выбором файла для
  импорта выписки и мостом `AndroidBridge.saveToDownloads` (в `file://`-WebView
  обычная blob-выгрузка не работает, поэтому копию и CSV сохраняем через `MediaStore`).
- Иконка — adaptive (`res/mipmap-anydpi-v26`, слои в `res/drawable`).
- `build.gradle` — версия, подпись, `versionName 1.0.0`.

При изменении веб-части ассеты пересобирать не нужно вручную — оба build-скрипта
каждый раз заново копируют `web/static` в `app/src/main/assets/web`.
