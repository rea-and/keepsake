# Multi-stage Dockerfile for Keepsake Web & API Server
# Production-ready, lightweight Alpine image. Build from the repository root:
#   docker compose --env-file .env -f deploy/docker-compose.yml up -d --build

FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace configurations and the lockfile, so installs are reproducible
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/extension/package.json ./apps/extension/

# Install dependencies
RUN npm ci

# Copy source codes
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY apps/web ./apps/web

# Build shared library, web frontend, and server
RUN npm --workspace=@keepsake/shared run build && \
    npm --workspace=@keepsake/web run build && \
    npm --workspace=@keepsake/server run build

# Production Runtime Stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Shown by /api/health (the image has no git checkout to read it from)
ARG GIT_COMMIT=
ENV GIT_COMMIT=$GIT_COMMIT

# Copy built artifacts from builder stage
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY apps/web/package.json ./apps/web/
COPY apps/extension/package.json ./apps/extension/

# Install only production dependencies
RUN npm ci --omit=dev

# The server runs as the unprivileged "node" user and writes only to /app/data. The entrypoint starts
# as root just long enough to fix the ownership of an existing data volume (older images ran as root),
# then drops privileges.
RUN apk add --no-cache su-exec && mkdir -p /app/data && chown node:node /app/data
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# Uses the container's PORT, so a custom PORT in .env keeps working
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "apps/server/dist/index.js"]
