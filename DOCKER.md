# Docker Setup Documentation

This document outlines the Docker setup for the Docker Discord Bot project.

## Project Overview

Docker Discord Bot is a Discord bot designed to manage Docker containers through Discord commands. It allows authorized users to start, stop, and check the status of Docker containers directly from Discord.

## Docker Configuration

### Production Setup

#### Building the Docker Image

```bash
# Using make command
make build

# Or using docker directly
docker build -t docker-discord-bot .
```

The optimized Dockerfile implements a three-stage build process:
1. **Dependencies Stage**: Installs production dependencies
2. **Builder Stage**: Compiles and prepares the application
3. **Production Stage**: Creates a minimal production image

This approach has reduced the image size from 727MB to 266MB (63% reduction).

#### Running the Docker Container

```bash
# Using docker-compose
docker-compose up -d

# Or using docker directly
docker run -d \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v $(pwd)/settings:/app/settings \
  --env-file .env \
  --name docker-discord-bot \
  docker-discord-bot
```

### Development Setup

For local development with hot-reloading:

```bash
# Using docker-compose
docker-compose -f docker-compose.yml up discord-bot-dev

# Or build and run the development container directly
docker build -f Dockerfile.dev -t docker-discord-bot-dev .
docker run -it \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v $(pwd):/app \
  -v /app/node_modules \
  --env-file .env \
  docker-discord-bot-dev
```

## Environment Variables

Create a `.env` file in the project root with the following variables:

```plaintext
DISCORD_TOKEN=your_discord_bot_token
ADMIN_ID=your_discord_admin_id
```

## Docker Volumes

The project uses the following volumes:
- `/var/run/docker.sock:/var/run/docker.sock` - Allows the bot to interact with the Docker daemon
- `./settings:/app/settings` - Mounts the settings directory for configuration

## Multi-Platform Builds

The project supports multi-platform builds using Docker Buildx. This allows the bot to run on different architectures (amd64, arm64).

```bash
# Using make command
make buildx

# Or using docker directly
docker buildx build --platform linux/amd64,linux/arm64 -t docker-discord-bot:latest .
```

## CI/CD Setup

The project uses GitHub Actions for continuous integration and deployment. The workflow includes:
- Linting the codebase
- Building multi-platform Docker images
- Pushing images to GitHub Container Registry

## Maintenance & Optimization Tools

### Dependency Analysis

```bash
node analyze-deps.js
```

This script helps identify unused dependencies and suggests optimizations.

### Docker Image Size Analysis

```bash
./analyze-docker-size.sh
```

This script analyzes the Docker image layers and provides insights on size optimization.

## Best Practices Implemented

1. Multi-stage builds to reduce image size
2. Alpine-based images for smaller footprint
3. Proper dependency management with package.json
4. .dockerignore and .gitignore to exclude unnecessary files
5. Resource limits for container deployment
6. Read-only bind mounts for security
7. Proper logging configuration
8. Docker layer optimization
