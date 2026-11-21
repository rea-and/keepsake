#!/usr/bin/env bash
# Pull the latest Keepsake and restart the server. Run on the Ubuntu server:
#
#   ./deploy.sh            # git pull, install dependencies if they changed, restart, health check
#   ./deploy.sh --build    # also rebuild dist/ locally (normally dist/ is committed; systemd only)
#
# Restarts the systemd unit `keepsake` if it exists, otherwise Docker Compose (which builds the
# image itself, so no npm is needed on the host in that case).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
SERVICE="${KEEPSAKE_SERVICE:-keepsake}"
REBUILD=0
[[ "${1:-}" == "--build" ]] && REBUILD=1

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'deploy: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "git is not installed"

# How is the server run here?
MODE=""
if systemctl list-unit-files "$SERVICE.service" 2>/dev/null | grep -q "^$SERVICE.service"; then
  MODE=systemd
elif command -v docker >/dev/null && [[ -f deploy/docker-compose.yml ]]; then
  MODE=docker
else
  die "no systemd unit named '$SERVICE' and no Docker Compose setup found"
fi
[[ "$MODE" == systemd ]] && { command -v npm >/dev/null || die "npm is not installed"; }

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  die "the working tree has local changes; commit or stash them first"
fi

log "Pulling latest changes"
LOCK_BEFORE="$(git hash-object package-lock.json)"
BEFORE="$(git rev-parse --short HEAD)"
git pull --ff-only
AFTER="$(git rev-parse --short HEAD)"
echo "$BEFORE -> $AFTER"

if [[ "$MODE" == systemd ]]; then
  if [[ "$LOCK_BEFORE" != "$(git hash-object package-lock.json)" || ! -d node_modules ]]; then
    log "Installing dependencies"
    npm install --no-audit --no-fund
  fi
  if [[ "$REBUILD" == 1 ]]; then
    log "Building"
    npm run build
  fi
fi

# The server will not start without these, so check before restarting and leave the
# running server alone if the configuration is incomplete.
for key in KEEPSAKE_ALLOWED_EMAILS GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  grep -Eq "^$key=.+" .env 2>/dev/null || die "$key is not set in .env (see .env.example). The server was not restarted."
done

if [[ "$MODE" == systemd ]]; then
  # The unit file lives outside the repository; tell the owner when the shipped one has changed.
  if ! diff -q deploy/keepsake.service "/etc/systemd/system/$SERVICE.service" >/dev/null 2>&1; then
    echo "note: deploy/keepsake.service differs from /etc/systemd/system/$SERVICE.service."
    echo "      To apply it: sudo cp deploy/keepsake.service /etc/systemd/system/$SERVICE.service && sudo systemctl daemon-reload"
  fi
  log "Restarting the server"
  sudo systemctl restart "$SERVICE"
else
  log "Rebuilding and restarting the container"
  GIT_COMMIT="$AFTER" docker compose --env-file .env -f deploy/docker-compose.yml up -d --build
fi

PORT="$(grep -E '^PORT=' .env 2>/dev/null | tail -n1 | cut -d= -f2 | tr -d '"' || true)"
PORT="${PORT:-3000}"
log "Waiting for http://127.0.0.1:$PORT/api/health"
for _ in $(seq 1 30); do
  if HEALTH="$(curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null)"; then
    echo "Keepsake is up ($AFTER): $HEALTH"
    exit 0
  fi
  sleep 1
done

echo "Keepsake did not become healthy within 30 seconds. Recent logs:" >&2
if [[ "$MODE" == systemd ]]; then
  journalctl -u "$SERVICE" -n 30 --no-pager 2>/dev/null || true
else
  docker compose --env-file .env -f deploy/docker-compose.yml logs --tail 30 2>/dev/null || true
fi
exit 1
