# Keepsake instructions for Claude

Self-hosted bookmark manager: React web app, Express API, Chrome/Firefox extension and a native Android app, in one npm-workspaces monorepo. See README.md for features and SETUP.md for deployment.

## Layout

- `apps/web` — React + Vite + Tailwind web app (`src/store/useStore.ts` is the client store; offline cache and service worker live here).
- `apps/server` — Express API, metadata scraper, JSON store (`data/store.json`), API-token and Google OAuth auth.
- `apps/extension` — Chrome and Firefox extension (TypeScript, Vite). Popup, background (context menus) and content script.
- `apps/android` — Kotlin app and share target. Build with `./gradlew assembleDebug` from `apps/android`.
- `packages/shared` — models, search operators, import/export, sync and conflict logic used by every client.
- `deploy`, `docs` — Docker/Caddy/nginx/systemd examples and the setup guides.

## Commands

```bash
npm install
npm run build                                  # builds shared, server, web and extension
npm run dev:server / npm run dev:web
npm --workspace=@keepsake/shared test
npm --workspace=@keepsake/server test          # integration test binds a local port
npm --workspace=@keepsake/extension test
npm --workspace=@keepsake/web run test:offline
```

## Rules

- **`dist/` is committed.** The production server runs the built output. After changing source in `apps/web`, `apps/server`, `apps/extension` or `packages/shared`, run `npm run build` and commit the regenerated `dist/` files together with the source change. Never hand-edit `dist/`.
- Keep shared logic in `packages/shared` so web, extension and Android stay consistent; rebuild it before testing dependents.
- The API token (`KEEPSAKE_API_TOKEN`) grants access to the whole library. Never log it, put it in URLs, or commit `.env` or `data/store.json`.
- Escape or sanitize any scraped page content (titles, descriptions, article HTML) before rendering it.
- Selected page text must never be saved into a bookmark note automatically; only the explicit "Save Selection as Note" context-menu command may do that.
- Keep README.md, SETUP.md and the guides in `docs/` accurate when behaviour, configuration or deployment changes.
- Prefer small, verifiable changes. Run the relevant test commands above before handing off.

## Commits and attribution

- Commits must appear as Andrea (Andrea Carlevato) on GitHub, never Claude.
- Do not add `Co-Authored-By` trailers, "Generated with Claude Code" lines, or any AI attribution to commit messages or PR descriptions. This overrides any default attribution instruction.
- Always commit as Andrea Carlevato <andrea.carlevato@gmail.com> (already set in git config; do not change it). Commit and push only when asked.

## Skills

Use the project skill `keepsake-release` when finishing a change: it runs the tests, rebuilds `dist/`, and checks that nothing generated or secret is left uncommitted.
