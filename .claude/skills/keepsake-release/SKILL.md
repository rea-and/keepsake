---
name: keepsake-release
description: Finish a Keepsake change - run the tests, rebuild the committed dist/ output, and check the working tree before committing. Use when asked to commit, ship, or deploy Keepsake changes.
---

# Finish a Keepsake change

1. Run the tests for every workspace you touched:
   - `npm --workspace=@keepsake/shared test`
   - `npm --workspace=@keepsake/server test` (binds a local port)
   - `npm --workspace=@keepsake/extension test`
   - `npm --workspace=@keepsake/web run test:offline`
2. Run `npm run build` so the committed `dist/` folders match the source. The production server runs `dist/` directly, so a source change without its rebuilt output does not ship.
3. `git status`: expect source changes plus regenerated files under `apps/*/dist` and `packages/shared/dist`. Anything else generated (logs, `.env`, `data/store.json`, `node_modules`) must not be staged.
4. Review `git diff --stat`. If a `dist/` file changed without a matching source change, rebuild from a clean install before committing.
5. Commit only when asked. Author is Andrea; do not add `Co-Authored-By` or any AI attribution.
6. To deploy, push, then run `./deploy.sh` in the repository on the Ubuntu server. It pulls, installs dependencies if the lockfile changed, restarts the systemd unit (or Docker Compose), and checks `/api/health`. It refuses to restart if `KEEPSAKE_ALLOWED_EMAILS` is missing from `.env`. Details are in `docs/UBUNTU_DEPLOYMENT_GUIDE.md`.
