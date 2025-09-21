# Settings Configuration

This folder contains the bot configuration files:

## Files

### `settings.json`
- **Your active configuration** - This is what the bot uses
- Edit this file to customize your bot settings
- Gets created automatically from `default-settings.json` on first run
- **Pure JSON** - No comments allowed

### `default-settings.json`
- **Reference template** - Shows all available options with examples
- Always stays unchanged - use as a reference
- Copy sections from here to your `settings.json` as needed
- **Pure JSON** - Valid JSON format for easy parsing

## Getting Started

1. **First Run**: When you start the bot, `settings.json` will be created automatically from the default template
2. **Configuration**: Edit `settings.json` with your Discord token, admin IDs, and guild IDs
3. **Permissions**: Set up user and role permissions in the `UserPermissions` and `RolePermissions` sections
4. **Reference**: Check `default-settings.json` for examples of permission configurations

## Configuration Details

### Required Settings

```json
{
  "DiscordSettings": {
    "Token": "<- Paste Your Discord Bot Token here! ->",  // Or set DISCORD_TOKEN env var
    "AdminIDs": [
      "123456789012345678",  // Replace with actual admin user IDs
      "876543210987654321"   // Another example admin ID
    ],
    "GuildIDs": [
      "123456789012345678",  // Replace with actual guild (server) IDs to enable commands on
      "876543210987654321"   // Another example guild ID
    ]
  }
}
```

### Permission System

The permission system uses **exact container names** as they appear in Docker. Users can only see and control containers they have permissions for.

#### UserPermissions
Grant specific permissions to individual users:

```json
"UserPermissions": {
  "exampleAdminUserId": {                    // Replace with actual Discord user ID
    "jellyfin": ["start", "stop", "restart", "exec", "jfFix"],
    "fail2ban": ["start", "stop", "restart", "exec", "banIP", "unbanIP"],
    "nginx": ["start", "stop", "restart"],
    "plex": ["start", "stop", "restart", "exec"]
  },
  "exampleUserId2": {                        // Another user with limited permissions
    "jellyfin": ["start", "stop", "jfFix"],
    "fail2ban": ["banIP", "unbanIP"]
  },
  "exampleUserId3": {                        // User with different container access
    "nginx": ["start", "stop", "restart"],
    "plex": ["start", "stop"]
  }
}
```

#### RolePermissions
Grant permissions based on Discord roles:

```json
"RolePermissions": {
  "basicUserRoleId": {                       // Replace with actual Discord role ID
    "jellyfin": ["start", "stop"],
    "plex": ["start", "stop"]
  },
  "mediaAdminRoleId": {                      // Role for media server admins
    "jellyfin": ["start", "stop", "restart", "jfFix"],
    "plex": ["start", "stop", "restart"]
  },
  "jellyfinFixerRoleId": {                   // Specialized role - only jfFix permission
    "jellyfin": ["jfFix"]
  },
  "fail2banUnbannerRoleId": {                // Specialized role - only unban permission
    "fail2ban": ["unbanIP"]
  }
}
```

### Docker Settings

```json
"DockerSettings": {
  "BotName": "docker-disco",                 // Display name for the bot (customizable)
  "Retries": 12,                             // Number of retry attempts for Docker operations
  "TimeBeforeRetry": 5,                      // Seconds to wait between retries
  "ContainersPerMessage": 100                // Maximum containers shown per Discord message
}
```

### Available Commands
- `start` - Start a container
- `stop` - Stop a container  
- `restart` - Restart a container
- `exec` - Execute commands in container
- `jfFix` - Jellyfin-specific fix command
- `banIP` - Ban IP address (fail2ban)
- `unbanIP` - Unban IP address (fail2ban)

### Example Role Configurations

#### Media Admin Role
```json
"mediaAdminRoleId": {
  "jellyfin": ["start", "stop", "restart", "jfFix"],
  "plex": ["start", "stop", "restart"],
  "sonarr": ["start", "stop", "restart"],
  "radarr": ["start", "stop", "restart"]
}
```

#### Basic User Role
```json
"basicUserRoleId": {
  "jellyfin": ["start", "stop"],
  "plex": ["start", "stop"]
}
```

#### Jellyfin Fixer Role (Specialized)
```json
"jellyfinFixerRoleId": {
  "jellyfin": ["jfFix"]
}
```

#### Fail2Ban Unbanner Role (Specialized)
```json
"fail2banUnbannerRoleId": {
  "fail2ban": ["unbanIP"]
}
```

## Getting Discord IDs

### Enable Developer Mode
1. Discord Settings → Advanced → Enable "Developer Mode"

### Get User IDs
1. Right-click a user → "Copy User ID"
2. **Replace** `"exampleAdminUserId"`, `"exampleUserId2"`, etc. with these actual IDs

### Get Role IDs
1. Server Settings → Roles → Right-click role → "Copy Role ID"  
2. **Replace** `"basicUserRoleId"`, `"mediaAdminRoleId"`, etc. with these actual IDs

### Get Guild (Server) IDs
1. Right-click server name → "Copy Server ID"
2. **Replace** the example IDs in `"GuildIDs"` array with your actual server IDs

**Important**: All IDs should be strings (wrapped in quotes), not numbers!

## Environment Variables

You can set `DISCORD_TOKEN` as an environment variable instead of putting it directly in the settings file:

```bash
export DISCORD_TOKEN="your_bot_token_here"
```

## Security Notes

- Never commit your actual `settings.json` with real tokens to version control
- Use environment variables for sensitive data
- Grant minimum necessary permissions to users/roles
- Regularly audit who has which permissions
