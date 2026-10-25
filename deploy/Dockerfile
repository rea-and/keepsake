# Multi-stage Dockerfile for Keepsake Web & API Server
# Production-ready, lightweight Alpine image

FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace configurations
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN npm install

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

# Copy built artifacts from builder stage
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Install only production dependencies
RUN npm install --omit=dev

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]
