/* dd-bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const dockerCommand = require('./dockerCommand');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all Docker containers')
    .addStringOption(option =>
      option
        .setName('filter')
        .setDescription('Filter containers')
        .setRequired(false)
        .addChoices(
          { name: 'Running', value: 'running' },
          { name: 'Stopped', value: 'stopped' },
          { name: 'All', value: 'all' },
        ),
    ),

  async execute(interaction) {
    console.log(`[ListCommand] Executing list command for user: ${interaction.user.tag} (${interaction.user.id})`);

    try {
      console.log('[ListCommand] Loading services from client...');
      // Reuse the singletons attached to the client by DiscordService
      // instead of building fresh instances every invocation.
      const settingsService = interaction.client.settingsService;
      const dockerService = interaction.client.dockerService;
      const settings = await settingsService.loadSettings();
      console.log('[ListCommand] Settings loaded successfully');

      // Get the filter option (default to 'all' if not provided)
      const filter = interaction.options.getString('filter') || 'all';
      console.log(`[ListCommand] Filter option: ${filter}`);

      // Update container list
      console.log('[ListCommand] Updating container list...');
      await dockerService.dockerUpdate();
      const containers = await dockerService.dockerUpdate();
      console.log(`[ListCommand] Retrieved ${containers.length} containers from Docker`);

      // Filter containers based on user permissions
      let accessibleContainers = containers;
      const userId = interaction.user.id;
      
      // If not admin, filter to only containers user has access to
      if (!settings.DiscordSettings.AdminIDs.includes(userId)) {
        const userRoles = interaction.member?.roles?.cache;
        const allowedContainerNames = dockerCommand.getUserVisibleContainers(settings, userId, userRoles);
        
        accessibleContainers = containers.filter(container => {
          const containerName = container.Names[0].replace('/', '');
          return allowedContainerNames.includes(containerName);
        });
        
        console.log(`[ListCommand] User ${interaction.user.tag} has access to ${accessibleContainers.length} containers`);
      } else {
        console.log(`[ListCommand] User ${interaction.user.tag} is admin - showing all containers`);
      }

      // Filter containers based on status option
      let filteredContainers;
      if (filter === 'running') {
        filteredContainers = accessibleContainers.filter(container => container.State === 'running');
        console.log(`[ListCommand] Filtered to ${filteredContainers.length} running containers`);
      } else if (filter === 'stopped') {
        filteredContainers = accessibleContainers.filter(container => container.State !== 'running');
        console.log(`[ListCommand] Filtered to ${filteredContainers.length} stopped containers`);
      } else {
        filteredContainers = accessibleContainers;
        console.log(`[ListCommand] Showing all ${filteredContainers.length} accessible containers`);
      }

      // Check if there are containers to display
      if (filteredContainers.length === 0) {
        const message = accessibleContainers.length === 0 
          ? "You don't have permission to view any containers."
          : `No ${filter !== 'all' ? filter : ''} containers found.`;
        console.log(`[ListCommand] No containers to show: ${message}`);
        return interaction.editReply(message);
      }

      // Find the longest container name for formatting
      let longestName = 0;
      filteredContainers.forEach(container => {
        const name = container.Names[0].replace('/', '');
        if (name.length > longestName) {
          longestName = name.length;
        }
      });
      console.log(`[ListCommand] Longest container name length: ${longestName}`);

      // Group containers in chunks to avoid message size limit
      const containerGroups = this.chunkArray(filteredContainers, settings.DockerSettings.ContainersPerMessage);
      console.log(`[ListCommand] Split containers into ${containerGroups.length} groups (${settings.DockerSettings.ContainersPerMessage} containers per message)`);

      // Create and send embeds for each group
      for (let i = 0; i < containerGroups.length; i++) {
        console.log(`[ListCommand] Creating embed ${i + 1}/${containerGroups.length} with ${containerGroups[i].length} containers`);

        const embed = new EmbedBuilder()
          .setTitle(`Docker Container List (${filter})`)
          .setColor(filter === 'running' ? '#00FF00' : filter === 'stopped' ? '#FF0000' : '#0099FF')
          .setTimestamp();

        let description = '```\n';
        containerGroups[i].forEach(container => {
          const name = container.Names[0].replace('/', '');
          const status = container.State;
          const statusEmoji = status === 'running' ? '✅' : '❌';

          // Pad the name to align the status
          const paddedName = name.padEnd(longestName + 2);
          description += `${paddedName} ${statusEmoji} ${status}\n`;
        });
        description += '```';

        embed.setDescription(description);

        if (i === 0) {
          console.log('[ListCommand] Sending initial reply with first embed');
          await interaction.editReply({ embeds: [embed] });
        } else {
          console.log(`[ListCommand] Sending follow-up message ${i + 1}`);
          await interaction.followUp({ embeds: [embed] });
        }
      }

      console.log('[ListCommand] List command completed successfully');
      return true;
    } catch (error) {
      console.error('[ListCommand] Error in list command:', error);
      console.error('[ListCommand] Error stack:', error.stack);

      try {
        if (interaction.deferred) {
          await interaction.editReply('An error occurred while fetching the container list.');
        } else if (!interaction.replied) {
          await interaction.reply({ content: 'An error occurred while fetching the container list.', flags: 64 });
        } else {
          await interaction.followUp({ content: 'An error occurred while fetching the container list.', flags: 64 });
        }
      } catch (replyError) {
        console.error('[ListCommand] Error sending error reply:', replyError);
      }
      return false;
    }
  },

  // Helper method to chunk an array
  chunkArray(array, chunkSize) {
    const result = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      result.push(array.slice(i, i + chunkSize));
    }
    return result;
  },
};
