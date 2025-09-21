/* dd-bot - A Discord Bot to control Docker containers
   Copyright (C) 2022 Maxim Kovac - Rewritten to JS by Anshul
*/

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { DockerService } = require('../services/dockerService');
const { SettingsService } = require('../services/settingsService');
const { getUserVisibleContainers, getUserContainerPermissions } = require('./dockerCommand');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permission')
    .setDescription('Manage all bot permissions and admins')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View permissions for a user or role')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to view permissions for (optional)')
            .setRequired(false))
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to view permissions for (optional)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add permission for a user or role')
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Add permission to user or role')
            .setRequired(true)
            .addChoices(
              { name: 'User', value: 'user' },
              { name: 'Role', value: 'role' }
            ))
        .addStringOption(option =>
          option
            .setName('container')
            .setDescription('Container name')
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('command')
            .setDescription('Command to allow')
            .setRequired(true)
            .addChoices(
              { name: 'start', value: 'start' },
              { name: 'stop', value: 'stop' },
              { name: 'restart', value: 'restart' },
              { name: 'exec', value: 'exec' },
              { name: 'jfFix', value: 'jfFix' },
              { name: 'banIP', value: 'banIP' },
              { name: 'unbanIP', value: 'unbanIP' }
            ))
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to add permission for')
            .setRequired(false))
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to add permission for')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove permission for a user or role')
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('Remove permission from user or role')
            .setRequired(true)
            .addChoices(
              { name: 'User', value: 'user' },
              { name: 'Role', value: 'role' }
            ))
        .addStringOption(option =>
          option
            .setName('container')
            .setDescription('Container name')
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('command')
            .setDescription('Command to remove')
            .setRequired(true)
            .addChoices(
              { name: 'start', value: 'start' },
              { name: 'stop', value: 'stop' },
              { name: 'restart', value: 'restart' },
              { name: 'exec', value: 'exec' },
              { name: 'jfFix', value: 'jfFix' },
              { name: 'banIP', value: 'banIP' },
              { name: 'unbanIP', value: 'unbanIP' }
            ))
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to remove permission from')
            .setRequired(false))
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('Role to remove permission from')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all configured permissions'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('admin-add')
        .setDescription('Add a bot administrator')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to add as bot administrator')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('admin-remove')
        .setDescription('Remove a bot administrator')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to remove from bot administrators')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('admin-list')
        .setDescription('List all bot administrators'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    console.log(`[PermissionCommand] Executing permission command for user: ${interaction.user.tag} (${interaction.user.id})`);

    try {
      await interaction.deferReply();

      // Create service instances
      const settingsService = new SettingsService();
      const dockerService = new DockerService();
      const settings = await settingsService.loadSettings();

      const userId = interaction.user.id;
      const isAdmin = settings.DiscordSettings.AdminIDs.includes(userId);

      if (!isAdmin) {
        await interaction.editReply('❌ Only administrators can manage permissions.');
        return false;
      }

      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case 'view':
          return await this.handleView(interaction, settings, dockerService);
        
        case 'add':
          return await this.handleAdd(interaction, settings, settingsService, dockerService);
        
        case 'remove':
          return await this.handleRemove(interaction, settings, settingsService, dockerService);
        
        case 'list':
          return await this.handleList(interaction, settings);

        case 'admin-add':
          return await this.handleAdminAdd(interaction, settings, settingsService);
        
        case 'admin-remove':
          return await this.handleAdminRemove(interaction, settings, settingsService);
        
        case 'admin-list':
          return await this.handleAdminList(interaction, settings);
        
        default:
          await interaction.editReply('❌ Unknown subcommand.');
          return false;
      }

    } catch (error) {
      console.error('[PermissionCommand] Error in permission command:', error);
      
      try {
        await interaction.editReply('❌ An error occurred while processing the command.');
      } catch (replyError) {
        console.error('[PermissionCommand] Error sending error reply:', replyError);
      }
      return false;
    }
  },

  async handleView(interaction, settings, dockerService) {
    const targetUser = interaction.options.getUser('user');
    const targetRole = interaction.options.getRole('role');

    if (!targetUser && !targetRole) {
      // Show current user's permissions
      const userId = interaction.user.id;
      const userRoles = interaction.member.roles.cache;
      
      await dockerService.dockerUpdate();
      const visibleContainers = getUserVisibleContainers(settings, userId, userRoles);
      
      let responseMessage = `**Your Docker Container Permissions:**\n\n`;
      
      if (settings.DiscordSettings.AdminIDs.includes(userId)) {
        responseMessage += '🔑 **You are an administrator!** You have full access to all containers.\n\n';
      }
      
      if (visibleContainers.length === 0) {
        responseMessage += '❌ You do not have any container permissions.';
      } else {
        responseMessage += '**Accessible Containers:**\n';
        visibleContainers.forEach(container => {
          const permissions = getUserContainerPermissions(settings, userId, userRoles, container);
          responseMessage += `• **${container}**: \`${permissions.join(', ')}\`\n`;
        });
      }
      
      await interaction.editReply(responseMessage);
      return true;
    }

    if (targetUser) {
      // Show specific user's permissions
      const userPerms = settings.DiscordSettings.UserPermissions[targetUser.id] || {};
      let responseMessage = `**Permissions for ${targetUser.tag}:**\n\n`;
      
      if (Object.keys(userPerms).length === 0) {
        responseMessage += '❌ No user-specific permissions configured.';
      } else {
        Object.entries(userPerms).forEach(([container, commands]) => {
          responseMessage += `• **${container}**: \`${commands.join(', ')}\`\n`;
        });
      }
      
      await interaction.editReply(responseMessage);
      return true;
    }

    if (targetRole) {
      // Show specific role's permissions
      const rolePerms = settings.DiscordSettings.RolePermissions[targetRole.id] || {};
      let responseMessage = `**Permissions for role ${targetRole.name}:**\n\n`;
      
      if (Object.keys(rolePerms).length === 0) {
        responseMessage += '❌ No permissions configured for this role.';
      } else {
        Object.entries(rolePerms).forEach(([container, commands]) => {
          responseMessage += `• **${container}**: \`${commands.join(', ')}\`\n`;
        });
      }
      
      await interaction.editReply(responseMessage);
      return true;
    }
  },

  async handleAdd(interaction, settings, settingsService, dockerService) {
    const type = interaction.options.getString('type');
    const targetUser = interaction.options.getUser('user');
    const targetRole = interaction.options.getRole('role');
    const container = interaction.options.getString('container');
    const command = interaction.options.getString('command');

    // Validate that the correct target is provided
    if (type === 'user' && !targetUser) {
      await interaction.editReply('❌ Please specify a user when adding user permissions.');
      return false;
    }
    if (type === 'role' && !targetRole) {
      await interaction.editReply('❌ Please specify a role when adding role permissions.');
      return false;
    }

    // Verify container exists
    await dockerService.dockerUpdate();
    const containers = await dockerService.dockerUpdate();
    const containerExists = containers.some(c => 
      c.Names.some(name => name.replace('/', '') === container)
    );

    if (!containerExists) {
      await interaction.editReply(`❌ Container "${container}" does not exist.`);
      return false;
    }

    if (type === 'user') {
      // Add user permission
      if (!settings.DiscordSettings.UserPermissions[targetUser.id]) {
        settings.DiscordSettings.UserPermissions[targetUser.id] = {};
      }
      if (!settings.DiscordSettings.UserPermissions[targetUser.id][container]) {
        settings.DiscordSettings.UserPermissions[targetUser.id][container] = [];
      }
      
      const userPerms = settings.DiscordSettings.UserPermissions[targetUser.id][container];
      if (userPerms.includes(command)) {
        await interaction.editReply(`❌ User ${targetUser.tag} already has "${command}" permission for "${container}".`);
        return false;
      }
      
      userPerms.push(command);
      await settingsService.saveSettings(settings);
      
      await interaction.editReply(`✅ Added "${command}" permission for "${container}" to user ${targetUser.tag}.`);
      return true;
    }

    if (type === 'role') {
      // Add role permission
      if (!settings.DiscordSettings.RolePermissions[targetRole.id]) {
        settings.DiscordSettings.RolePermissions[targetRole.id] = {};
      }
      if (!settings.DiscordSettings.RolePermissions[targetRole.id][container]) {
        settings.DiscordSettings.RolePermissions[targetRole.id][container] = [];
      }
      
      const rolePerms = settings.DiscordSettings.RolePermissions[targetRole.id][container];
      if (rolePerms.includes(command)) {
        await interaction.editReply(`❌ Role ${targetRole.name} already has "${command}" permission for "${container}".`);
        return false;
      }
      
      rolePerms.push(command);
      await settingsService.saveSettings(settings);
      
      await interaction.editReply(`✅ Added "${command}" permission for "${container}" to role ${targetRole.name}.`);
      return true;
    }
  },

  async handleRemove(interaction, settings, settingsService, dockerService) {
    const type = interaction.options.getString('type');
    const targetUser = interaction.options.getUser('user');
    const targetRole = interaction.options.getRole('role');
    const container = interaction.options.getString('container');
    const command = interaction.options.getString('command');

    // Validate that the correct target is provided
    if (type === 'user' && !targetUser) {
      await interaction.editReply('❌ Please specify a user when removing user permissions.');
      return false;
    }
    if (type === 'role' && !targetRole) {
      await interaction.editReply('❌ Please specify a role when removing role permissions.');
      return false;
    }

    if (type === 'user') {
      // Remove user permission
      const userPerms = settings.DiscordSettings.UserPermissions[targetUser.id]?.[container];
      if (!userPerms || !userPerms.includes(command)) {
        await interaction.editReply(`❌ User ${targetUser.tag} does not have "${command}" permission for "${container}".`);
        return false;
      }
      
      const index = userPerms.indexOf(command);
      userPerms.splice(index, 1);
      
      // Clean up empty structures
      if (userPerms.length === 0) {
        delete settings.DiscordSettings.UserPermissions[targetUser.id][container];
        if (Object.keys(settings.DiscordSettings.UserPermissions[targetUser.id]).length === 0) {
          delete settings.DiscordSettings.UserPermissions[targetUser.id];
        }
      }
      
      await settingsService.saveSettings(settings);
      
      await interaction.editReply(`✅ Removed "${command}" permission for "${container}" from user ${targetUser.tag}.`);
      return true;
    }

    if (type === 'role') {
      // Remove role permission
      const rolePerms = settings.DiscordSettings.RolePermissions[targetRole.id]?.[container];
      if (!rolePerms || !rolePerms.includes(command)) {
        await interaction.editReply(`❌ Role ${targetRole.name} does not have "${command}" permission for "${container}".`);
        return false;
      }
      
      const index = rolePerms.indexOf(command);
      rolePerms.splice(index, 1);
      
      // Clean up empty structures
      if (rolePerms.length === 0) {
        delete settings.DiscordSettings.RolePermissions[targetRole.id][container];
        if (Object.keys(settings.DiscordSettings.RolePermissions[targetRole.id]).length === 0) {
          delete settings.DiscordSettings.RolePermissions[targetRole.id];
        }
      }
      
      await settingsService.saveSettings(settings);
      
      await interaction.editReply(`✅ Removed "${command}" permission for "${container}" from role ${targetRole.name}.`);
      return true;
    }
  },

  async handleList(interaction, settings) {
    let responseMessage = '**All Configured Permissions:**\n\n';
    
    // List user permissions
    const userPermissions = settings.DiscordSettings.UserPermissions || {};
    const userCount = Object.keys(userPermissions).length;
    
    responseMessage += `**👤 User Permissions (${userCount} users):**\n`;
    if (userCount === 0) {
      responseMessage += '   ❌ No user permissions configured\n\n';
    } else {
      Object.entries(userPermissions).forEach(([userId, containerPerms]) => {
        responseMessage += `   <@${userId}>:\n`;
        Object.entries(containerPerms).forEach(([container, commands]) => {
          responseMessage += `     • **${container}**: \`${commands.join(', ')}\`\n`;
        });
      });
      responseMessage += '\n';
    }
    
    // List role permissions
    const rolePermissions = settings.DiscordSettings.RolePermissions || {};
    const roleCount = Object.keys(rolePermissions).length;
    
    responseMessage += `**🎭 Role Permissions (${roleCount} roles):**\n`;
    if (roleCount === 0) {
      responseMessage += '   ❌ No role permissions configured\n';
    } else {
      Object.entries(rolePermissions).forEach(([roleId, containerPerms]) => {
        responseMessage += `   <@&${roleId}>:\n`;
        Object.entries(containerPerms).forEach(([container, commands]) => {
          responseMessage += `     • **${container}**: \`${commands.join(', ')}\`\n`;
        });
      });
    }
    
    await interaction.editReply(responseMessage);
    return true;
  },

  async handleAdminAdd(interaction, settings, settingsService) {
    const user = interaction.options.getUser('user');
    const userId = user.id;

    // Check if user is already an admin
    if (settings.DiscordSettings.AdminIDs.includes(userId)) {
      await interaction.editReply(`❌ User ${user.tag} is already a bot administrator.`);
      return false;
    }

    // Add user to admin list
    settings.DiscordSettings.AdminIDs.push(userId);
    await settingsService.saveSettings(settings);

    await interaction.editReply(`✅ Added ${user.tag} as a bot administrator.`);
    return true;
  },

  async handleAdminRemove(interaction, settings, settingsService) {
    const user = interaction.options.getUser('user');
    const userId = user.id;

    // Check if user is an admin
    if (!settings.DiscordSettings.AdminIDs.includes(userId)) {
      await interaction.editReply(`❌ User ${user.tag} is not a bot administrator.`);
      return false;
    }

    // Prevent removing the last admin
    if (settings.DiscordSettings.AdminIDs.length === 1) {
      await interaction.editReply(`❌ Cannot remove the last administrator. Add another admin first.`);
      return false;
    }

    // Remove user from admin list
    settings.DiscordSettings.AdminIDs = settings.DiscordSettings.AdminIDs.filter(id => id !== userId);
    await settingsService.saveSettings(settings);

    await interaction.editReply(`✅ Removed ${user.tag} from bot administrators.`);
    return true;
  },

  async handleAdminList(interaction, settings) {
    if (settings.DiscordSettings.AdminIDs.length === 0) {
      await interaction.editReply('❌ No bot administrators are configured.');
      return true;
    }

    let responseMessage = '**🔑 Bot Administrators:**\n\n';

    // Fetch usernames for all admin IDs
    for (const adminId of settings.DiscordSettings.AdminIDs) {
      try {
        const user = await interaction.client.users.fetch(adminId);
        responseMessage += `• ${user.tag} (<@${adminId}>)\n`;
      } catch (error) {
        responseMessage += `• Unknown user (<@${adminId}>)\n`;
      }
    }

    await interaction.editReply(responseMessage);
    return true;
  },
};
