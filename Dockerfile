# syntax=docker/dockerfile:1.7
# Stage 1 (deps):    node:slim — installs production node_modules and grabs a static tini.
# Stage 2 (runtime): distroless Node (multi-arch: amd64+arm64). No shell, apt, npm, curl or
#                    perl, which is where most base-image CVEs live. Runs as uid/gid 1000
#                    (same as the old `node` user) so docker.sock/settings access is unchanged.
# Debug build (adds a busybox shell at /busybox/sh): --build-arg DISTROLESS_TAG=debug

ARG NODE_VERSION=24
ARG DISTROLESS_TAG=latest

# ---- Stage 1: dependencies ----------------------------------------------------
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# npm ci requires package-lock.json; build fails fast if it's missing/stale.
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

RUN mkdir -p /out/settings

# ---- Stage 2: runtime ---------------------------------------------------------
FROM gcr.io/distroless/nodejs${NODE_VERSION}-debian13:${DISTROLESS_TAG} AS runtime
ENV NODE_ENV=production \
    HEALTH_CHECK_PORT=3021

WORKDIR /app

# tini for PID 1 signal handling / zombie reaping.
COPY --from=deps /usr/bin/tini-static /tini

COPY --from=deps --chown=1000:1000 /app/node_modules ./node_modules

# Application source. Keep this list tight — anything not here stays out of the image.
COPY --chown=1000:1000 package.json package-lock.json index.js ./
COPY --chown=1000:1000 src ./src

# Writable settings directory (no shell in distroless, so copy an empty dir).
COPY --from=deps --chown=1000:1000 /out/settings ./settings

USER 1000:1000
EXPOSE 3021

# No curl in distroless: same semantics as `curl -f` (pass on any HTTP 2xx).
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "require('http').get('http://localhost:'+(process.env.HEALTH_CHECK_PORT||3021)+'/health',{timeout:5000},r=>process.exit(r.statusCode>=200&&r.statusCode<300?0:1)).on('error',()=>process.exit(1)).on('timeout',()=>process.exit(1))"]

ENTRYPOINT ["/tini", "--", "/nodejs/bin/node"]
CMD ["--unhandled-rejections=strict", "--trace-warnings", "index.js"]
