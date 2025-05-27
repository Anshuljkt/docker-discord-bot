# Optimized two-stage build for Node.js Discord bot

# Stage 1: Build stage with all dependencies
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies only when needed
RUN apk add --no-cache python3 make g++

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including dev dependencies for potential build steps)
RUN npm install

# Copy source code
COPY . .

# Clean up build dependencies
RUN apk del python3 make g++

# Stage 2: Production runtime
FROM node:18-alpine AS production

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev --no-optional --prefer-offline && \
    npm cache clean --force && \
    rm -rf /tmp/* /var/cache/apk/*

# Copy application files from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/index.js ./
COPY --from=builder /app/test-container-states.js ./
COPY --from=builder /app/test-docker.js ./

# Create settings directory
RUN mkdir -p /app/settings && \
    chmod -R 777 /app

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "try { require('http').get('http://localhost:3000/health', res => res.statusCode === 200 ? process.exit(0) : process.exit(1)); } catch (e) { process.exit(1); }"

# Run the application
CMD ["node", "index.js"]
