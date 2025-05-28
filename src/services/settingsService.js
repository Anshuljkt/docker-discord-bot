/**
 * dd-bot - A Discord Bot to control Docker containers
 * Settings Service to manage configuration
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class SettingsService {
  constructor() {
    console.log('[SettingsService] Initializing settings service...');
    this.settingsPath = path.resolve(process.cwd(), 'settings');
    this.settingsFile = path.join(this.settingsPath, 'settings.json');
    this.settings = null;
    console.log('[SettingsService] Settings path:', this.settingsPath);
    console.log('[SettingsService] Settings file:', this.settingsFile);
    this.ensureSettingsDirectory();
  }

  /**
   * Ensure the settings directory exists
   */
  ensureSettingsDirectory() {
    console.log('[SettingsService] Ensuring settings directory exists...');
    if (!fsSync.existsSync(this.settingsPath)) {
      fsSync.mkdirSync(this.settingsPath, { recursive: true });
      console.log(`[SettingsService] Created settings directory: ${this.settingsPath}`);
    } else {
      console.log(`[SettingsService] Settings directory already exists: ${this.settingsPath}`);
    }

    if (!fsSync.existsSync(this.settingsFile)) {
      console.log('[SettingsService] Settings file does not exist, creating default...');
      this.saveSettings(this.getDefaultSettings());
      console.log(`[SettingsService] Created default settings file: ${this.settingsFile}`);
    } else {
      console.log(`[SettingsService] Settings file exists: ${this.settingsFile}`);
    }
  }

  /**
   * Get default settings structure
   * @returns {Object} Default settings
   */
  getDefaultSettings() {
    console.log('[SettingsService] Generating default settings...');
    const defaultSettings = {
      'LanguageSettings': {
        'Language': 'en',
      },
      'DiscordSettings': {
        'Token': process.env.DISCORD_TOKEN || '<- Paste Your Discord Bot Token here! ->',
        'AdminIDs': [
          '123456789012345678', // Replace with actual admin IDs
          '876543210987654321', // Another example admin ID
        ],
        'GuildIDs': [
          '123456789012345678', // Replace with actual guild (channel) IDs to enable commands on
          '876543210987654321', // Another example guild ID
        ],
        'UserWhitelist': true,
        'UserIDs': [],
        'UsersCanStopContainers': false,
        'AllowedContainers': [],
        'RoleStartPermissions': {},
        'RoleStopPermissions': {},
        'UserStartPermissions': {},
        'UserStopPermissions': {},
      },
      'DockerSettings': {
        'BotName': 'dd-bot',
        'Retries': 12,
        'TimeBeforeRetry': 5,
        'ContainersPerMessage': 100,
      },
    };

    console.log('[SettingsService] Default token from env:', !!process.env.DISCORD_TOKEN);
    return defaultSettings;
  }

  /**
   * Load settings from file
   * @returns {Promise<Object>} Settings object
   */
  async loadSettings() {
    console.log('[SettingsService] Loading settings...');
    try {
      if (this.settings) {
        console.log('[SettingsService] Settings already cached, returning cached version');
        return this.settings;
      }

      console.log(`[SettingsService] Reading settings from: ${this.settingsFile}`);
      const data = await fs.readFile(this.settingsFile, 'utf8');
      this.settings = JSON.parse(data);

      console.log('[SettingsService] Settings loaded and parsed successfully');
      console.log('[SettingsService] Settings validation:');
      console.log('  - Token present:', !!this.settings.DiscordSettings?.Token);
      console.log('  - Token length:', this.settings.DiscordSettings?.Token?.length || 0);
      console.log('  - Admin IDs count:', this.settings.DiscordSettings?.AdminIDs?.length || 0);
      console.log('  - Bot name:', this.settings.DockerSettings?.BotName || 'Not set');

      return this.settings;
    } catch (error) {
      console.error(`[SettingsService] Error loading settings: ${error.message}`);
      // If settings file doesn't exist, create default settings
      if (error.code === 'ENOENT') {
        console.log('[SettingsService] Settings file not found, creating default settings...');
        const defaultSettings = this.getDefaultSettings();
        await this.saveSettings(defaultSettings);
        this.settings = defaultSettings;
        return defaultSettings;
      }
      throw error;
    }
  }

  /**
   * Save settings to file
   * @param {Object} settings - Settings object to write
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
   * Update user permissions
   * @param {string} userId - User ID
   * @param {string} container - Container name
   * @param {string} permission - Permission type ('start' or 'stop')
   * @param {string} action - Action to perform ('add' or 'remove')
   * @returns {Promise<void>}
   */
  async updateUserPermissions(userId, container, permission, action) {
    const settings = await this.loadSettings();

    // Select the appropriate permissions dictionary
    const permKey = permission === 'start' ? 'UserStartPermissions' : 'UserStopPermissions';

    if (!settings.DiscordSettings[permKey][userId]) {
      settings.DiscordSettings[permKey][userId] = [];
    }

    if (action === 'add') {
      // Add permission if it doesn't exist
      if (!settings.DiscordSettings[permKey][userId].includes(container)) {
        settings.DiscordSettings[permKey][userId].push(container);
      }
    } else if (action === 'remove') {
      // Remove permission if it exists
      settings.DiscordSettings[permKey][userId] = settings.DiscordSettings[permKey][userId].filter(c => c !== container);

      // Clean up empty arrays
      if (settings.DiscordSettings[permKey][userId].length === 0) {
        delete settings.DiscordSettings[permKey][userId];
      }
    }

    await this.saveSettings(settings);
  }

  /**
   * Update role permissions
   * @param {string} roleId - Role ID
   * @param {string} container - Container name
   * @param {string} permission - Permission type ('start' or 'stop')
   * @param {string} action - Action to perform ('add' or 'remove')
   * @returns {Promise<void>}
   */
  async updateRolePermissions(roleId, container, permission, action) {
    const settings = await this.loadSettings();

    // Select the appropriate permissions dictionary
    const permKey = permission === 'start' ? 'RoleStartPermissions' : 'RoleStopPermissions';

    if (!settings.DiscordSettings[permKey][roleId]) {
      settings.DiscordSettings[permKey][roleId] = [];
    }

    if (action === 'add') {
      // Add permission if it doesn't exist
      if (!settings.DiscordSettings[permKey][roleId].includes(container)) {
        settings.DiscordSettings[permKey][roleId].push(container);
      }
    } else if (action === 'remove') {
      // Remove permission if it exists
      settings.DiscordSettings[permKey][roleId] = settings.DiscordSettings[permKey][roleId].filter(c => c !== container);

      // Clean up empty arrays
      if (settings.DiscordSettings[permKey][roleId].length === 0) {
        delete settings.DiscordSettings[permKey][roleId];
      }
    }

    await this.saveSettings(settings);
  }
}

// Export the class rather than an instance
module.exports = { SettingsService };
