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
          // jfFix disabled: Jellyfin no longer runs in Docker on this host.
          // Re-enable this choice (and the handler blocks below) if Jellyfin
          // is moved back into a container and needs the jellyfin+jellystat
          // restart dance.
          // { name: 'jfFix', value: 'jfFix' },
          // Ban/Unban IP moved to dedicated /fail2ban command.
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

      // jfFix disabled: Jellyfin no longer runs in Docker on this host.
      // // Special case for jfFix command
      // if (command === 'jfFix') {
      //   dockerName = 'jellyfin';
      //   console.log('[DockerCommand] jfFix command - targeting jellyfin container');
      // }

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

      // jfFix disabled: Jellyfin no longer runs in Docker on this host.
      // // Handle the jfFix command separately with real-time updates
      // if (command === 'jfFix') {
      //   console.log('[DockerCommand] Starting jfFix process...');
      //   await interaction.editReply('Starting jfFix process. This may take several minutes...\n\n```\nInitializing...\n```');
      //
      //   try {
      //     let lastUpdate = Date.now();
      //     const updateInterval = 3000; // Update every 3 seconds
      //
      //     // Progress callback for real-time updates
      //     const progressCallback = async (currentOutput) => {
      //       const now = Date.now();
      //       // Only update if enough time has passed to avoid rate limiting
      //       if (now - lastUpdate >= updateInterval) {
      //         try {
      //           await interaction.editReply(`jfFix in progress...\n\n\`\`\`\n${currentOutput}\n\`\`\``);
      //           lastUpdate = now;
      //         } catch (editError) {
      //           // If edit fails (maybe due to rate limiting), just log it and continue
      //           console.warn('[DockerCommand] Failed to update progress:', editError.message);
      //         }
      //       }
      //     };
      //
      //     // Run the long operation with progress updates
      //     const result = await dockerService.dockerCustomCommandJellyfinFix(progressCallback);
      //     console.log('[DockerCommand] jfFix completed successfully');
      //
      //     // Final update with completion status
      //     if (result.success) {
      //       await interaction.editReply(`✅ jfFix completed successfully!\n\n\`\`\`\n${result.output}\n\`\`\``);
      //     } else {
      //       await interaction.editReply(`⚠️ jfFix completed with issues:\n\n\`\`\`\n${result.output}\n\`\`\``);
      //     }
      //     return result.success;
      //   } catch (error) {
      //     console.error('[DockerCommand] jfFix failed:', error);
      //     await interaction.editReply(`❌ Error during jfFix: ${error.message}`);
      //     return false;
      //   }
      // }

      // Handle ban/unban IP commands
      // (Moved to /fail2ban command.)

      // Execute the command
      console.log(`[DockerCommand] Executing ${command} command on container ${dockerName}...`);

      try {
        switch (command) {
        case 'start': {
          const result = await dockerService.dockerCommandStart(dockerId);
          
          // Check if operation was successful using structured response
          if (result.success) {
            await interaction.editReply(`${interaction.user} ${dockerName} has been started\n\n**Details:**\n\`\n${result.output}\n\``);
          } else {
            await interaction.editReply(`Failed to start ${dockerName}\n\n**Details:**\n\`\n${result.output}\n\``);
          }
          break;
        }
        case 'stop': {
          const result = await dockerService.dockerCommandStop(dockerId);
          
          // Check if operation was successful using structured response
          if (result.success) {
            await interaction.editReply(`${interaction.user} ${dockerName} has been stopped\n\n**Details:**\n\`\n${result.output}\n\``);
          } else {
            await interaction.editReply(`Failed to stop ${dockerName}\n\n**Details:**\n\`\n${result.output}\n\``);
          }
          break;
        }
        case 'restart': {
          const result = await dockerService.dockerCommandRestart(dockerId);
          
          // Check if operation was successful using structured response
          if (result.success) {
            await interaction.editReply(`${interaction.user} ${dockerName} has been restarted\n\n**Details:**\n\`\n${result.output}\n\``);
          } else {
            await interaction.editReply(`Failed to restart ${dockerName}\n\n**Details:**\n\`\n${result.output}\n\``);
          }
          break;
        }
        case 'exec': {
          await interaction.editReply(`Arbitrary Exec commands are disabled for security reasons.`);
          return false;
          // if (!cliCommand) {
          //   await interaction.editReply('CLI command is required for exec operation');
          //   return false;
          // }
          // console.log(`[DockerCommand] Executing CLI command: ${cliCommand}`);
          // const result = await dockerService.dockerCommandExec(dockerId, cliCommand);
          
          // // For exec, always show the detailed output since that's what users want to see
          // if (result.success) {
          //   await interaction.editReply(`${interaction.user} Command executed in ${dockerName}\n\n**Output:**\n\`\`\`\n${result.output}\n\`\`\``);
          // } else {
          //   await interaction.editReply(`Failed to execute command in ${dockerName}\n\n**Details:**\n\`\`\`\n${result.output}\n\`\`\``);
          // }
          // return true;
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

    // Check if user is admin (admins have full access)
    if (settings.DiscordSettings.AdminIDs.includes(interaction.user.id)) {
      return true;
    }

    if (!interaction.member) {
      return false;
    }

    const userId = interaction.user.id;
    // In DMs, roles.cache can be undefined. Treat as no roles.
    const userRoles = interaction.member.roles?.cache;

    // Get user's permissions for this container
    const userPermissions = this.getUserContainerPermissions(settings, userId, userRoles, dockerName);
    
    // Check if user has permission for this specific command on this container
    return userPermissions.includes(command);
  },

  /**
   * Get all permissions a user has for a specific container
   * @param {Object} settings - Bot settings
   * @param {string} userId - Discord user ID
   * @param {Collection} userRoles - User's Discord roles
   * @param {string} containerName - Name of the container
   * @returns {Array<string>} Array of allowed commands for this container
   */
  getUserContainerPermissions(settings, userId, userRoles, containerName) {
    const permissions = new Set();

    // Add permissions from user-specific settings
    if (settings.DiscordSettings.UserPermissions?.[userId]?.[containerName]) {
      settings.DiscordSettings.UserPermissions[userId][containerName].forEach(perm => {
        permissions.add(perm);
      });
    }

    // Add permissions from role-based settings
    if (settings.DiscordSettings.RolePermissions && userRoles) {
      for (const [roleId, rolePerms] of Object.entries(settings.DiscordSettings.RolePermissions)) {
        if (userRoles.has(roleId) && rolePerms[containerName]) {
          rolePerms[containerName].forEach(perm => {
            permissions.add(perm);
          });
        }
      }
    }

    return Array.from(permissions);
  },

  /**
   * Get all containers a user has any permission to access
   * @param {Object} settings - Bot settings
   * @param {string} userId - Discord user ID
   * @param {Collection} userRoles - User's Discord roles
   * @returns {Array<string>} Array of container names the user can access
   */
  getUserVisibleContainers(settings, userId, userRoles) {
    const containers = new Set();

    // Add containers from user-specific permissions
    if (settings.DiscordSettings.UserPermissions?.[userId]) {
      Object.keys(settings.DiscordSettings.UserPermissions[userId]).forEach(container => {
        containers.add(container);
      });
    }

    // Add containers from role-based permissions
    if (settings.DiscordSettings.RolePermissions && userRoles) {
      for (const [roleId, rolePerms] of Object.entries(settings.DiscordSettings.RolePermissions)) {
        if (userRoles.has(roleId)) {
          Object.keys(rolePerms).forEach(container => {
            containers.add(container);
          });
        }
      }
    }

    return Array.from(containers);
  },
};
