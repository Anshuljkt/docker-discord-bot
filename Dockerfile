# Three-stage build process for optimal image size

# Stage 1: Dependencies
FROM node:18-alpine AS deps

WORKDIR /app

# Copy only package files for dependency installation
COPY package*.json ./

# Install all dependencies including dev dependencies
RUN apk add --no-cache python3 make g++ && \
    npm install && \
    # Remove build dependencies once installed
    apk del make g++

# Stage 2: Builder - for any build/compile tasks
FROM node:18-alpine AS builder

WORKDIR /app

# Copy dependencies from first stage
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Copy source code
COPY . .

# If you need to build TypeScript or perform other build tasks
# RUN npm run build

# Stage 3: Production - minimal runtime
FROM node:18-alpine AS production

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production

# Copy package files for production
COPY package*.json ./

# Install only production dependencies with minimal footprint
RUN npm install --omit=dev --no-optional --prefer-offline --no-audit && \
    npm cache clean --force && \
    # Remove npm to further decrease image size (it's not needed at runtime)
    rm -rf /usr/local/lib/node_modules/npm && \
    # Clean up unnecessary files
    rm -rf /tmp/* /var/cache/apk/*

# Copy only necessary files from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/index.js ./
COPY --from=builder /app/test-container-states.js ./
COPY --from=builder /app/test-docker.js ./

# Create directory for settings if it doesn't exist
RUN mkdir -p /app/settings && \
    # Set proper permissions for node_modules and application directories
    chmod -R 777 /app

# We don't set a specific USER here so the container can be run as any user
# Docker socket permissions will need to be handled at runtime
# The container will run as root by default unless specified otherwise in docker-compose.yml or docker run command

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "try { require('http').get('http://localhost:3000/health', res => res.statusCode === 200 ? process.exit(0) : process.exit(1)); } catch (e) { process.exit(1); }"

# Command to run the application
CMD ["node", "index.js"]
