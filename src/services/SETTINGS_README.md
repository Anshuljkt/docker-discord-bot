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

The `UserPermissions` and `RolePermissions` maps are **per-feature ACLs** read by two
slash commands:

- `/docker <action> <container>` — uses container-action tokens (`start`, `stop`,
  `restart`, `exec`) under any container key (`jellyfin`, `fail2ban`, `nginx`, …).
- `/fail2ban <subcommand>` — uses fail2ban-specific tokens (`view`, `ban`, `unban`)
  under the `fail2ban` key. (Legacy `banIP` / `unbanIP` are still honored as aliases
  for `ban` / `unban`.)

`/jf` (Jellyfin API) does **not** use these maps — it gates on `AdminIDs` plus
`JellyfinSettings.DiscordToJellyfinUserBindings`.

Users in `AdminIDs` bypass all permission checks. Container names must match
exactly what `docker ps` shows.

#### UserPermissions
Grant specific permissions to individual users:

```json
"UserPermissions": {
  "exampleAdminUserId": {                    // Replace with actual Discord user ID
    "jellyfin": ["start", "stop", "restart", "exec"],
    "fail2ban": ["view", "ban", "unban", "start", "stop", "restart"],
    "nginx": ["start", "stop", "restart"],
    "plex": ["start", "stop", "restart", "exec"]
  },
  "exampleUserId2": {                        // Another user with limited permissions
    "jellyfin": ["start", "stop"],
    "fail2ban": ["view", "ban", "unban"]
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
    "jellyfin": ["start", "stop", "restart"],
    "plex": ["start", "stop", "restart"]
  },
  "fail2banUnbannerRoleId": {                // Specialized role - only unban
    "fail2ban": ["view", "unban"]
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

### Available Permission Tokens

**Docker container actions** (any container key):
- `start` — Start a container
- `stop` — Stop a container
- `restart` — Restart a container
- `exec` — Execute arbitrary commands in container

**fail2ban actions** (only under the `fail2ban` key):
- `view` — read-only: `status`, `jails`, `banned`, `check`
- `ban` — ban an IP in a jail (legacy alias: `banIP`)
- `unban` — unban an IP from a jail (legacy alias: `unbanIP`)

### Jellyfin Settings

`/jf` uses Jellyfin's HTTP API directly, not Docker. Configure it under
`JellyfinSettings`:

```json
"JellyfinSettings": {
  "BaseUrl": "http://jellyfin.local:8096",
  "ApiKey": "<- Jellyfin API key (Dashboard > API Keys) ->",
  "ClientName": "dd-bot",
  "DeviceName": "dd-bot",
  "DeviceId": "dd-bot",
  "DiscordToJellyfinUserBindings": {
    "379919793333075968": "jellyfinUsername"   // Discord user ID -> Jellyfin username
  }
}
```

Non-admins listed in `DiscordToJellyfinUserBindings` may run `/jf sessions` and
`/jf user <action>` against **their own** Jellyfin sessions only. All other
`/jf` subcommands are admin-only.

### Example Role Configurations

#### Media Admin Role
```json
"mediaAdminRoleId": {
  "jellyfin": ["start", "stop", "restart"],
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

#### Fail2Ban Unbanner Role (Specialized)
```json
"fail2banUnbannerRoleId": {
  "fail2ban": ["view", "unban"]
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
