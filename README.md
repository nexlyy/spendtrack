# SpendTrack

A personal expense tracker that runs entirely on your phone. No account, no server, no sync — you type what you spent, it sorts the entry into a category and draws the charts, and every byte stays in the browser's IndexedDB on your device.

I built it because the "free" money apps I tried all wanted a login and quietly shipped my transactions somewhere. This one can't: the Android build ships without the `INTERNET` permission, so there's nowhere for the data to go.

The same web app is packaged three ways — an installable PWA, an Android APK, and an iOS build — but it's one codebase in `web/static`. Everything else is a thin native shell around a WebView.

## What it does

**Type entries in one line.** `50 food lunch`, `120 groceries`, `4500 salary`. The parser reads the amount, currency, category and note, works out whether it's a spend, income or a savings transfer, and forgives typos on words of five letters or more (`grocries` still lands in Groceries). Backdate an entry with a leading date: `02.06.2026 30 transport`. It understands category words in four languages, so `20 jedzenie`, `20 food` and `20 їжа` all mean Food.

**Import bank statements.** Drop in a CSV or XLSX export from PKO, Santander, Monobank, Privat24, ING and a few others. It figures out the category for each row through a chain of fallbacks — your own rules first, then a dictionary of ~140 merchants, then the bank's own category column, then the MCC code, then the description — and skips internal transfers so a move between your own accounts doesn't show up as spending. On a real 1035-row Privat24 export that came out as 398 expenses, 216 income and 421 internal moves skipped, with ~92% of expenses categorized.

**See where it goes.** A donut chart by category, totals for the period (spent / income / saved / balance), and a trend chart with a smooth line, gradient fill and a crosshair tooltip that follows your finger. Tap a slice in the legend to filter the feed down to that category.

**Budgets, goals, recurring.** Set a monthly limit per category and it warns you before you blow it. Track savings goals. Mark recurring costs (subscriptions, rent) so they add themselves.

**Multiple currencies.** PLN, EUR, USD and UAH, with conversion. Pick a display currency and the analytics fold everything into it, so you can see the whole picture in one currency even if you spent in several. Rates are editable in settings.

**Four UI languages.** Ukrainian, Polish, English, Russian — auto-detected from the system, switchable in settings. Data is stored under canonical category keys, so switching language only re-labels the display; it never touches the stored entries.

**Backup you control.** "Save a copy" writes a gzipped JSON file and hands it to the system share sheet — you choose where it lands. Restore reads it back on another device. There is no cloud sync on purpose: syncing needs a server, and a server would break the whole "it never leaves your device" promise. Moving data between phones is a backup file you carry across.

## Privacy

The app collects nothing. No analytics, no ads, no trackers, no network calls. The Android manifest doesn't request `INTERNET`, and `allowBackup` is off so the database can't ride Google's auto-backup off the device. Statement files are parsed locally and never uploaded. Full text in [PRIVACY.md](PRIVACY.md).

## How it's built

Plain HTML, CSS and JavaScript. No framework, no bundler, no npm — open `web/static/index.html` and it runs. That was a constraint as much as a choice (Node isn't installed on the build machine), but it keeps the whole thing inspectable and dependency-free.

- `core.js` — the parser and all the domain logic: categories, the merchant dictionary, currency handling, statement parsing (CSV and a from-scratch XLSX reader built on `DecompressionStream`).
- `store.js` — IndexedDB: entries, budgets, settings, imported-transaction ids, plus the aggregations the charts read.
- `localapi.js` — a local router that answers the same paths the old server did (`config`, `entries`, `summary`, `budgets`, `import`, `backup`…) and returns the same JSON shapes, which is why the UI barely changed when the backend went away.
- `app.js` — the UI. The donut and the trend chart are drawn straight to SVG by hand, no charting library.

A service worker caches the assets so the PWA works offline; its cache name is versioned, so bump it when you change an asset.

## Running it

**As a web app / PWA.** Host the contents of `web/static` on any static host (GitHub Pages, Netlify, Cloudflare Pages) or just open `index.html` locally. On iOS, open the URL in Safari and use Share → Add to Home Screen. See [DEPLOY.md](DEPLOY.md).

**Android.** From `android/`, run `build-release.cmd` (needs JDK 17 and the Android SDK). The script mirrors `web/static` into the app assets, builds a signed `.aab` and `.apk`. Details and the debug flow in [android/README.md](android/README.md).

**iOS, without a Mac.** The Xcode project is generated by XcodeGen from `ios/project.yml`, and a GitHub Actions macOS runner builds an unsigned `.ipa` you can sideload with AltStore or Sideloadly. Steps in [ios/README.md](ios/README.md).

## Entry syntax

| You type | You get |
|---|---|
| `50 food lunch` | 50 spent, category Food, note "lunch" |
| `120 groceries` | note is optional |
| `02.06.2026 30 transport` | backdated (set to noon so the date doesn't drift) |
| `20 eur coffee` | another currency (EUR/USD by word or symbol) |
| `4500 salary` | income — kept out of the spending chart |
| `200 saved mortgage` | a savings transfer, tracked separately |
| `50 kebab` | category not recognized → Other, the word goes to the note |

## Project layout

```
web/static/        the app — one codebase, no build step
  core.js          parser, categories, merchants, statement import
  store.js         IndexedDB + aggregations
  localapi.js      on-device router (same JSON shapes the server used)
  app.js           UI, hand-drawn SVG charts
  i18n.js          UK / PL / EN / RU strings
android/           WebView shell, no androidx, tiny APK
ios/               WKWebView shell, project-as-code (XcodeGen)
.github/workflows/ macOS runner that builds the iOS .ipa
spendtrack/, web/  legacy self-hosted server (see below)
```

## The old server

Before it went offline-first, SpendTrack was a Telegram bot plus a FastAPI web app over SQLite that also mirrored every entry into an Obsidian vault as Markdown. That code still lives in `spendtrack/` and `web/app.py` — the app doesn't touch it anymore, but it's kept for anyone who wants to self-host the bot version. `.env.example` shows the settings it reads.
