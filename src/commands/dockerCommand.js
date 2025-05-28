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
        .setName('dockername')
        .setDescription('Choose a container')
        .setRequired(true),
    )
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
          { name: 'JF Fix', value: 'jfFix' },
        ),
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
        console.log('[DockerCommand] JF Fix command - targeting jellyfin container');
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
        console.log('[DockerCommand] Starting JF Fix process...');
        await interaction.editReply('Starting JF Fix process. This may take several minutes...');

        try {
          // Run the long operation and wait for it
          const result = await dockerService.dockerCustomCommandJFFix();
          console.log('[DockerCommand] JF Fix completed successfully');
          await interaction.followUp(`JF Fix completed:\n\`\`\`\n${result}\n\`\`\``);
          return true;
        } catch (error) {
          console.error('[DockerCommand] JF Fix failed:', error);
          await interaction.followUp(`Error during JF Fix: ${error.message}`);
          return false;
        }
      }

      // Execute the command
      console.log(`[DockerCommand] Executing ${command} command on container ${dockerName}...`);

      try {
        switch (command) {
        case 'start': {
          await dockerService.dockerCommandStart(dockerId);
          break;
        }
        case 'stop': {
          await dockerService.dockerCommandStop(dockerId);
          break;
        }
        case 'restart': {
          await dockerService.dockerCommandRestart(dockerId);
          break;
        }
        case 'exec': {
          if (!cliCommand) {
            await interaction.editReply('CLI command is required for exec operation');
            return false;
          }
          console.log(`[DockerCommand] Executing CLI command: ${cliCommand}`);
          const result = await dockerService.dockerCommandExec(dockerId, cliCommand);
          await interaction.editReply(`${interaction.user} Response from Script (Stdout): \n${result}`);
          return true;
        }
        }

        await interaction.editReply(`Command has been sent. Awaiting response. This will take up to ${settings.DockerSettings.Retries * settings.DockerSettings.TimeBeforeRetry} seconds.`);

        // Poll for container status change
        console.log(`[DockerCommand] Polling for status change (${settings.DockerSettings.Retries} retries)...`);
        for (let i = 0; i < settings.DockerSettings.Retries; i++) {
          await new Promise(resolve => setTimeout(resolve, settings.DockerSettings.TimeBeforeRetry * 1000));

          // Single dockerUpdate call instead of two
          const updatedContainers = await dockerService.dockerUpdate();
          const updatedContainer = updatedContainers.find(c => c.Id === dockerId);

          if (!updatedContainer) {
            console.log(`[DockerCommand] Cannot find container ${dockerId} after update (retry ${i + 1})`);
            continue;
          }

          console.log(`[DockerCommand] Updated container state: ${updatedContainer.State}, Status: ${updatedContainer.Status}`);
          const newStatus = updatedContainer.State === 'running';

          if ((command === 'start' || command === 'restart') && newStatus) {
            console.log(`[DockerCommand] Container ${dockerName} successfully ${command === 'start' ? 'started' : 'restarted'}`);
            await interaction.editReply(`${interaction.user} ${dockerName} has been ${command === 'start' ? 'started' : 'restarted'}`);
            return true;
          } else if (command === 'stop' && !newStatus) {
            console.log(`[DockerCommand] Container ${dockerName} successfully stopped`);
            await interaction.editReply(`${interaction.user} ${dockerName} has been stopped`);
            return true;
          }
        }

        // Final check after all retries
        console.log('[DockerCommand] Performing final status check...');
        const finalContainers = await dockerService.dockerUpdate();
        const finalContainer = finalContainers.find(c => c.Id === dockerId);

        if (finalContainer) {
          const finalStatus = finalContainer.State === 'running';

          if ((command === 'start' || command === 'restart') && finalStatus) {
            console.log(`[DockerCommand] Final check: Container ${dockerName} is running`);
            await interaction.editReply(`${interaction.user} ${dockerName} has been ${command === 'start' ? 'started' : 'restarted'}`);
            return true;
          } else if (command === 'stop' && !finalStatus) {
            console.log(`[DockerCommand] Final check: Container ${dockerName} is stopped`);
            await interaction.editReply(`${interaction.user} ${dockerName} has been stopped`);
            return true;
          } else {
            console.log(`[DockerCommand] Final check: Container ${dockerName} operation may have failed`);
            await interaction.editReply(`${interaction.user} ${dockerName} could not be ${command}ed`);
            return false;
          }
        } else {
          console.log(`[DockerCommand] Final check: Container ${dockerName} not found`);
          await interaction.editReply(`${interaction.user} ${dockerName} could not be found after command execution`);
          return false;
        }
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
