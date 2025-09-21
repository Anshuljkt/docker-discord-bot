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
    this.defaultSettingsFile = path.join(this.settingsPath, 'default-settings.json');
    this.settings = null;
    console.log('[SettingsService] Settings path:', this.settingsPath);
    console.log('[SettingsService] Settings file:', this.settingsFile);
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

    if (!fsSync.existsSync(this.defaultSettingsFile)) {
      console.error(`[SettingsService] ERROR: Default settings file not found: ${this.defaultSettingsFile}`);
      console.error('[SettingsService] This file should be included in the repository');
      throw new Error('default-settings.json missing - check repository files');
    } else {
      console.log(`[SettingsService] Default settings file found: ${this.defaultSettingsFile}`);
    }

    if (!fsSync.existsSync(this.settingsFile)) {
      console.log(`[SettingsService] Settings file does not exist: ${this.settingsFile}`);
      console.log('[SettingsService] Will copy from default settings...');
      this.copyDefaultToSettings();
    } else {
      console.log(`[SettingsService] Settings file already exists: ${this.settingsFile}`);
    }
    
    console.log('[SettingsService] Settings directory setup complete');
  }

  /**
   * Copy default settings to settings.json
   */
  copyDefaultToSettings() {
    console.log('[SettingsService] Copying default settings to settings.json...');
    try {
      const defaultContent = fsSync.readFileSync(this.defaultSettingsFile, 'utf8');
      const defaultSettings = JSON.parse(defaultContent);
      
      if (process.env.DISCORD_TOKEN) {
        defaultSettings.DiscordSettings.Token = process.env.DISCORD_TOKEN;
        console.log('[SettingsService] Applied Discord token from environment variable');
      }
      
      fsSync.writeFileSync(this.settingsFile, JSON.stringify(defaultSettings, null, 2), 'utf8');
      console.log('[SettingsService] Successfully copied default settings to settings.json');
    } catch (error) {
      console.error('[SettingsService] Error copying default settings:', error.message);
      throw new Error(`Failed to copy default settings: ${error.message}`);
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
}

module.exports = { SettingsService };
