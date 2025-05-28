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
    console.error(`[HealthCheck] Server error:`, err);
  });
}

/**
 * Handle incoming health check requests
 */
async function handleRequest(req, res) {
  console.log(`[HealthCheck] Received health check request from ${req.socket.remoteAddress}`);
  
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
      console.error(`[HealthCheck] Error during health check:`, error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
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
  // Start with base health information
  const health = {
    status: 'healthy', // Default to healthy, will be downgraded if issues found
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000), // Uptime in seconds
    version: process.env.npm_package_version || 'unknown',
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      memory: {
        total: Math.round(os.totalmem() / 1024 / 1024) + 'MB',
        free: Math.round(os.freemem() / 1024 / 1024) + 'MB',
        usage: Math.round((1 - os.freemem() / os.totalmem()) * 100) + '%'
      },
      cpuUsage: process.cpuUsage()
    },
    services: {
      discord: { status: 'unknown' },
      docker: { status: 'unknown' }
    }
  };
  
  // Check Discord connection
  if (discordClient) {
    try {
      health.services.discord = {
        status: discordClient.isReady() ? 'connected' : 'disconnected',
        ping: discordClient.ws.ping + 'ms',
        guilds: discordClient.guilds?.cache?.size || 0
      };
      
      if (health.services.discord.status !== 'connected') {
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.discord = {
        status: 'error',
        error: error.message
      };
      health.status = 'degraded';
    }
  } else {
    health.services.discord = { status: 'not_initialized' };
    health.status = 'degraded';
  }
  
  // Check Docker connectivity
  try {
    if (dockerService) {
      const containers = await dockerService.dockerUpdate();
      health.services.docker = {
        status: 'connected',
        containers: containers?.length || 0
      };
    } else {
      // Fallback: Try a simple Docker command if service isn't available
      await execAsync('docker ps -q');
      health.services.docker = { status: 'available' };
    }
  } catch (error) {
    health.services.docker = {
      status: 'error',
      error: error.message
    };
    health.status = 'degraded';
  }
  
  // Check for critical memory usage (>90%)
  if (os.freemem() / os.totalmem() < 0.1) {
    health.status = 'degraded';
    health.system.memory.warning = 'Critical memory usage detected';
  }
  
  return health;
}

module.exports = {
  init,
  startServer,
  checkHealth
};
