# Platform-compatible two-stage build for Node.js Discord bot
# Using Ubuntu-based images for better compatibility across ARM64/AMD64

# Stage 1: Build stage with all dependencies
FROM ubuntu:22.04 AS builder

WORKDIR /app

# Install Node.js 18 and build dependencies with cache optimization
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y \
    curl \
    python3 \
    make \
    g++ \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies using npm ci for reproducible builds
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Copy source code
COPY . .

# Stage 2: Production runtime
FROM ubuntu:22.04 AS production

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install Node.js 18 and curl for healthcheck with cache optimization
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Copy package files
COPY package*.json ./

# Install dependencies (all)
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Copy application files from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/index.js ./
COPY --from=builder /app/test-container-states.js ./
COPY --from=builder /app/test-docker.js ./

# Create settings directory
RUN mkdir -p /app/settings && \
    chmod -R 777 /app

# Health check configuration
ENV HEALTH_CHECK_PORT=3021
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:$HEALTH_CHECK_PORT/health || exit 1

# Run the application with explicit event loop flags to improve stability across platforms
CMD ["node", "--unhandled-rejections=strict", "--trace-warnings", "index.js"]
