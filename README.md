# Keepsake

A self-hosted bookmark library for the web, Android, Chrome, and Firefox. Save links from your browser or Android share menu, organize them into collections and tags, and return to them in a layout that suits you.

## What you can do

- Browse bookmarks as cards, lists, headlines, or a moodboard; remember view and sort preferences per collection.
- Organize links with nested collections, tags, favorites, and pending/done status. Select bookmarks for bulk actions and recover deleted items from Trash.
- Search titles, notes, tags, and saved article text. Use operators such as `#design`, `site:github.com`, `is:pending`, `type:article`, and `has:note`; quotes match phrases, `-word` excludes text, and `-tag:name` excludes a tag. Tag filters match whole tags. Save searches for later.
- Read extracted articles with adjustable typography and reading position. Import browser bookmarks as Netscape HTML and export HTML or JSON backups.
- Capture links with the Chrome or Firefox extension, or share them from Android. The server fetches page metadata and cover images when available.
- Use the cached web app offline after an initial online visit. Server synchronization and optional Google Drive sync bring changes together when connections are available. Installed as an app, the web version can also receive links from your system's share menu.
- See and sign out your signed-in devices from **Settings**. The server keeps daily snapshots of your library.

## Getting started

You need Node.js 20.18.1 or newer and Google OAuth credentials. Use HTTPS for network access.

```bash
npm install
npm run build
cp .env.example .env
```

In `.env`, configure the Google OAuth settings and set `KEEPSAKE_ALLOWED_EMAILS` to the Google account(s) allowed to sign in, then start the server:

```bash
npm --workspace=@keepsake/server run start
```

Open `http://localhost:3000` and sign in with Google. In the extension and Android app, enter the server URL and tap **Sign in with Google**. The server issues each device its own session token, so there is no secret to copy between devices.

For complete configuration, HTTPS deployment, Android builds, extensions, and upgrades, see **[SETUP.md](SETUP.md)**. Additional guides cover [Google OAuth](docs/GOOGLE_OAUTH_SETUP.md), [Ubuntu deployment](docs/UBUNTU_DEPLOYMENT_GUIDE.md), [Android](docs/ANDROID_SETUP_GUIDE.md), and [extensions](docs/EXTENSIONS_GUIDE.md).

## Project layout

| Path | Purpose |
| --- | --- |
| `apps/web` | React web app |
| `apps/server` | Express API, metadata scraper, and JSON store |
| `apps/android` | Native Android app and share target |
| `apps/extension` | Chrome and Firefox extensions |
| `packages/shared` | Models, search, import/export, and sync logic |
| `deploy` | Docker, systemd and reverse-proxy examples |
| `plans` | Dated analysis and technical plans |

## Development and checks

```bash
npm run dev:server
npm run dev:web
npm --workspace=@keepsake/shared test
npm --workspace=@keepsake/server test
npm --workspace=@keepsake/extension test
npm --workspace=@keepsake/web run test:offline
```

Build output (`dist/` in `apps/web`, `apps/server`, `apps/extension` and `packages/shared`) is committed because the production server runs it directly. After changing source in those packages, run `npm run build` and commit the regenerated `dist/` files together with the source.

For Android, run `./gradlew assembleDebug` and `./gradlew testDebugUnitTest` from `apps/android`. The server integration test binds a local port. The Android instrumentation test requires a running emulator and a disposable server; see the test source for its runner arguments.

## Data and security

The server stores the library in `data/store.json` by default. Web data is also cached in the browser; Google Drive sync is optional. JSON imports merge with existing data rather than replacing it. Daily snapshots of the store are kept in `data/backups/`; keep independent backups as well. Only the Google accounts in `KEEPSAKE_ALLOWED_EMAILS` can sign in, and each device gets its own revocable session token (stored hashed in `data/sessions.json`). Signing out revokes that device's token; removing an address from the allow-list ends its sessions on the next restart.

## License

MIT.
