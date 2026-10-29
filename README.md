# Keepsake

A self-hosted bookmark library for the web, Android, Chrome, and Firefox. Save links from your browser or Android share menu, organize them into collections and tags, and return to them in a layout that suits you.

## What you can do

- Browse bookmarks as cards, lists, headlines, or a moodboard; remember view and sort preferences per collection.
- Organize links with nested collections, tags, favorites, and pending/done status. Select bookmarks for bulk actions and recover deleted items from Trash.
- Search titles, notes, tags, and saved article text. Use operators such as `#design`, `site:github.com`, `is:pending`, `type:article`, and `has:note`; quotes match phrases and `-word` excludes text. Save searches for later.
- Read extracted articles with adjustable typography and reading position. Import browser bookmarks as Netscape HTML and export HTML or JSON backups.
- Capture links with the Chrome or Firefox extension, or share them from Android. The server fetches page metadata and cover images when available.
- Use the cached web app offline after an initial online visit. Server synchronization and optional Google Drive sync bring changes together when connections are available.

## Getting started

You need Node.js 20.18.1 or newer and Google OAuth credentials. The server also requires a shared API token. Use HTTPS for network access.

```bash
npm install
npm run build
cp .env.example .env
openssl rand -hex 32
```

Put the generated value in `.env` as `KEEPSAKE_API_TOKEN`, configure the Google OAuth settings, and start the server:

```bash
npm --workspace=@keepsake/server run start
```

Open `http://localhost:3000`, sign in, and enter the API token when prompted. Configure the same server URL and token in the extension and Android app. The token grants access to the entire library; keep it private.

For complete configuration, HTTPS deployment, Android builds, extensions, and upgrades, see **[SETUP.md](SETUP.md)**. Additional guides cover [Google OAuth](docs/GOOGLE_OAUTH_SETUP.md), [Ubuntu deployment](docs/UBUNTU_DEPLOYMENT_GUIDE.md), [Android](docs/ANDROID_SETUP_GUIDE.md), and [extensions](docs/EXTENSIONS_GUIDE.md).

## Project layout

| Path | Purpose |
| --- | --- |
| `apps/web` | React web app |
| `apps/server` | Express API, metadata scraper, and JSON store |
| `apps/android` | Native Android app and share target |
| `apps/extension` | Chrome and Firefox extensions |
| `packages/shared` | Models, search, import/export, and sync logic |
| `deploy` | Docker and reverse-proxy examples |

## Development and checks

```bash
npm run dev:server
npm run dev:web
npm --workspace=@keepsake/shared test
npm --workspace=@keepsake/server test
npm --workspace=@keepsake/extension test
npm --workspace=@keepsake/web run test:offline
```

For Android, run `./gradlew assembleDebug` and `./gradlew testDebugUnitTest` from `apps/android`. The server integration test binds a local port. The Android instrumentation test requires a running emulator and a disposable server; see the test source for its runner arguments.

## Data and security

The server stores the library in `data/store.json` by default. Web data is also cached in the browser; Google Drive sync is optional. JSON imports merge with existing data rather than replacing it. Keep independent backups and protect the server and its API token. OAuth sign-in and API token access serve different purposes; all clients using the shared token can access the same library.

## License

MIT.
