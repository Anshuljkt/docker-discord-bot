/* dd-bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DockerService } = require('../services/dockerService');
const { SettingsService } = require('../services/settingsService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('user')
    .setDescription('Manage user permissions for Docker containers')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add Docker permissions for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to give permissions to')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('container')
            .setDescription('The container name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('permission')
            .setDescription('Permission type to grant')
            .setRequired(true)
            .addChoices(
              { name: 'Start', value: 'start' },
              { name: 'Stop/Restart', value: 'stop' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove Docker permissions for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to remove permissions from')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('container')
            .setDescription('The container name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('permission')
            .setDescription('Permission type to remove')
            .setRequired(true)
            .addChoices(
              { name: 'Start', value: 'start' },
              { name: 'Stop/Restart', value: 'stop' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List Docker permissions for a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to check permissions for')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    // Defer reply IMMEDIATELY before any other operations to prevent timeout
    await interaction.deferReply();
    
    console.log(`[UserCommand] Executing user command for user: ${interaction.user.tag} (${interaction.user.id})`);
    
    try {
      // Create service instances for this command execution
      const settingsService = new SettingsService();
      const dockerService = new DockerService();
      
      // Load settings
      const settings = await settingsService.loadSettings();
      
      // Get command options
      const subCommand = interaction.options.getSubcommand();
      
      switch (subCommand) {
        case 'add': {
          const user = interaction.options.getUser('user');
          const container = interaction.options.getString('container');
          const permission = interaction.options.getString('permission');
          
          // Verify the container exists
          await dockerService.dockerUpdate();
          const containers = await dockerService.dockerUpdate();
          const containerExists = containers.some(c => 
            c.Names.some(name => name.replace('/', '') === container)
          );
          
          if (!containerExists) {
            await interaction.editReply(`Container "${container}" does not exist.`);
            return;
          }
          
          // Add permission to the appropriate dictionary
          await settingsService.updateUserPermissions(user.id, container, permission, 'add');
          
          await interaction.editReply(`Added ${permission} permission for ${user.tag} on container ${container}.`);
          break;
        }
        
        case 'remove': {
          const user = interaction.options.getUser('user');
          const container = interaction.options.getString('container');
          const permission = interaction.options.getString('permission');
          
          // Remove permission from the appropriate dictionary
          await settingsService.updateUserPermissions(user.id, container, permission, 'remove');
          
          await interaction.editReply(`Removed ${permission} permission for ${user.tag} on container ${container}.`);
          break;
        }
        
        case 'list': {
          const user = interaction.options.getUser('user');
          const userId = user.id;
          
          const startPermissions = settings.DiscordSettings.UserStartPermissions[userId] || [];
          const stopPermissions = settings.DiscordSettings.UserStopPermissions[userId] || [];
          
          let responseMessage = `**Permissions for ${user.tag}:**\n`;
          
          if (startPermissions.length === 0 && stopPermissions.length === 0) {
            responseMessage += 'No permissions configured.';
          } else {
            if (startPermissions.length > 0) {
              responseMessage += `**Start Permissions:**\n${startPermissions.join('\n')}\n\n`;
            }
            
            if (stopPermissions.length > 0) {
              responseMessage += `**Stop/Restart Permissions:**\n${stopPermissions.join('\n')}`;
            }
          }
          
          await interaction.editReply(responseMessage);
          break;
        }
      }
    } catch (error) {
      console.error('[UserCommand] Error in user command:', error);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply('An error occurred while processing the command.');
        } else if (!interaction.replied) {
          await interaction.reply({ content: 'An error occurred while processing the command.', flags: 64 });
        } else {
          await interaction.followUp({ content: 'An error occurred while processing the command.', flags: 64 });
        }
      } catch (replyError) {
        console.error('[UserCommand] Error sending error reply:', replyError);
      }
      return false;
    }
    return true;
  }
};
