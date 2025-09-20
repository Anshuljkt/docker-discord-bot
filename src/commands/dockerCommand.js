/* dd-bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('docker')
    .setDescription('Issue a command to Docker')
    .addStringOption(option =>
      option
        .setName('command')
        .setDescription('Choose a command')
        .setRequired(true)
        .addChoices(
          { name: 'Start', value: 'start' },
          { name: 'Stop', value: 'stop' },
          { name: 'Restart', value: 'restart' },
          { name: 'Execute', value: 'exec' },
          { name: 'jfFix', value: 'jfFix' },
        ),
    )
    .addStringOption(option =>
      option
        .setName('dockername')
        .setDescription('Choose a container')
        .setRequired(false),
    )
    .addStringOption(option =>
      option
        .setName('cli')
        .setDescription('Command to execute in the container')
        .setRequired(false),
    ),

  async execute(interaction) {
    console.log(`[DockerCommand] Executing docker command for user: ${interaction.user.tag} (${interaction.user.id})`);

    try {
      // Get services from the client
      const dockerService = interaction.client.dockerService;
      const settingsService = interaction.client.settingsService;
      const settings = await settingsService.loadSettings();

      if (!dockerService || !settingsService) {
        console.error('[DockerCommand] Services not available on client');
        await interaction.editReply('Internal error: Services not available');
        return false;
      }

      const command = interaction.options.getString('command');
      let dockerName = interaction.options.getString('dockername');
      const cliCommand = interaction.options.getString('cli');

      console.log(`[DockerCommand] Command: ${command}, Container: ${dockerName}, CLI: ${cliCommand || 'N/A'}`);

      // Special case for jfFix command
      if (command === 'jfFix') {
        dockerName = 'jellyfin';
        console.log('[DockerCommand] jfFix command - targeting jellyfin container');
      }

      // Check authorization
      console.log('[DockerCommand] Checking authorization...');
      if (!await this.checkAuthorization(interaction, command, dockerName)) {
        console.log('[DockerCommand] Authorization failed');
        await interaction.editReply('You are not allowed to use this command');
        return false;
      }
      console.log('[DockerCommand] Authorization passed');

      // Find the container
      const containers = await dockerService.dockerUpdate();
      const docker = containers.find(container =>
        container.Names.some(name => name.replace('/', '') === dockerName),
      );

      if (!docker) {
        console.log(`[DockerCommand] Container '${dockerName}' not found`);
        await interaction.editReply('Container doesn\'t exist!');
        return false;
      }

      const dockerId = docker.Id;
      console.log(`[DockerCommand] Found container: ${dockerName} (${dockerId.substring(0, 12)})`);

      // Check container status before executing command
      const isRunning = docker.State === 'running';
      console.log(`[DockerCommand] Container ${dockerName} state: ${docker.State}, Status: ${docker.Status}`);

      if (command === 'start' && isRunning) {
        await interaction.editReply(`${dockerName} is already running`);
        return true;
      }

      if ((command === 'stop' || command === 'restart') && !isRunning) {
        await interaction.editReply(`${dockerName} is already stopped`);
        return true;
      }

      // Handle the jfFix command separately with non-blocking execution
      if (command === 'jfFix') {
        console.log('[DockerCommand] Starting jfFix process...');
        await interaction.editReply('Starting jfFix process. This may take several minutes...');

        try {
          // Run the long operation and wait for it
          const result = await dockerService.dockerCustomCommandJellyfinFix();
          console.log('[DockerCommand] jfFix completed successfully');
          await interaction.followUp(`jfFix completed:\n\`\`\`\n${result}\n\`\`\``);
          return true;
        } catch (error) {
          console.error('[DockerCommand] jfFix failed:', error);
          await interaction.followUp(`Error during jfFix: ${error.message}`);
          return false;
        }
      }

      // Execute the command
      console.log(`[DockerCommand] Executing ${command} command on container ${dockerName}...`);

      try {
        switch (command) {
        case 'start': {
          const result = await dockerService.dockerCommandStart(dockerId);
          await interaction.editReply(`Start command executed:\n\`\`\`\n${result}\n\`\`\``);
          break;
        }
        case 'stop': {
          const result = await dockerService.dockerCommandStop(dockerId);
          await interaction.editReply(`Stop command executed:\n\`\`\`\n${result}\n\`\`\``);
          break;
        }
        case 'restart': {
          const result = await dockerService.dockerCommandRestart(dockerId);
          await interaction.editReply(`Restart command executed:\n\`\`\`\n${result}\n\`\`\``);
          break;
        }
        case 'exec': {
          if (!cliCommand) {
            await interaction.editReply('CLI command is required for exec operation');
            return false;
          }
          console.log(`[DockerCommand] Executing CLI command: ${cliCommand}`);
          const result = await dockerService.dockerCommandExec(dockerId, cliCommand);
          await interaction.editReply(`Exec command executed:\n\`\`\`\n${result}\n\`\`\``);
          return true;
        }
        }

        return true;
      } catch (error) {
        console.error('[DockerCommand] Error executing docker command:', error);
        await interaction.editReply(`Error executing command: ${error.message}`);
        return false;
      }
    } catch (error) {
      console.error('[DockerCommand] Error executing docker command:', error);
      console.error('[DockerCommand] Error stack:', error.stack);

      try {
        if (interaction.deferred) {
          await interaction.editReply(`Error executing command: ${error.message}`);
        } else if (!interaction.replied) {
          await interaction.reply({ content: `Error executing command: ${error.message}`, flags: 64 });
        } else {
          await interaction.followUp({ content: `Error executing command: ${error.message}`, flags: 64 });
        }
      } catch (replyError) {
        console.error('[DockerCommand] Error sending error reply:', replyError);
      }
      return false;
    }
  },

  async checkAuthorization(interaction, command, dockerName) {
    // Use the settings service from the client
    const settingsService = interaction.client.settingsService;
    const settings = await settingsService.loadSettings();

    // Check if user is admin
    if (settings.DiscordSettings.AdminIDs.includes(interaction.user.id)) {
      return true;
    }

    if (!interaction.member) {
      return false;
    }

    // Check user permissions
    const userId = interaction.user.id;
    if (['start'].includes(command)) {
      if (settings.DiscordSettings.UserStartPermissions[userId] &&
          settings.DiscordSettings.UserStartPermissions[userId].includes(dockerName)) {
        return true;
      }
    } else if (['stop', 'restart', 'exec', 'jfFix'].includes(command)) {
      if (settings.DiscordSettings.UserStopPermissions[userId] &&
          settings.DiscordSettings.UserStopPermissions[userId].includes(dockerName)) {
        return true;
      }
    }

    // Check role permissions
    const userRoles = interaction.member.roles.cache;

    if (['start'].includes(command)) {
      for (const [roleId, containers] of Object.entries(settings.DiscordSettings.RoleStartPermissions)) {
        if (userRoles.has(roleId) && containers.includes(dockerName)) {
          return true;
        }
      }
    } else if (['stop', 'restart', 'exec', 'jfFix'].includes(command)) {
      for (const [roleId, containers] of Object.entries(settings.DiscordSettings.RoleStopPermissions)) {
        if (userRoles.has(roleId) && containers.includes(dockerName)) {
          return true;
        }
      }
    }

    return false;
  },
};
