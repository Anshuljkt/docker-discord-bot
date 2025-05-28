/* dd-bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { SettingsService } = require('../services/settingsService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Manage bot admin permissions')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add an admin')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to add as an admin')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove an admin')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to remove from admins')
            .setRequired(true),
        ),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all admins'),
    ),

  async execute(interaction) {
    console.log(`[AdminCommand] Executing admin command for user: ${interaction.user.tag} (${interaction.user.id})`);

    try {
      // Create a new settings service instance
      const settingsService = new SettingsService();

      // Load settings
      const settings = await settingsService.loadSettings();

      // Handle different sub-commands
      const subCommand = interaction.options.getSubcommand();

      switch (subCommand) {
      case 'add': {
        const user = interaction.options.getUser('user');
        const userId = user.id;

        // Check if user is already an admin
        if (settings.DiscordSettings.AdminIDs.includes(userId)) {
          await interaction.editReply(`User ${user.tag} is already an admin.`);
          return true;
        }

        // Add user to admin list
        settings.DiscordSettings.AdminIDs.push(userId);
        await settingsService.saveSettings(settings);

        await interaction.editReply(`Added ${user.tag} to admin list successfully.`);
        return true;
      }

      case 'remove': {
        const user = interaction.options.getUser('user');
        const userId = user.id;

        // Check if user is an admin
        if (!settings.DiscordSettings.AdminIDs.includes(userId)) {
          await interaction.editReply(`User ${user.tag} is not an admin.`);
          return true;
        }

        // Remove user from admin list
        settings.DiscordSettings.AdminIDs = settings.DiscordSettings.AdminIDs.filter(id => id !== userId);
        await settingsService.saveSettings(settings);

        await interaction.editReply(`Removed ${user.tag} from admin list successfully.`);
        return true;
      }

      case 'list': {
        if (settings.DiscordSettings.AdminIDs.length === 0) {
          await interaction.editReply('No admins are configured.');
          return true;
        }

        // Fetch usernames for all admin IDs
        const adminUsers = [];
        for (const adminId of settings.DiscordSettings.AdminIDs) {
          try {
            const user = await interaction.client.users.fetch(adminId);
            adminUsers.push(`${user.tag} (${adminId})`);
          } catch (error) {
            adminUsers.push(`Unknown user (${adminId})`);
          }
        }

        await interaction.editReply(`**Admin Users:**\n${adminUsers.join('\n')}`);
        return true;
      }
      }
    } catch (error) {
      console.error('[AdminCommand] Error in admin command:', error);

      try {
        if (interaction.deferred) {
          await interaction.editReply('An error occurred while processing the command.');
        } else if (!interaction.replied) {
          await interaction.reply({ content: 'An error occurred while processing the command.', flags: 64 });
        } else {
          await interaction.followUp({ content: 'An error occurred while processing the command.', flags: 64 });
        }
      } catch (replyError) {
        console.error('[AdminCommand] Error sending error reply:', replyError);
      }
      return false;
    }
    return true;
  },
};
