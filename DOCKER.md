# Docker Setup Documentation

This document outlines the Docker setup for the Docker Discord Bot project.

## Project Overview

Docker Discord Bot is a Discord bot designed to manage Docker containers through Discord commands. It allows authorized users to start, stop, and check the status of Docker containers directly from Discord.

## The Image

The [Dockerfile](Dockerfile) is a two-stage build:

1. **deps** (`node:24-slim`) — runs `npm ci --omit=dev` and grabs a static `tini`.
2. **runtime** (`gcr.io/distroless/nodejs24-debian13`) — copies in `node_modules`, the app
   source and `tini`. Nothing else.

The runtime image is **distroless**: it has Node.js and the libraries it needs, but **no
shell, package manager, npm, curl, or coreutils**. That is what keeps the vulnerability
scan clean (most base-image CVEs come from Debian userland packages and npm's bundled
dependencies, none of which the bot uses at runtime).

| | |
|---|---|
| Node.js | 24 (LTS) |
| Runs as | uid/gid `1000:1000` (same as the old `node` user, so socket/volume permissions are unchanged) |
| PID 1 | `tini` → `node index.js` |
| Port | `3021` (health endpoint) |
| Platforms | `linux/amd64`, `linux/arm64` |

Check the scan yourself:

```bash
docker scout quickview anshuljkt1/docker-discord-bot:latest
```

## Building

```bash
# Local single-platform build (tags :<version> and :latest)
make build

# Or directly
docker build -t docker-discord-bot .
```

### Releasing (multi-platform, pushed to Docker Hub)

```bash
# Stable: bumps package.json, pushes :<version> and :latest
make release VER=2.1.0

# Beta: override TAGS so :latest is NOT moved
make release VER=2.1.0-beta.1 \
  TAGS="--tag anshuljkt1/docker-discord-bot:2.1.0-beta.1 --tag anshuljkt1/docker-discord-bot:beta"
```

`make release` requires a clean git tree (`check-clean`), then sets the version, syncs the
lockfile and runs `docker buildx build --push` for both platforms. Commit and tag the
version bump afterwards.

## Running

```bash
# Using docker compose
docker compose up -d

# Or using docker directly
docker run -d \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd)/settings:/app/settings \
  -e DISCORD_TOKEN=your_discord_bot_token \
  -p 3021:3021 \
  --name docker-discord-bot \
  anshuljkt1/docker-discord-bot:latest
```

`settings/settings.json` must exist before starting (see
[src/services/SETTINGS_README.md](src/services/SETTINGS_README.md)). The settings directory
must be writable by uid 1000 — the bot writes `settings_default.json` and
`SETTINGS_README.md` there on every start.

### Development

```bash
make dev   # docker compose -f docker-local-build-compose.yaml up (builds from source)
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `DISCORD_TOKEN` | Bot token; overrides `DiscordSettings.Token` (never written back to `settings.json`) |
| `HEALTH_CHECK_PORT` | Health endpoint port (default `3021`) |
| `NODE_ENV` | `production` in the image |

## Volumes

- `/var/run/docker.sock:/var/run/docker.sock` — lets the bot talk to the Docker daemon.
  This is effectively root on the host; only grant `/docker` permissions to people you trust.
- `./settings:/app/settings` — configuration (must be writable by uid 1000).

## Health Check

The image has no `curl`, so health checks use Node directly (exec form, no shell). It passes
on any HTTP 2xx from `/health` — the same rule as the old `curl -f` check:

```yaml
healthcheck:
  test: ["CMD", "/nodejs/bin/node", "-e", "require('http').get('http://localhost:3021/health',{timeout:4000},r=>process.exit(r.statusCode>=200&&r.statusCode<300?0:1)).on('error',()=>process.exit(1)).on('timeout',()=>process.exit(1))"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

> **Upgrading from ≤ 2.0.x:** any compose/Portainer stack that overrides the health check
> with `curl -f ... || exit 1` must be updated to the above, or the container will be marked
> unhealthy.

## Debugging

There is no shell in the production image, so `docker exec -it docker-discord-bot sh` will
not work. Use one of these instead (most to least common):

**1. Logs**

```bash
docker logs -f --tail 200 docker-discord-bot
```

**2. Run Node inside the container** — Node is the one tool that is there:

```bash
docker exec docker-discord-bot /nodejs/bin/node -e "console.log(require('fs').readdirSync('/app/settings'))"
docker exec docker-discord-bot /nodejs/bin/node -e "fetch('http://localhost:3021/health').then(r=>r.text()).then(console.log)"
```

**3. Attach a throwaway shell** that shares the bot's process namespace, network and
volumes, without changing the image:

```bash
docker run --rm -it \
  --pid=container:docker-discord-bot \
  --network=container:docker-discord-bot \
  --volumes-from docker-discord-bot \
  alpine sh
# then: ps aux, wget -qO- localhost:3021/health, cat /app/settings/settings.json, ...
```

(`docker debug docker-discord-bot` does the same in one step on Docker Desktop / newer CLIs.)

**4. Debug image** — same build with a busybox shell at `/busybox/sh`:

```bash
docker buildx build --push --platform linux/amd64,linux/arm64 \
  --build-arg DISTROLESS_TAG=debug \
  -t anshuljkt1/docker-discord-bot:debug .
```

Point the stack at `:debug` temporarily, then
`docker exec -it docker-discord-bot /busybox/sh`. Switch back to `:latest` when done.

## CI/CD

GitHub Actions ([.github/workflows/docker-build.yml](.github/workflows/docker-build.yml))
lints on Node 24 and, on pushes to `main`, builds multi-platform images and pushes them to
GitHub Container Registry (`ghcr.io`). Docker Hub images come from `make release`.

## Best Practices Implemented

1. Multi-stage build; only production `node_modules` reach the runtime image
2. Distroless runtime: no shell, package manager, npm or curl
3. Non-root user (uid 1000)
4. `tini` as PID 1 for signal handling and zombie reaping
5. `npm ci` against a committed lockfile
6. `.dockerignore` to keep the build context small
7. OCI labels (version, git revision, build date) on released images
