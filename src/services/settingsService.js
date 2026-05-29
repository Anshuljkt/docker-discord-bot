/**
 * dd-bot - A Discord Bot to control Docker containers
 * Settings Service to manage configuration files
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class SettingsService {
  constructor() {
    console.log('[SettingsService] Initializing settings service...');
    this.settingsPath = path.resolve(process.cwd(), 'settings');
    this.settingsFile = path.join(this.settingsPath, 'settings.json');
    this.defaultSettingsFile = path.join(__dirname, 'default-settings.json');
    this.settings = null;
    console.log('[SettingsService] Settings path:', this.settingsPath);
    console.log('[SettingsService] Settings file:', this.settingsFile);
    console.log('[SettingsService] Default template:', this.defaultSettingsFile);
    this.ensureSettingsDirectory();
  }

  /**
   * Ensure settings directory and files exist
   */
  ensureSettingsDirectory() {
    console.log('[SettingsService] Ensuring settings directory and files exist...');

    if (!fsSync.existsSync(this.settingsPath)) {
      console.log(`[SettingsService] Settings directory does not exist, creating: ${this.settingsPath}`);
      fsSync.mkdirSync(this.settingsPath, { recursive: true });
      console.log('[SettingsService] Settings directory created successfully');
    } else {
      console.log(`[SettingsService] Settings directory already exists: ${this.settingsPath}`);
    }

    // Default template is now part of the application code, always available
    if (!fsSync.existsSync(this.defaultSettingsFile)) {
      console.error(`[SettingsService] CRITICAL ERROR: Default settings template missing from application: ${this.defaultSettingsFile}`);
      console.error('[SettingsService] This indicates a packaging or installation problem.');
      throw new Error('Application is missing default settings template - check installation');
    }

    // Always copy the latest default template and documentation to settings folder
    this.copyLatestTemplatesToSettings();

    if (!fsSync.existsSync(this.settingsFile)) {
      console.error(`[SettingsService] ERROR: settings.json not found: ${this.settingsFile}`);
      console.error('[SettingsService] 📋 Configuration required:');
      console.error('[SettingsService]   1. Check settings/settings_default.json for the latest template');
      console.error('[SettingsService]   2. Copy/rename it to settings.json');
      console.error('[SettingsService]   3. Update with your Discord token, admin IDs, and guild IDs');
      console.error('[SettingsService]   4. Set up container permissions as needed');
      console.error('[SettingsService] 📖 See settings/SETTINGS_README.md for detailed configuration guide');
      throw new Error('settings.json missing - please create from template (see settings_default.json)');
    } else {
      console.log(`[SettingsService] Settings file found: ${this.settingsFile}`);
    }

    console.log('[SettingsService] Settings directory setup complete');
  }  /**
   * Copy latest templates and documentation to settings directory
   * This ensures users always have the latest configuration examples and guidance
   */
  copyLatestTemplatesToSettings() {
    console.log('[SettingsService] Copying latest templates and documentation to settings directory...');

    try {
      // Copy latest default settings template
      const templatePath = path.join(this.settingsPath, 'settings_default.json');
      const defaultContent = fsSync.readFileSync(this.defaultSettingsFile, 'utf8');
      fsSync.writeFileSync(templatePath, defaultContent, 'utf8');
      console.log('[SettingsService] ✅ Copied latest default template to settings_default.json');

      // Copy latest documentation
      const docSourcePath = path.join(__dirname, 'SETTINGS_README.md');
      const docDestPath = path.join(this.settingsPath, 'SETTINGS_README.md');
      if (fsSync.existsSync(docSourcePath)) {
        const docContent = fsSync.readFileSync(docSourcePath, 'utf8');
        fsSync.writeFileSync(docDestPath, docContent, 'utf8');
        console.log('[SettingsService] ✅ Copied latest documentation to SETTINGS_README.md');
      }

      console.log('[SettingsService] Latest templates and documentation are now available in settings/');
    } catch (error) {
      console.error('[SettingsService] Error copying templates:', error.message);
      // Don't throw here - this is not critical for operation if settings.json exists
    }
  }

  /**
   * Load settings from file
   * @returns {Promise<Object>} Settings object
   */
  async loadSettings() {
    console.log('[SettingsService] Loading settings...');

    if (this.settings) {
      console.log('[SettingsService] Settings already cached, returning cached version');
      return this.settings;
    }

    try {
      console.log(`[SettingsService] Reading settings from: ${this.settingsFile}`);
      const data = await fs.readFile(this.settingsFile, 'utf8');
      this.settings = JSON.parse(data);

      if (process.env.DISCORD_TOKEN) {
        this.settings.DiscordSettings.Token = process.env.DISCORD_TOKEN;
        console.log('[SettingsService] Applied Discord token from environment variable');
      }

      console.log('[SettingsService] Settings loaded and parsed successfully');

      // Validate critical settings before proceeding
      this.validateSettings();

      console.log('[SettingsService] Settings validation:');
      console.log('  - Token present:', !!this.settings.DiscordSettings?.Token);
      console.log('  - Token length:', this.settings.DiscordSettings?.Token?.length || 0);
      console.log('  - Admin IDs:', this.settings.DiscordSettings?.AdminIDs || []);
      console.log('  - Guild IDs:', this.settings.DiscordSettings?.GuildIDs || []);
      console.log('  - Bot name:', this.settings.DockerSettings?.BotName || 'Not set');

      // Log user permissions
      const userPermissions = this.settings.DiscordSettings?.UserPermissions || {};
      const userCount = Object.keys(userPermissions).length;
      console.log(`  - User permissions configured: ${userCount} users`);
      if (userCount > 0) {
        Object.entries(userPermissions).forEach(([userId, containerPerms]) => {
          console.log(`    User ${userId}:`);
          Object.entries(containerPerms).forEach(([container, commands]) => {
            console.log(`      ${container}: [${commands.join(', ')}]`);
          });
        });
      }

      // Log role permissions
      const rolePermissions = this.settings.DiscordSettings?.RolePermissions || {};
      const roleCount = Object.keys(rolePermissions).length;
      console.log(`  - Role permissions configured: ${roleCount} roles`);
      if (roleCount > 0) {
        Object.entries(rolePermissions).forEach(([roleId, containerPerms]) => {
          console.log(`    Role ${roleId}:`);
          Object.entries(containerPerms).forEach(([container, commands]) => {
            console.log(`      ${container}: [${commands.join(', ')}]`);
          });
        });
      }

      return this.settings;
    } catch (error) {
      console.error(`[SettingsService] Error loading settings: ${error.message}`);

      if (error.code === 'ENOENT') {
        console.log('[SettingsService] Settings file not found, copying from default...');
        this.copyDefaultToSettings();
        return this.loadSettings();
      }
      throw error;
    }
  }

  /**
   * Save settings to file
   * @param {Object} settings - Settings object to save
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    console.log('[SettingsService] Saving settings...');
    try {
      await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2), 'utf8');
      this.settings = settings;
      console.log('[SettingsService] Settings saved successfully');
    } catch (error) {
      console.error(`[SettingsService] Error saving settings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clear cached settings
   */
  clearCache() {
    this.settings = null;
  }

  /**
   * Validate that settings are properly configured and not using default placeholder values
   * @throws {Error} If settings contain placeholder values or are invalid
   */
  validateSettings() {
    if (!this.settings) {
      throw new Error('Settings not loaded');
    }

    const errors = [];
    const warnings = [];

    // Validate Discord Token
    const token = this.settings.DiscordSettings?.Token;
    if (!token || token.includes('<-') || token.includes('Paste Your') || token.length < 50) {
      errors.push('Discord bot token is not configured. Please set a valid bot token in settings.json');
    }

    // Validate Admin IDs
    const adminIDs = this.settings.DiscordSettings?.AdminIDs || [];
    if (adminIDs.length === 0) {
      errors.push('No admin users configured. At least one admin ID is required.');
    } else {
      // Check for placeholder admin IDs
      const placeholderAdmins = adminIDs.filter(id =>
        id.startsWith('123456') || id.startsWith('876543') || id === 'exampleAdminUserId',
      );
      if (placeholderAdmins.length > 0) {
        errors.push(`Placeholder admin IDs detected: ${placeholderAdmins.join(', ')}. Replace with real Discord user IDs.`);
      }
    }

    // Validate Guild IDs
    const guildIDs = this.settings.DiscordSettings?.GuildIDs || [];
    if (guildIDs.length === 0) {
      warnings.push('No guild IDs configured. Bot commands will not work in any Discord servers.');
    } else {
      // Check for placeholder guild IDs
      const placeholderGuilds = guildIDs.filter(id =>
        id.startsWith('123456') || id.startsWith('876543'),
      );
      if (placeholderGuilds.length > 0) {
        errors.push(`Placeholder guild IDs detected: ${placeholderGuilds.join(', ')}. Replace with real Discord server IDs.`);
      }
    }

    // Check for placeholder user permissions
    const userPermissions = this.settings.DiscordSettings?.UserPermissions || {};
    const placeholderUsers = Object.keys(userPermissions).filter(userId =>
      userId.startsWith('example') || userId.startsWith('123456') || userId.startsWith('876543'),
    );
    if (placeholderUsers.length > 0) {
      warnings.push(`Placeholder user IDs in permissions: ${placeholderUsers.join(', ')}. These won't match real users.`);
    }

    // Check for placeholder role permissions
    const rolePermissions = this.settings.DiscordSettings?.RolePermissions || {};
    const placeholderRoles = Object.keys(rolePermissions).filter(roleId =>
      roleId.includes('RoleId') || roleId.startsWith('123456') || roleId.startsWith('876543'),
    );
    if (placeholderRoles.length > 0) {
      warnings.push(`Placeholder role IDs in permissions: ${placeholderRoles.join(', ')}. These won't match real roles.`);
    }

    // Log warnings
    if (warnings.length > 0) {
      console.warn('[SettingsService] Configuration warnings:');
      warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`));
    }

    // Throw error if critical issues found
    if (errors.length > 0) {
      console.error('[SettingsService] Critical configuration errors:');
      errors.forEach(error => console.error(`  ❌ ${error}`));
      console.error('[SettingsService] Please check the README.md in the settings folder for configuration instructions.');
      throw new Error(`Configuration validation failed: ${errors.join('; ')}`);
    }

    console.log('[SettingsService] ✅ Settings validation passed');
  }
}

module.exports = { SettingsService };
