/* dd-bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DockerService } = require('../services/dockerService');
const { SettingsService } = require('../services/settingsService');

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
          { name: 'All', value: 'all' }
        )
    ),

  async execute(interaction) {
    console.log(`[DEBUG] List command executed by user: ${interaction.user.tag}`);
    await interaction.deferReply();
    
    try {
      console.log('[DEBUG] Creating service instances...');
      // Create service instances for this command execution
      const settingsService = new SettingsService();
      const settings = await settingsService.loadSettings();
      console.log('[DEBUG] Settings loaded successfully');
      
      const dockerService = new DockerService(settings);
      console.log('[DEBUG] DockerService instance created');
      
      // Get the filter option (default to 'all' if not provided)
      const filter = interaction.options.getString('filter') || 'all';
      console.log(`[DEBUG] Filter option: ${filter}`);
      
      // Update container list
      console.log('[DEBUG] Updating container list...');
      await dockerService.dockerUpdate();
      const containers = await dockerService.dockerUpdate();
      console.log(`[DEBUG] Retrieved ${containers.length} containers from Docker`);
      
      // Print complete container list to logs
      console.log('[DEBUG] Complete container list:');
      containers.forEach((container, index) => {
        console.log(`[DEBUG] Container ${index + 1}:`, {
          Names: container.Names,
          State: container.State,
          Status: container.Status,
          Image: container.Image,
          Id: container.Id,
          Created: container.Created,
          Ports: container.Ports
        });
      });
      
      // Filter containers based on option
      let filteredContainers;
      if (filter === 'running') {
        filteredContainers = containers.filter(container => container.State === 'running');
        console.log(`[DEBUG] Filtered to ${filteredContainers.length} running containers`);
      } else if (filter === 'stopped') {
        filteredContainers = containers.filter(container => container.State !== 'running');
        console.log(`[DEBUG] Filtered to ${filteredContainers.length} stopped containers`);
      } else {
        filteredContainers = containers;
        console.log(`[DEBUG] Showing all ${filteredContainers.length} containers`);
      }

      // Check if there are containers to display
      if (filteredContainers.length === 0) {
        console.log(`[DEBUG] No ${filter !== 'all' ? filter : ''} containers found, sending empty response`);
        await interaction.editReply(`No ${filter !== 'all' ? filter : ''} containers found.`);
        return;
      }

      // Find the longest container name for formatting
      let longestName = 0;
      filteredContainers.forEach(container => {
        const name = container.Names[0].replace('/', '');
        if (name.length > longestName) {
          longestName = name.length;
        }
      });
      console.log(`[DEBUG] Longest container name length: ${longestName}`);

      // Group containers in chunks to avoid message size limit
      const containerGroups = this.chunkArray(filteredContainers, settings.DockerSettings.ContainersPerMessage);
      console.log(`[DEBUG] Split containers into ${containerGroups.length} groups (${settings.DockerSettings.ContainersPerMessage} containers per message)`);
      
      // Create and send embeds for each group
      for (let i = 0; i < containerGroups.length; i++) {
        console.log(`[DEBUG] Creating embed ${i + 1}/${containerGroups.length} with ${containerGroups[i].length} containers`);
        
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
          console.log('[DEBUG] Sending initial reply with first embed');
          await interaction.editReply({ embeds: [embed] });
        } else {
          console.log(`[DEBUG] Sending follow-up message ${i + 1}`);
          await interaction.followUp({ embeds: [embed] });
        }
      }
      
      console.log('[DEBUG] List command completed successfully');
    } catch (error) {
      console.error('[DEBUG] Error in list command:', error);
      console.error('[DEBUG] Error stack:', error.stack);
      await interaction.editReply('An error occurred while fetching the container list.');
    }
  },

  // Helper method to chunk an array
  chunkArray(array, chunkSize) {
    const result = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      result.push(array.slice(i, i + chunkSize));
    }
    return result;
  }
};
