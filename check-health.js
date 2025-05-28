#!/usr/bin/env node
/**
 * Standalone health check utility
 * 
 * This script can be used to check the health of a running bot instance.
 * 
 * Usage:
 *   node check-health.js [port]
 * 
 * Example:
 *   node check-health.js 3021
 */

const http = require('http');

// Get port from command line or use default
const port = process.argv[2] || process.env.HEALTH_CHECK_PORT || 3021;
const url = `http://localhost:${port}/health`;

console.log(`Checking bot health at ${url}...`);

http.get(url, (res) => {
  const { statusCode } = res;
  const contentType = res.headers['content-type'];

  let error;
  if (statusCode !== 200) {
    error = new Error(`Request Failed. Status Code: ${statusCode}`);
  } else if (!/^application\/json/.test(contentType)) {
    error = new Error(`Invalid content-type. Expected application/json but received ${contentType}`);
  }
  
  if (error) {
    console.error(error.message);
    // Consume response data to free up memory
    res.resume();
    process.exit(1);
    return;
  }

  res.setEncoding('utf8');
  let rawData = '';
  
  res.on('data', (chunk) => { rawData += chunk; });
  
  res.on('end', () => {
    try {
      const health = JSON.parse(rawData);
      
      // Print overall status
      console.log(`\nHealth Status: ${health.status.toUpperCase()}`);
      console.log(`Timestamp: ${health.timestamp}`);
      console.log(`Uptime: ${formatDuration(health.uptime)}`);
      console.log(`Version: ${health.version}`);
      
      // Print Discord status
      console.log(`\nDiscord: ${health.services.discord.status}`);
      if (health.services.discord.ping) {
        console.log(`Discord Ping: ${health.services.discord.ping}`);
      }
      if (health.services.discord.guilds) {
        console.log(`Connected Guilds: ${health.services.discord.guilds}`);
      }
      
      // Print Docker status
      console.log(`\nDocker: ${health.services.docker.status}`);
      if (health.services.docker.containers) {
        console.log(`Docker Containers: ${health.services.docker.containers}`);
      }
      
      // Print system info
      console.log(`\nSystem:`);
      console.log(`Platform: ${health.system.platform} ${health.system.arch}`);
      console.log(`Node.js: ${health.system.nodeVersion}`);
      console.log(`Memory: ${health.system.memory.usage} used (${health.system.memory.free} free / ${health.system.memory.total} total)`);
      
      if (health.status !== 'healthy') {
        process.exit(1);
      } else {
        process.exit(0);
      }
    } catch (e) {
      console.error(`Error parsing health check response: ${e.message}`);
      process.exit(1);
    }
  });
}).on('error', (e) => {
  console.error(`Health check request error: ${e.message}`);
  console.error(`Bot may not be running or health check service is not accessible.`);
  process.exit(1);
});

/**
 * Format duration in seconds to a readable string
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes} minutes, ${secs} seconds`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} hours, ${minutes} minutes`;
  }
}
