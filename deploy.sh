#!/usr/bin/env bash
# Pull the latest Keepsake and restart the server. Run on the Ubuntu server:
#
#   ./deploy.sh            # git pull, npm install if dependencies changed, restart, health check
#   ./deploy.sh --build    # also rebuild dist/ locally (normally dist/ is committed)
#
# Restarts the systemd unit `keepsake` if it exists, otherwise Docker Compose.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
SERVICE="${KEEPSAKE_SERVICE:-keepsake}"
REBUILD=0
[[ "${1:-}" == "--build" ]] && REBUILD=1

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "git is not installed"
command -v npm >/dev/null || die "npm is not installed"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  die "the working tree has local changes; commit or stash them first"
fi

log "Pulling latest changes"
LOCK_BEFORE="$(git hash-object package-lock.json)"
BEFORE="$(git rev-parse --short HEAD)"
git pull --ff-only
AFTER="$(git rev-parse --short HEAD)"
echo "$BEFORE -> $AFTER"

if [[ "$LOCK_BEFORE" != "$(git hash-object package-lock.json)" || ! -d node_modules ]]; then
  log "Installing dependencies"
  npm install --no-audit --no-fund
fi

if [[ "$REBUILD" == 1 ]]; then
  log "Building"
  npm run build
fi

# The server refuses to start without an allow-list, so check before restarting
# and leave the running server alone if the configuration is incomplete.
if ! grep -Eq '^KEEPSAKE_ALLOWED_EMAILS=.+' .env 2>/dev/null; then
  die "KEEPSAKE_ALLOWED_EMAILS is not set in .env. Add the Google account email(s) allowed to sign in, then run ./deploy.sh again. The server was not restarted."
fi

log "Restarting the server"
if systemctl list-unit-files "$SERVICE.service" 2>/dev/null | grep -q "^$SERVICE.service"; then
  sudo systemctl restart "$SERVICE"
elif command -v docker >/dev/null && [[ -f deploy/docker-compose.yml ]]; then
  docker compose -f deploy/docker-compose.yml up -d --build
else
  die "no systemd unit named '$SERVICE' and no Docker Compose setup found"
fi

PORT="$(grep -E '^PORT=' .env 2>/dev/null | tail -n1 | cut -d= -f2 | tr -d '"' || true)"
PORT="${PORT:-3000}"
log "Waiting for http://127.0.0.1:$PORT/api/health"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "Keepsake is up ($AFTER)."
    exit 0
  fi
  sleep 1
done

echo "Keepsake did not become healthy within 30 seconds. Recent logs:" >&2
journalctl -u "$SERVICE" -n 30 --no-pager 2>/dev/null || docker compose -f deploy/docker-compose.yml logs --tail 30 2>/dev/null || true
exit 1
