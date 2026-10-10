# Settings Configuration

This folder contains the bot configuration files:

## Files

### `settings.json`
- **Your active configuration** - This is what the bot uses
- Edit this file to customize your bot settings
- **Not created automatically** - copy it from `settings_default.json` (see Getting Started)
- **Pure JSON** - No comments allowed

### `settings_default.json`
- **Reference template** - Shows all available options with examples
- Overwritten with the latest template every time the bot starts - don't edit it
- Copy sections from here to your `settings.json` as needed
- **Pure JSON** - Valid JSON format for easy parsing

### `SETTINGS_README.md`
- This guide; also refreshed on every start

## Getting Started

1. **First Run**: Start the bot once. It writes `settings_default.json` and this guide into
   `settings/`, then exits because `settings.json` is missing
2. **Create settings.json**: Copy `settings_default.json` to `settings.json`
3. **Configuration**: Edit `settings.json` with your Discord token, admin IDs, and guild IDs
4. **Permissions**: Set up user and role permissions in the `UserPermissions` and `RolePermissions` sections
5. **Reference**: Check `settings_default.json` for examples of permission configurations

Upgrading from 1.x? The old `UserStartPermissions` / `UserStopPermissions` /
`RoleStartPermissions` / `RoleStopPermissions` maps are converted automatically on load
(Start → `start`; Stop → `stop` + `restart`). The converted form is written to
`settings.json` the next time the bot saves settings (e.g. via `/permission add`).

## Configuration Details

### Required Settings

- `Token` - your bot token (or set the `DISCORD_TOKEN` env var instead)
- `AdminIDs` - Discord user IDs of bot admins (replace the example IDs)
- `GuildIDs` - Discord server IDs to register commands in (replace the example IDs)

```json
{
  "DiscordSettings": {
    "Token": "<- Paste Your Discord Bot Token here! ->",
    "AdminIDs": [
      "123456789012345678",
      "876543210987654321"
    ],
    "GuildIDs": [
      "123456789012345678",
      "876543210987654321"
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
Grant specific permissions to individual users. Replace `exampleAdminUserId` etc.
with real Discord user IDs:

```json
"UserPermissions": {
  "exampleAdminUserId": {
    "jellyfin": ["start", "stop", "restart", "exec"],
    "fail2ban": ["view", "ban", "unban", "start", "stop", "restart"],
    "nginx": ["start", "stop", "restart"],
    "plex": ["start", "stop", "restart", "exec"]
  },
  "exampleUserId2": {
    "jellyfin": ["start", "stop"],
    "fail2ban": ["view", "ban", "unban"]
  },
  "exampleUserId3": {
    "nginx": ["start", "stop", "restart"],
    "plex": ["start", "stop"]
  }
}
```

#### RolePermissions
Grant permissions based on Discord roles. Replace `basicUserRoleId` etc. with real
Discord role IDs:

```json
"RolePermissions": {
  "basicUserRoleId": {
    "jellyfin": ["start", "stop"],
    "plex": ["start", "stop"]
  },
  "mediaAdminRoleId": {
    "jellyfin": ["start", "stop", "restart"],
    "plex": ["start", "stop", "restart"]
  },
  "fail2banUnbannerRoleId": {
    "fail2ban": ["view", "unban"]
  }
}
```

### Docker Settings

- `BotName` - display name for the bot
- `Retries` - retry attempts for Docker operations
- `TimeBeforeRetry` - seconds to wait between retries
- `ContainersPerMessage` - maximum containers shown per Discord message

```json
"DockerSettings": {
  "BotName": "docker-disco",
  "Retries": 12,
  "TimeBeforeRetry": 5,
  "ContainersPerMessage": 100
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

`DiscordToJellyfinUserBindings` maps a Discord user ID to a Jellyfin username:

```json
"JellyfinSettings": {
  "BaseUrl": "http://jellyfin.local:8096",
  "ApiKey": "<- Jellyfin API key (Dashboard > API Keys) ->",
  "ClientName": "dd-bot",
  "DeviceName": "dd-bot",
  "DeviceId": "dd-bot",
  "DiscordToJellyfinUserBindings": {
    "379919793333075968": "jellyfinUsername"
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
