/**
 * This script can be used to register slash commands during development
 */

require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const path = require('path');
const { SettingsService } = require('./services/settingsService');

// Immediately-invoked async function to allow use of await
(async () => {
  try {
    // Initialize settings service
    const settingsService = new SettingsService();
    const settings = await settingsService.loadSettings();

    const token = settings.DiscordSettings.Token;

    if (!token) {
      console.error('Bot token not found. Make sure your .env file or settings.json has a valid token.');
      process.exit(1);
    }

    // Get client ID from the token
    const rest = new REST({ version: '10' }).setToken(token);
    const clientId = Buffer.from(token.split('.')[0], 'base64').toString();

    console.log('Loading commands...');

    // Load command files
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      if ('data' in command) {
        commands.push(command.data.toJSON());
        console.log(`Loaded command: ${command.data.name}`);
      } else {
        console.warn(`The command at ${filePath} is missing the required data property.`);
      }
    }

    console.log(`Found ${commands.length} commands to register.`);

    rest.put(Routes.applicationCommands(clientId), { body: [] })
      .then(() => console.log('Successfully deleted all global commands.'))
      .catch(console.error);

    // Get guild IDs from settings or environment variable
    const guildIds = settings.DiscordSettings.GuildIDs || [];
    const envGuildId = process.env.GUILD_ID;

    // Add env guild ID if it's not already in the array
    if (envGuildId && !guildIds.includes(envGuildId)) {
      guildIds.push(envGuildId);
    }

    if (guildIds.length > 0) {
      console.log(`Found ${guildIds.length} guild(s) to register commands for.`);

      // Register commands for each specified guild
      for (const guildId of guildIds) {
        rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] })
          .then(() => console.log('Successfully deleted all guild commands.'))
          .catch(console.error);

        // console.log(`Registering commands for guild ${guildId}...`);
        // try {
        //   await rest.put(
        //     Routes.applicationGuildCommands(clientId, guildId),
        //     { body: commands }
        //   );
        //   console.log(`Commands registered successfully in guild ${guildId}.`);
        // } catch (error) {
        //   console.error(`Error registering commands for guild ${guildId}:`, error);
        // }
      }
    } else {
      // console.log('No specific guilds provided. Registering global commands (this may take up to 1 hour to propagate)...');
      // await rest.put(
      //   Routes.applicationCommands(clientId),
      //   { body: commands }
      // );
      // console.log('Global commands registered successfully.');
    }
  } catch (error) {
    console.error('Error registering commands:', error);
    process.exit(1);
  }
})();
