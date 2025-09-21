/**
 * Health check service for the Docker Discord Bot
 *
 * This provides an HTTP endpoint to check the health of various components:
 * - Discord connection status
 * - Docker socket connectivity
 * - Memory usage
 * - Uptime
 */

const http = require('http');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Configure port (defaults to 3021 as in the Dockerfile)
const PORT = process.env.HEALTH_CHECK_PORT || 3021;

// Reference to the Discord client (will be set via init)
let discordClient = null;
let dockerService = null;
let startTime = Date.now();

/**
 * Initialize the health check with references to key services
 * @param {Object} client - Discord.js client instance
 * @param {Object} docker - Docker service instance
 */
function init(client, docker) {
  discordClient = client;
  dockerService = docker;
  startTime = Date.now();
  startServer();
}

/**
 * Start the HTTP server for health checks
 */
function startServer() {
  const server = http.createServer(handleRequest);

  server.listen(PORT, () => {
    console.log(`[HealthCheck] Health check service running on port ${PORT}`);
  });

  server.on('error', (err) => {
    console.error('[HealthCheck] Server error:', err);
  });
}

/**
 * Handle incoming health check requests
 */
async function handleRequest(req, res) {
  // Only log health checks in development or if they fail
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[HealthCheck] Received health check request from ${req.socket.remoteAddress}`);
  }

  if (req.url === '/health') {
    try {
      const health = await checkHealth();

      // Set appropriate status code
      if (health.status === 'healthy') {
        res.statusCode = 200;
      } else if (health.status === 'degraded') {
        res.statusCode = 200; // Still return 200 for degraded since container should keep running
      } else {
        res.statusCode = 500;
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(health, null, 2));

    } catch (error) {
      console.error('[HealthCheck] Error during health check:', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      }));
    }
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
}

/**
 * Check overall system health
 * @returns {Object} Health check results
 */
async function checkHealth() {
  // Lightweight health check - focus on essential services only
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    services: {
      discord: { status: 'unknown' },
      docker: { status: 'unknown' },
    },
  };

  // Check Discord connection (lightweight)
  if (discordClient) {
    try {
      health.services.discord = {
        status: discordClient.isReady() ? 'connected' : 'disconnected',
        ping: discordClient.ws.ping,
      };

      if (health.services.discord.status !== 'connected') {
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.discord = {
        status: 'error',
        error: error.message,
      };
      health.status = 'degraded';
    }
  } else {
    health.services.discord = { status: 'not_initialized' };
    health.status = 'degraded';
  }

  // Check Docker connectivity (lightweight - just socket availability)
  try {
    if (dockerService && dockerService.docker) {
      // Just ping Docker daemon instead of listing containers
      await dockerService.docker.ping();
      health.services.docker = { status: 'connected' };
    } else {
      // Fallback: Quick Docker socket test
      await execAsync('docker version --format "{{.Server.Version}}"', { timeout: 2000 });
      health.services.docker = { status: 'available' };
    }
  } catch (error) {
    health.services.docker = {
      status: 'error',
      error: error.message,
    };
    health.status = 'degraded';
  }

  // Quick memory check (only if critical)
  const freeMemPercent = os.freemem() / os.totalmem();
  if (freeMemPercent < 0.05) { // Only warn if < 5% free (was 10%)
    health.status = 'degraded';
    health.memory_warning = 'Critical memory usage detected';
  }

  return health;
}

module.exports = {
  init,
  startServer,
  checkHealth,
};
