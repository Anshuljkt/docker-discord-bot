/**
 * dd-bot - A Discord Bot to control Docker containers
 * Discord Service to manage bot interactions
 */

const { Client, GatewayIntentBits, Collection, REST, Routes, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { DockerService } = require('./dockerService');
const { SettingsService } = require('./settingsService');


// Discord Bot Permissions Int: 412317333568
class DiscordService {
  constructor(settings, dockerService, settingsService) {
    console.log('[DiscordService] Initializing Discord service...');
    this.client = new Client({ 
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ] 
    });
    
    this.settings = settings;
    this.dockerService = dockerService || new DockerService(settings);
    this.settingsService = settingsService || new SettingsService();
    
    this.commands = new Collection();
    this.commandsData = [];
    console.log('[DiscordService] Discord service initialized');
  }

  /**
   * Start the Discord bot service
   */
  async start() {
    console.log('[DiscordService] Starting Discord bot service...');
    console.log('[DiscordService] Platform:', process.platform, process.arch);
    console.log('[DiscordService] Node.js version:', process.version);
    
    // Load commands
    this.loadCommands();
    
    // Log in
    try {
      console.log('[DiscordService] Attempting to log into Discord...');
      console.log('[DiscordService] Bot token length:', this.settings.DiscordSettings.Token ? this.settings.DiscordSettings.Token.length : 'UNDEFINED');
      
      await this.client.login(this.settings.DiscordSettings.Token);
      console.log(`[DiscordService] Bot logged in successfully as ${this.client.user.tag}`);
    } 
    catch (error) {
      console.error(`[DiscordService] CRITICAL: Error logging in: ${error.message}`);
      console.error(`[DiscordService] Error details:`, error);
      process.exit(1);
    }

    await this.registerSlashCommands();

    // Register event handlers (aka listeners)
    await this.registerEvents();
    
    return true;
  }

  /**
   * Register Discord.js event handlers
   */
  async registerEvents() {
    console.log('[DiscordService] Registering Discord event handlers...');
    
    this.client.once(Events.ClientReady, async() => {
      console.log(`[DiscordService] Bot ready event fired! Logged in as ${this.client.user.tag}`);
      console.log(`[DiscordService] Bot ID: ${this.client.user.id}`);
      console.log(`[DiscordService] Bot is in ${this.client.guilds.cache.size} guilds`);
      
      // Log guild information
      this.client.guilds.cache.forEach(guild => {
        console.log(`[DiscordService] Guild: ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
      });
    });

    this.client.on(Events.InteractionCreate, async interaction => {
      await interaction.deferReply();
      
      // print full interaction details object:
      console.log(`[DiscordService] Interaction received, message deferred:\n\n`, interaction.toJSON());
    
      // console.log(`[DiscordService] Interaction received, message deferred:`, {
      //   type: interaction.type,
      //   commandName: interaction.commandName || 'N/A',
      //   user: interaction.user?.tag || 'Unknown',
      //   userId: interaction.user?.id || 'Unknown',
      //   guildId: interaction.guildId || 'DM',
      //   channelId: interaction.channelId || 'Unknown',
      //   isCommand: interaction.isCommand(),
      //   timestamp: new Date().toISOString()
      // });

      if (!interaction.isCommand()) {
        console.log(`[DiscordService] Non-command interaction ignored (type: ${interaction.type})`);
        return;
      }

      const command = this.commands.get(interaction.commandName);
      if (!command) {
        console.error(`[DiscordService] UNKNOWN INTERACTION: Command "${interaction.commandName}" not found in registered commands`);
        console.error(`[DiscordService] Available commands:`, Array.from(this.commands.keys()));
        console.error(`[DiscordService] Interaction details:`, {
          commandName: interaction.commandName,
          options: interaction.options?.data || [],
          user: interaction.user.tag,
          guild: interaction.guild?.name || 'DM'
        });
        
        try {
          // Handle unknown command - make sure we respond quickly
          if (!interaction.replied && !interaction.deferred) {
            console.log(`[DiscordService] Responding to unknown command: ${interaction.commandName}`);
            await interaction.reply({ 
              content: `Unknown command: ${interaction.commandName}. This might be a registration issue.`, 
              ephemeral: true 
            });
            console.log(`[DiscordService] Response sent for unknown command`);
          }
        } catch (replyError) {
          console.error(`[DiscordService] Error replying to unknown command:`, replyError);
          console.error(`[DiscordService] Error details:`, replyError.message);
        }
        return;
      }

      console.log(`[DiscordService] Executing command: ${interaction.commandName}`);
      
      try {
        // Start a non-blocking async job for commands that take longer
        const startTime = Date.now();
        
        console.log(`[DiscordService] Starting execution of command "${interaction.commandName}"...`);
        const success = await command.execute(interaction);
        
        const executionTime = Date.now() - startTime;
        console.log(`[DiscordService] Command "${interaction.commandName}" completed in ${executionTime}ms with result: ${success ? 'success' : 'failure'}`);
        
        if (executionTime > 2000) {
          console.warn(`[DiscordService] WARNING: Command "${interaction.commandName}" took ${executionTime}ms to execute, which may block the gateway task.`);
        }
      } catch (error) {
        console.error(`[DiscordService] ERROR executing command ${interaction.commandName}:`, error);
        console.error(`[DiscordService] Error message: ${error.message}`);
        console.error(`[DiscordService] Error stack:`, error.stack);
        
        if (error.code) {
          console.error(`[DiscordService] Error code: ${error.code}`);
        }
        
        try {
          console.log(`[DiscordService] Checking interaction state - deferred: ${interaction.deferred}, replied: ${interaction.replied}`);
          
          if (interaction.replied || interaction.deferred) {
            console.log(`[DiscordService] Sending followUp for command error...`);
            await interaction.followUp({ 
              content: `Error executing command: ${error.message || 'Unknown error'}`, 
              ephemeral: true 
            });
            console.log(`[DiscordService] FollowUp sent successfully`);
          } else {
            console.log(`[DiscordService] Sending reply for command error...`);
            await interaction.reply({ 
              content: `Error executing command: ${error.message || 'Unknown error'}`, 
              ephemeral: true 
            });
            console.log(`[DiscordService] Reply sent successfully`);
          }
        } catch (replyError) {
          console.error(`[DiscordService] Error sending error reply:`, replyError);
          console.error(`[DiscordService] Reply error message: ${replyError.message}`);
        }
      }
    });

    // Add more event handlers for debugging
    this.client.on('error', (error) => {
      console.error('[DiscordService] Discord client error:', error);
    });

    this.client.on('warn', (warning) => {
      console.warn('[DiscordService] Discord client warning:', warning);
    });

    this.client.on('debug', (info) => {
      // Only log important debug info to avoid spam
      if (info.includes('heartbeat') || info.includes('session') || info.includes('ready')) {
        console.log('[DiscordService] Discord debug:', info);
      }
    });

    console.log('[DiscordService] Event handlers registered');
    return true;
  }

  /**
   * Load command files from the commands directory
   */
  loadCommands() {
    console.log('[DiscordService] Loading commands...');
    const commandsPath = path.join(__dirname, '../commands');
    console.log('[DiscordService] Commands path:', commandsPath);
    
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    console.log('[DiscordService] Found command files:', commandFiles);

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      console.log(`[DiscordService] Loading command file: ${filePath}`);
      
      try {
        const command = require(filePath);

        // Set a new item in the Collection
        if ('data' in command && 'execute' in command) {
          this.commands.set(command.data.name, command);
          this.commandsData.push(command.data.toJSON());
          console.log(`[DiscordService] ✓ Loaded command: ${command.data.name}`);
        } else {
          console.warn(`[DiscordService] ⚠ The command at ${filePath} is missing required properties (data or execute).`);
        }
      } catch (error) {
        console.error(`[DiscordService] ✗ Error loading command ${file}:`, error);
      }
    }
    
    console.log(`[DiscordService] Total commands loaded: ${this.commands.size}`);
    console.log(`[DiscordService] Command names:`, Array.from(this.commands.keys()));
  }

  /**
   * Register slash commands with Discord API
   */
  async registerSlashCommands() {
    if (!this.client.application) {
      console.error('[DiscordService] ERROR: Client application is null, cannot register commands');
      return;
    }

    console.log(`[DiscordService] Starting slash command registration...`);
    console.log(`[DiscordService] Commands to register: ${this.commandsData.length}`);
    
    try {
      const rest = new REST().setToken(this.settings.DiscordSettings.Token);
      
      console.log(`[DiscordService] Started refreshing ${this.commandsData.length} application (/) commands.`);
      console.log(`[DiscordService] Bot User ID: ${this.client.user.id}`);

      // Log each command being registered
      this.commandsData.forEach((cmd, index) => {
        console.log(`[DiscordService] Command ${index + 1}: ${cmd.name} - ${cmd.description}`);
      });

      // Get guild IDs from settings
      const guildIds = this.settings.DiscordSettings.GuildIDs || [];
      
      let data;
      
      if (guildIds.length > 0) {
        console.log(`[DiscordService] Registering commands for ${guildIds.length} specific guild(s)...`);
        
        // Register commands for each guild
        for (const guildId of guildIds) {
          console.log(`[DiscordService] Registering commands for guild ${guildId}...`);
          try {
            rest.put(Routes.applicationGuildCommands(this.client.user.id, guildId), { body: [] })
              .then(() => console.log('Successfully deleted all guild commands.'))
              .catch(console.error);

            const guildData = await rest.put(
              Routes.applicationGuildCommands(this.client.user.id, guildId),
              { body: this.commandsData },
            );
            console.log(`[DiscordService] ✓ Successfully registered ${guildData.length} commands for guild ${guildId}`);
            
            // Store the last response data
            data = guildData;
          } catch (guildError) {
            console.error(`[DiscordService] Error registering commands for guild ${guildId}:`, guildError);
          }
        }
      } else {
        console.log(`[DiscordService] No specific guilds found. Registering global commands (this may take up to 1 hour to propagate)...`);
        
        // Register global commands
        data = await rest.put(
          Routes.applicationCommands(this.client.user.id),
          { body: this.commandsData },
        );
        
        console.log(`[DiscordService] ✓ Successfully registered ${data.length} global application commands.`);
      }
      
      // Log registered commands details
      if (Array.isArray(data)) {
        data.forEach(cmd => {
          console.log(`[DiscordService] Registered: ${cmd.name} (ID: ${cmd.id})`);
        });
      }
      
    } catch (error) {
      console.error('[DiscordService] CRITICAL: Error registering commands:', error);
      console.error('[DiscordService] Error details:', error.message);
      console.error('[DiscordService] Stack trace:', error.stack);
      
      if (error.status) {
        console.error('[DiscordService] HTTP Status:', error.status);
      }
      if (error.rawError) {
        console.error('[DiscordService] Raw error:', error.rawError);
      }
    }
    return true;
  }

  /**
   * Check if a user has admin permissions
   * @param {string} userId - Discord User ID
   * @returns {boolean} Whether the user is an admin
   */
  isAdmin(userId) {
    // Check if the user ID is in the admin IDs array
    return this.settings.DiscordSettings.AdminIDs.includes(userId);
  }

  /**
   * Check if a user has permission for a container
   * @param {string} userId - Discord User ID
   * @param {Array<string>} userRoles - Array of role IDs the user has
   * @param {string} containerId - Container ID
   * @param {string} operation - Operation type ('start' or 'stop')
   * @returns {boolean} Whether the user has permission
   */
  hasContainerPermission(userId, userRoles, containerId, operation) {
    // Admins always have permission
    if (this.isAdmin(userId)) return true;

    // Check user permissions based on operation type
    if (operation === 'start') {
      // Check user start permissions
      if (this.settings.DiscordSettings.UserStartPermissions[userId] && 
          this.settings.DiscordSettings.UserStartPermissions[userId].includes(containerId)) {
        return true;
      }
    } else if (operation === 'stop' || operation === 'restart') {
      // Check user stop permissions
      if (this.settings.DiscordSettings.UserStopPermissions[userId] && 
          this.settings.DiscordSettings.UserStopPermissions[userId].includes(containerId)) {
        return true;
      }
    }

    // Check role permissions based on operation type
    if (userRoles && userRoles.length > 0) {
      if (operation === 'start') {
        // Check role start permissions
        for (const [roleId, containers] of Object.entries(this.settings.DiscordSettings.RoleStartPermissions)) {
          if (userRoles.includes(roleId) && containers.includes(containerId)) {
            return true;
          }
        }
      } else if (operation === 'stop' || operation === 'restart') {
        // Check role stop permissions
        for (const [roleId, containers] of Object.entries(this.settings.DiscordSettings.RoleStopPermissions)) {
          if (userRoles.includes(roleId) && containers.includes(containerId)) {
            return true;
          }
        }
      }
    }

    return false;
  }
}

// Export the class rather than an instance to allow proper initialization with settings
module.exports = { DiscordService };
