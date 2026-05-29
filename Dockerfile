# syntax=docker/dockerfile:1.7
# Two-stage build using the official Node slim image (multi-arch: amd64+arm64).
# Stage 1 (deps):    installs production node_modules.
# Stage 2 (runtime): installs tini + curl, copies node_modules + source, runs as non-root.

ARG NODE_VERSION=20

# ---- Stage 1: dependencies ----------------------------------------------------
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app

# npm ci requires package-lock.json; build fails fast if it's missing/stale.
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# ---- Stage 2: runtime ---------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    HEALTH_CHECK_PORT=3021

WORKDIR /app

# tini for PID 1 signal handling; curl for the HEALTHCHECK probe.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
      tini curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pre-built production node_modules from the deps stage.
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

# Application source. Keep this list tight — anything not here stays out of the image.
COPY --chown=node:node package.json package-lock.json index.js ./
COPY --chown=node:node src ./src

# Writable settings directory owned by the runtime user.
RUN mkdir -p /app/settings && chown -R node:node /app/settings

USER node
EXPOSE 3021

HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -fsS "http://localhost:${HEALTH_CHECK_PORT}/health" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--unhandled-rejections=strict", "--trace-warnings", "index.js"]
