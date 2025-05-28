/* dd-bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul

   This program is free software: you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation, either version 3 of the License, or
   (at your option) any later version.
*/

require('dotenv').config();
const { SettingsService } = require('./src/services/settingsService');
const { DockerService } = require('./src/services/dockerService');
const { DiscordService } = require('./src/services/discordService');
const healthCheck = require('./src/health-check');
const packageJson = require('./package.json');

async function main() {
  console.log('[MAIN] ===============================================');
  console.log('[MAIN] dd-bot starting up...');
  console.log('[MAIN] Version:', packageJson.version);
  console.log('[MAIN] Environment:', process.env.NODE_ENV || 'development');
  console.log('[MAIN] Node.js version:', process.version);
  console.log('[MAIN] Working directory:', process.cwd());
  console.log('[MAIN] ===============================================');

  try {
    // Initialize services
    console.log('[MAIN] Initializing SettingsService...');
    const settingsService = new SettingsService();
    const settings = await settingsService.loadSettings();
    console.log('[MAIN] Settings loaded successfully');

    // Log critical settings (without sensitive data)
    console.log('[MAIN] Bot name:', settings.DockerSettings?.BotName || 'Unknown');
    console.log('[MAIN] Admin IDs count:', settings.DiscordSettings?.AdminIDs?.length || 0);
    console.log('[MAIN] Token configured:', !!settings.DiscordSettings?.Token);
    console.log('[MAIN] Docker retries:', settings.DockerSettings?.Retries || 'Unknown');

    console.log('[MAIN] Initializing DockerService...');
    const dockerService = new DockerService(settings);
    await dockerService.dockerUpdate();
    console.log('[MAIN] Docker service initialized');

    console.log('[MAIN] Initializing DiscordService...');
    const discordService = new DiscordService(settings, dockerService, settingsService);

    // Initialize health check service
    console.log('[MAIN] Initializing health check service...');
    healthCheck.init(discordService.client, dockerService);

    // Set up graceful shutdown
    process.on('SIGINT', () => {
      console.log('[MAIN] Received SIGINT, shutting down gracefully...');
      discordService.client.destroy();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('[MAIN] Received SIGTERM, shutting down gracefully...');
      discordService.client.destroy();
      process.exit(0);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[MAIN] Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('[MAIN] Uncaught Exception:', error);
      process.exit(1);
    });

    // Start the Discord bot
    console.log('[MAIN] Starting docker-disco-bot...');
    await discordService.start();

    console.log('[MAIN] ✓ Bot is running successfully!');

  } catch (error) {
    console.error('[MAIN] CRITICAL: Error starting the bot:', error);
    console.error('[MAIN] Error stack:', error.stack);
    process.exit(1);
  }
}

main();
