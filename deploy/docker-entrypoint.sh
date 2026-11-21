#!/bin/sh
# Container entrypoint. A data volume created by an older image is owned by root, which the
# unprivileged server user cannot write to (sign-in then fails when the session is saved).
# Fix the ownership once, then run the server as "node".
set -e

if [ "$(id -u)" = "0" ]; then
  chown -R node:node /app/data
  exec su-exec node "$@"
fi

exec "$@"
