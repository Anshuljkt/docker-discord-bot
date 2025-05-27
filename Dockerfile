# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install build tools
RUN apk add --no-cache python3 make g++

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies including devDependencies
# Using npm install instead of npm ci to ensure dependencies are installed correctly
# when package-lock.json might be out of sync
RUN npm install

# Copy source files
COPY . .

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install only the packages needed for production
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install production dependencies only
# Using npm install with --omit=dev instead of npm ci to handle out-of-sync package-lock.json
RUN npm install --omit=dev

# Copy built application from builder stage
COPY --from=builder /app/src ./src
COPY --from=builder /app/index.js ./
COPY --from=builder /app/test-container-states.js ./
COPY --from=builder /app/test-docker.js ./

# Create directory for settings if it doesn't exist
RUN mkdir -p /app/settings

# Set environment variables
ENV NODE_ENV=production

# Set proper permissions for the Docker socket access
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "try { require('http').get('http://localhost:3000/health', res => res.statusCode === 200 ? process.exit(0) : process.exit(1)); } catch (e) { process.exit(1); }"

# Command to run the application
CMD ["node", "index.js"]
