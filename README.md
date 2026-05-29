# dd-bot JavaScript Version

A Discord bot to control Docker containers, written in JavaScript with Discord.js.

## Features

- Start, stop, restart, exec into Docker containers via Discord slash commands
- List all containers with their status, filterable by name
- Role- and user-based permission system (per-container action ACLs)
- `/jf` — Jellyfin server controls via Jellyfin's HTTP API (sessions, devices,
  users, system). Per-user self-service via Discord-to-Jellyfin user bindings.
- `/fail2ban` — status, jail listing, banned IPs, ban/unban actions executed
  inside the `fail2ban` container

## Installation

### Prerequisites

- Node.js 20.x or later
- Docker (with access to the Docker socket)
- A Discord bot token

### Discord Bot Setup

Before you can use this bot, you need to create a Discord application and bot, then add it to your server.

#### 1. Create a Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Give your application a name (e.g., "docker-disco")
4. Click "Create"

#### 2. Create a Bot User

1. In your application, go to the "Bot" section in the left sidebar
2. Click "Add Bot"
3. Customize your bot's username and avatar if desired
4. Under the "Token" section, click "Copy" to copy your bot token
5. **Important**: Keep this token secret and never share it publicly

#### 3. Configure Your Bot Token

The bot token from step 2 above needs to be added to your `settings/settings.json` file:

1. Open `settings/settings.json`
2. Replace `"Token": "YOUR_TOKEN_HERE"` with your actual bot token:
   ```json
   "DiscordSettings": {
     "Token": "your_actual_bot_token_here",
     "AdminIDs": ["your_discord_user_id"],
     ...
   }
   ```
3. **Important**: Keep this token secret and never commit it to version control

#### 4. Add the Bot to Your Server

1. In your application, go to the "OAuth2" > "URL Generator" section
2. Under "Scopes", select:
   - `bot`
3. Under "Bot Permissions", the required permissions are included in this number: `2252317357718592`
   
   Or you can manually select these permissions:
   - Read Messages/View Channels
   - Send Messages
   - Use Slash Commands
   - Embed Links
   - Read Message History
   - Add Reactions
   - Use External Emojis

4. Copy the generated URL at the bottom
5. Open the URL in your browser and select the server you want to add the bot to
6. Click "Authorize"

**Quick Setup URL**: Replace `YOUR_CLIENT_ID` with your actual Client ID from the "General Information" section:
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2252317357718592&integration_type=0&scope=bot
```

### Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure your Discord bot token in `settings/settings.json` (see Discord Bot Setup section above)
4. Update other settings in `settings/settings.json` as needed:
   - Add your Discord User ID to `AdminIDs` array
   - Configure Docker settings if needed
5. Start the bot:
   ```
   node index.js
   ```

### Docker Installation

You can also run the bot in Docker:

```bash
docker build -t docker-discord-bot .
docker run -v /var/run/docker.sock:/var/run/docker.sock -v $(pwd)/settings:/app/settings docker-discord-bot
```

Make sure your `settings/settings.json` file is properly configured before running the Docker container.

## Commands

- `/ping` — Test if the bot is responsive
- `/list [filter]` — List Docker containers (optionally filtered by name)
- `/docker <action> [container] [cli]` — Start/stop/restart/exec a container
- `/fail2ban <subcommand>` — `status` · `jails` · `banned [jail]` ·
  `check <ip>` · `ban <ip> <jail>` · `unban <ip> [jail]`
- `/jf <subcommand>` — Jellyfin controls: `sessions`, `session pause|stop|message`,
  `device logout`, `user pause|stop|logout`, `system info|restart|shutdown`
- `/permission` — Inspect your current permissions

See [src/services/SETTINGS_README.md](src/services/SETTINGS_README.md) for the
full permission model.

## Configuration

Edit the settings in `settings/settings.json` to configure:
- Admin users
- Role and user permissions
- Docker settings

## License

GNU General Public License v3.0
