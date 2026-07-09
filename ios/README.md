# SpendTrack для iOS

Полностью автономное приложение: веб-часть (та же, что в Android APK) лежит в
бандле, данные хранятся в IndexedDB на устройстве, сервер и интернет не нужны.

Проект описан как код (`project.yml` для [XcodeGen](https://github.com/yonaskolb/XcodeGen)),
поэтому `.xcodeproj` не хранится в репозитории, а генерируется одной командой —
и на Маке, и в облаке. Ручная возня в Xcode (удалить автогенерённые файлы,
добавить «синюю» папку, почистить Build Settings) больше не нужна.

## Сборка в облаке — без Mac (основной путь)

`.ipa` для iPhone можно собрать только на macOS — это требование Apple. Но Мак
покупать не обязательно: собирает бесплатный macOS-раннер GitHub Actions.

1. Залей проект на GitHub (нужны папки `ios/` и `.github/`). Если репозитория ещё
   нет:
   ```
   cd spendtrack-app
   git init && git add . && git commit -m "SpendTrack"
   git remote add origin https://github.com/<логин>/spendtrack.git
   git push -u origin main
   ```
2. На GitHub открой вкладку **Actions** → workflow **Build iOS (unsigned)** →
   **Run workflow** (или он запустится сам при пуше в `ios/`).
3. Когда прогон закончится (~3–5 мин), скачай артефакт
   **SpendTrack-unsigned-ipa** — внутри `SpendTrack-unsigned.ipa`.

Сборка идёт **без подписи**, так что просто перекинуть файл на телефон нельзя —
нужен сайдлоад бесплатным Apple ID (даёт 7 дней, потом переустановить):

- **[AltStore](https://altstore.io)** (Windows/Mac): ставишь AltServer на ПК,
  подключаешь iPhone по кабелю/Wi-Fi, открываешь `.ipa` в AltStore на телефоне.
- **[Sideloadly](https://sideloadly.io)** (Windows/Mac): подключаешь iPhone,
  перетаскиваешь `.ipa`, вводишь Apple ID — оно подпишет и поставит.

> Данные (IndexedDB) при переустановке раз в 7 дней сохраняются, пока не удаляешь
> само приложение. Для страховки — «Сохранить копию» в настройках приложения.

### Подпись прямо в CI (по желанию)

Чтобы получить сразу установочный `.ipa` (без AltStore), нужен платный аккаунт
разработчика Apple ($99/год). Тогда добавь в секреты репозитория сертификат
(`.p12`) и provisioning profile и подпиши шаг сборки через
[`apple-actions/import-codesign-certs`](https://github.com/apple-actions/import-codesign-certs),
заменив в workflow `CODE_SIGNING_ALLOWED=NO` на реальные `DEVELOPMENT_TEAM`
и `PROVISIONING_PROFILE_SPECIFIER`, затем `xcodebuild -exportArchive`.

## Сборка на Mac (если он всё-таки есть)

```
brew install xcodegen
cd ios
xcodegen generate
open SpendTrack.xcodeproj
```
Дальше в Xcode: выбери свой Apple ID в **Signing & Capabilities → Team**,
подключи iPhone, **Run (⌘R)**. Для установки на свой телефон хватает бесплатного
Apple ID; для App Store нужен платный аккаунт.

## Что внутри

- `SpendTrack/ViewController.swift` — `WKWebView`. Грузит `stapp://app/index.html`
  через собственный обработчик схемы (стабильный origin → IndexedDB переживает
  перезапуски, в отличие от `file://`; вложенные пути отдаются надёжно). Умеет
  перезагружаться после падения веб-процесса, а мост `saveFile` отдаёт резервную
  копию и CSV в системный лист «Поделиться» (Files, iCloud Drive, почта).
- `SpendTrack/Info.plist` — только портретная ориентация, launch screen с
  логотипом на тёмном фоне.
- `SpendTrack/Assets.xcassets` — иконка приложения (1024, из фирменного
  логотипа) и картинки launch screen.
- `SpendTrack/web/` — веб-бандл (копия `web/static` из корня проекта). Импорт
  выписки и восстановление копии работают через обычный `<input type=file>` —
  WKWebView сам показывает системный выбор файлов.
- `project.yml` — описание проекта для XcodeGen.

При изменении веб-части не забудь синхронизировать: скопируй `web/static/*`
в `ios/SpendTrack/web/` (Android-сборка делает это сама, iOS — вручную).

## Без Xcode вообще: установка как PWA

Веб-приложение — устанавливаемый офлайн-PWA. Нужен только статический хостинг
(бесплатный, без бэкенда):

1. Залей содержимое `web/static` на GitHub Pages / Netlify / Cloudflare Pages.
2. Открой полученный https-адрес в **Safari** на iPhone.
3. **Поделиться → На экран «Домой»**. Приложение откроется в полноэкранном
   режиме и будет работать офлайн (IndexedDB + service worker).

Перенос данных между устройствами в любом варианте — «Сохранить копию» → файл →
«Восстановить из копии» на другом устройстве.
