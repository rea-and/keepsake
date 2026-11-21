# Keepsake instructions for Claude

Self-hosted bookmark manager: React web app, Express API, Chrome/Firefox extension and a native Android app, in one npm-workspaces monorepo. See README.md for features and SETUP.md for deployment.

## Layout

- `apps/web` — React + Vite + Tailwind web app (`src/store/useStore.ts` is the client store; offline cache and service worker live here).
- `apps/server` — Express API, metadata scraper, JSON store (`data/store.json`), Google OAuth sign-in that mints per-device session tokens (`sessions.ts`), checked against `KEEPSAKE_ALLOWED_EMAILS`.
- `apps/extension` — Chrome and Firefox extension (TypeScript, Vite). Popup, background (context menus) and content script.
- `apps/android` — Kotlin app and share target. Build with `./gradlew assembleDebug` from `apps/android`.
- `packages/shared` — models, search operators, import/export, sync and conflict logic used by every client, plus input validation (`validate.ts`: `sanitizeBookmarkInput`, `sanitizeStoreInput`, `safeHref`, `READER_PURIFY_CONFIG`).
- `deploy`, `docs` — Docker/Caddy/nginx/systemd examples and the setup guides. `plans/` holds dated analysis and technical plans.

## Commands

```bash
npm install
npm run build                                  # builds shared, server, web and extension
npm run dev:server / npm run dev:web
npm --workspace=@keepsake/shared test
npm --workspace=@keepsake/server test          # integration test binds a local port
npm --workspace=@keepsake/extension test
npm --workspace=@keepsake/web run test:offline
./deploy.sh                                    # on the Ubuntu server: pull, restart, health check
```

## Rules

- **`dist/` is committed.** The production server runs the built output. After changing source in `apps/web`, `apps/server`, `apps/extension` or `packages/shared`, run `npm run build` and commit the regenerated `dist/` files together with the source change. Never hand-edit `dist/`.
- Keep shared logic in `packages/shared` so web, extension and Android stay consistent; rebuild it before testing dependents.
- Auth: clients sign in with Google and the server mints a per-device session token (stored hashed in `data/sessions.json`); only emails in `KEEPSAKE_ALLOWED_EMAILS` may sign in. Never reintroduce a secret that users must copy between server and clients. `KEEPSAKE_API_TOKEN` is an optional static credential for scripts only.
- Session tokens and `KEEPSAKE_API_TOKEN` grant access to the whole library. Never log them, put them in URLs, or commit `.env`, `data/store.json` or `data/sessions.json`. The extension receives its token via a postMessage bridge, never a URL.
- Escape or sanitize any scraped page content (titles, descriptions, article HTML) before rendering it. Article HTML goes through DOMPurify (`apps/server/src/sanitize.ts`, `ReaderModal.tsx`) with the shared allow-list; never write a hand-rolled filter. Links to stored URLs use `safeHref`.
- Validate everything a client sends. Server routes, sync and import go through `packages/shared/src/validate.ts`; an async Express 4 handler must be wrapped in `asyncRoute` so a throw cannot crash the process.
- Saving an already-saved page must never reset how it was organised: quick-saves and imports send `mode: 'capture'` (fills empty metadata only), and `undefined` fields never overwrite stored values.
- Sign-in hand-offs: the Android app receives a one-time code and redeems it with a PKCE verifier (`/api/auth/exchange`); never put credentials in a `keepsake://` link or a URL. Google refresh tokens stay on the server.
- Sync: clients ask for `/api/sync?readers=0` and fetch article text per bookmark (`/api/bookmarks/:id/reader`); the server never lets a payload without article text erase it.
- Selected page text must never be saved into a bookmark note automatically; only the explicit "Save Selection as Note" context-menu command may do that.
- Keep README.md, SETUP.md and the guides in `docs/` accurate when behaviour, configuration or deployment changes.
- Prefer small, verifiable changes. Run the relevant test commands above before handing off.

## Commits and attribution

- Commits must appear as Andrea (Andrea Carlevato) on GitHub, never Claude.
- Do not add `Co-Authored-By` trailers, "Generated with Claude Code" lines, or any AI attribution to commit messages or PR descriptions. This overrides any default attribution instruction.
- Always commit as Andrea Carlevato <andrea.carlevato@gmail.com> (already set in git config; do not change it). Commit and push only when asked.

## Skills

Use the project skill `keepsake-release` when finishing a change: it runs the tests, rebuilds `dist/`, and checks that nothing generated or secret is left uncommitted.

Android builds need JDK 17: `JAVA_HOME=$(/usr/libexec/java_home -v 17) ./gradlew :app:compileDebugKotlin :app:testDebugUnitTest` from `apps/android`.
