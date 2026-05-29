/* dd-bot - /jf command
 *
 * Jellyfin controls organised by target type:
 *
 *   /jf sessions [user] [playing_only=true] [tv_only]
 *
 *   /jf session pause   <session_id>
 *   /jf session stop    <session_id>
 *   /jf session message <session_id> <text> [header] [timeout_ms]
 *
 *   /jf device  logout  <device_id>
 *
 *   /jf user    pause   <user> [tv_only]
 *   /jf user    stop    <user> [tv_only]
 *   /jf user    logout  <user> [tv_only]
 *
 *   /jf system  info
 *   /jf system  restart
 *   /jf system  shutdown
 *
 * Authorization:
 *   - Admins (DiscordSettings.AdminIDs) can use everything.
 *   - Non-admins listed in JellyfinSettings.UserBindings may use:
 *       /jf sessions                       (auto-scoped to themselves)
 *       /jf user <action> self|<own name>  (acts on their own sessions only)
 *     Everything else is denied.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { JellyfinService } = require('../services/jellyfinService');

// Discord embed colors.
const COLOR_INFO    = 0x5865F2;  // blurple
const COLOR_SUCCESS = 0x57F287;
const COLOR_WARN    = 0xFEE75C;
const COLOR_ERROR   = 0xED4245;

// Per-message limits we care about.
const MAX_FIELDS_PER_EMBED = 25;
const MAX_EMBEDS_PER_MESSAGE = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jf')
    .setDescription('Jellyfin controls')

    // ---- discovery ---------------------------------------------------------
    .addSubcommand(sc =>
      sc.setName('sessions')
        .setDescription('List active Jellyfin sessions')
        .addStringOption(o => o.setName('user').setDescription('Filter by Jellyfin user name (admin only)').setRequired(false))
        .addBooleanOption(o => o.setName('playing_only').setDescription('Only show sessions currently playing (default true)').setRequired(false))
        .addBooleanOption(o => o.setName('tv_only').setDescription('Only show TV-like clients').setRequired(false)),
    )

    // ---- per-session (admin) -----------------------------------------------
    .addSubcommandGroup(g =>
      g.setName('session')
        .setDescription('Act on a specific session id (admin)')
        .addSubcommand(sc =>
          sc.setName('pause')
            .setDescription('Pause playback on a session')
            .addStringOption(o => o.setName('session_id').setDescription('Session Id from /jf sessions').setRequired(true)),
        )
        .addSubcommand(sc =>
          sc.setName('stop')
            .setDescription('Stop playback on a session')
            .addStringOption(o => o.setName('session_id').setDescription('Session Id').setRequired(true)),
        )
        .addSubcommand(sc =>
          sc.setName('message')
            .setDescription('Send a toast message to a session')
            .addStringOption(o => o.setName('session_id').setDescription('Session Id').setRequired(true))
            .addStringOption(o => o.setName('text').setDescription('Message body').setRequired(true))
            .addStringOption(o => o.setName('header').setDescription('Message header').setRequired(false))
            .addIntegerOption(o => o.setName('timeout_ms').setDescription('How long the toast stays visible').setRequired(false)),
        ),
    )

    // ---- per-device (admin) ------------------------------------------------
    .addSubcommandGroup(g =>
      g.setName('device')
        .setDescription('Act on a specific device id (admin)')
        .addSubcommand(sc =>
          sc.setName('logout')
            .setDescription('Revoke a device\'s access token (forces re-login)')
            .addStringOption(o => o.setName('device_id').setDescription('DeviceId from /jf sessions').setRequired(true)),
        ),
    )

    // ---- per-user (admin or self) ------------------------------------------
    .addSubcommandGroup(g =>
      g.setName('user')
        .setDescription('Fan an action out across a Jellyfin user\'s sessions')
        .addSubcommand(sc =>
          sc.setName('pause')
            .setDescription('Pause a user\'s active sessions')
            .addStringOption(o => o.setName('user').setDescription('Jellyfin user name, or "self". Defaults to self if you are bound.').setRequired(false))
            .addBooleanOption(o => o.setName('tv_only').setDescription('Only TV-like clients (default false)').setRequired(false)),
        )
        .addSubcommand(sc =>
          sc.setName('stop')
            .setDescription('Stop playback on a user\'s active sessions')
            .addStringOption(o => o.setName('user').setDescription('Jellyfin user name, or "self". Defaults to self if you are bound.').setRequired(false))
            .addBooleanOption(o => o.setName('tv_only').setDescription('Only TV-like clients (default false)').setRequired(false)),
        )
        .addSubcommand(sc =>
          sc.setName('logout')
            .setDescription('Stop + revoke tokens for a user\'s active sessions')
            .addStringOption(o => o.setName('user').setDescription('Jellyfin user name, or "self". Defaults to self if you are bound.').setRequired(false))
            .addBooleanOption(o => o.setName('tv_only').setDescription('Only TV-like clients (default false)').setRequired(false)),
        ),
    )

    // ---- server-wide (admin) -----------------------------------------------
    .addSubcommandGroup(g =>
      g.setName('system')
        .setDescription('Control the Jellyfin server itself (admin)')
        .addSubcommand(sc =>
          sc.setName('info').setDescription('Show server info (name, version, OS)'),
        )
        .addSubcommand(sc =>
          sc.setName('restart').setDescription('Restart the Jellyfin server'),
        )
        .addSubcommand(sc =>
          sc.setName('shutdown').setDescription('Shut down the Jellyfin server'),
        ),
    ),

  async execute(interaction) {
    const tag = `${interaction.user.tag} (${interaction.user.id})`;
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const path = group ? `${group} ${sub}` : sub;
    console.log(`[JfCommand] ${tag} invoked /jf ${path}`);

    try {
      const settingsService = interaction.client.settingsService;
      const settings = await settingsService.loadSettings();

      const isAdmin = settings.DiscordSettings.AdminIDs.includes(interaction.user.id);
      const boundJfName = (settings.JellyfinSettings?.UserBindings || {})[interaction.user.id] || null;

      // Authorization gate.
      const auth = authorize({ group, sub, isAdmin, boundJfName });
      if (!auth.ok) {
        await interaction.editReply(`⛔ ${auth.reason}`);
        return false;
      }

      let jf = interaction.client.jellyfinService;
      if (!jf) {
        jf = new JellyfinService(settings);
        interaction.client.jellyfinService = jf;
      }
      if (!jf.enabled) {
        await interaction.editReply(
          '⚠️ Jellyfin is not configured. Set `JellyfinSettings.BaseUrl` and `JellyfinSettings.ApiKey` in settings.json.',
        );
        return false;
      }

      // Dispatch.
      if (!group) {
        // top-level subcommand: only "sessions" today
        return await runSessions(interaction, jf, { isAdmin, boundJfName });
      }

      if (group === 'session') {
        if (sub === 'pause' || sub === 'stop') return await runSessionPlayback(interaction, jf, sub);
        if (sub === 'message') return await runSessionMessage(interaction, jf);
      } else if (group === 'device') {
        if (sub === 'logout') return await runDeviceLogout(interaction, jf);
      } else if (group === 'user') {
        return await runUserAction(interaction, jf, sub, { isAdmin, boundJfName });
      } else if (group === 'system') {
        return await runSystem(interaction, jf, sub);
      }

      await interaction.editReply(`Unknown command: /jf ${path}`);
      return false;
    } catch (error) {
      console.error('[JfCommand] Error:', error);
      try {
        await interaction.editReply(`Error: ${error.message || error}`);
      } catch (e) {
        console.error('[JfCommand] Error sending error reply:', e);
      }
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

function authorize({ group, sub, isAdmin, boundJfName }) {
  if (isAdmin) return { ok: true };

  // Non-admin allowances:
  //   /jf sessions          — auto-scoped to self
  //   /jf user <action>     — only "self" or own bound name (enforced later)
  if (!group && sub === 'sessions') {
    if (!boundJfName) return { ok: false, reason: 'You are not bound to a Jellyfin user. Ask an admin to add you to `JellyfinSettings.UserBindings`.' };
    return { ok: true };
  }
  if (group === 'user') {
    if (!boundJfName) return { ok: false, reason: 'You are not bound to a Jellyfin user. Ask an admin to add you to `JellyfinSettings.UserBindings`.' };
    return { ok: true }; // target check happens in runUserAction
  }

  return { ok: false, reason: 'This subcommand is admin-only.' };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function runSessions(interaction, jf, { isAdmin, boundJfName }) {
  let userArg = interaction.options.getString('user');
  const playingOnly = interaction.options.getBoolean('playing_only') ?? true;
  const tvOnly = interaction.options.getBoolean('tv_only') ?? false;

  // Non-admins are always scoped to their own bound user.
  if (!isAdmin) {
    if (userArg && userArg.toLowerCase() !== boundJfName.toLowerCase() && userArg.toLowerCase() !== 'self') {
      return reply(interaction, '⛔ You can only view your own sessions.');
    }
    userArg = boundJfName;
  }

  let userId;
  if (userArg) {
    const user = await jf.findUserByName(userArg);
    if (!user) return reply(interaction, `No Jellyfin user found matching \`${userArg}\`.`);
    userId = user.Id;
  }

  let sessions = await jf.getSessions({ userId, activeOnly: playingOnly });
  if (tvOnly) sessions = sessions.filter(JellyfinService.looksLikeTV);

  if (sessions.length === 0) return reply(interaction, 'No matching sessions.');

  const filterBits = [];
  if (userArg) filterBits.push(`user=${userArg}`);
  if (tvOnly) filterBits.push('TV only');
  if (playingOnly) filterBits.push('playing only');
  const header = `**Jellyfin sessions** (${sessions.length}${filterBits.length ? ' — ' + filterBits.join(', ') : ''})`;

  // Playing sessions first, then idle.
  sessions.sort((a, b) => Number(!!b.NowPlayingItem) - Number(!!a.NowPlayingItem));

  const embeds = sessions.map(buildSessionEmbed);
  const pages = chunk(embeds, MAX_EMBEDS_PER_MESSAGE);
  await interaction.editReply({ content: header, embeds: pages[0], components: [] });
  for (let i = 1; i < pages.length; i++) {
    await interaction.followUp({ embeds: pages[i] });
  }
  return true;
}

async function runSessionPlayback(interaction, jf, action) {
  const sessionId = interaction.options.getString('session_id');
  await jf[action](sessionId);
  return reply(interaction, `✅ Sent **${action}** to session \`${sessionId}\`.`);
}

async function runSessionMessage(interaction, jf) {
  const sessionId = interaction.options.getString('session_id');
  const text = interaction.options.getString('text');
  const header = interaction.options.getString('header') || 'Notice';
  const timeoutMs = interaction.options.getInteger('timeout_ms') ?? 5000;

  await jf.sendMessage(sessionId, { text, header, timeoutMs });
  return reply(interaction, `✅ Sent message to \`${sessionId}\`.`);
}

async function runDeviceLogout(interaction, jf) {
  const deviceId = interaction.options.getString('device_id');
  await jf.deleteDevice(deviceId);
  return reply(interaction, `✅ Revoked access token for device \`${deviceId}\`.`);
}

async function runUserAction(interaction, jf, action, { isAdmin, boundJfName }) {
  let userArg = interaction.options.getString('user');
  const tvOnly = interaction.options.getBoolean('tv_only') ?? false;

  // Default to self when omitted (works for anyone with a binding).
  if (!userArg) {
    if (boundJfName) {
      userArg = boundJfName;
    } else if (isAdmin) {
      return reply(interaction, 'Specify `user:` (or add yourself to `JellyfinSettings.UserBindings` to default to self).');
    } else {
      return reply(interaction, '⛔ You are not bound to a Jellyfin user.');
    }
  }

  // Resolve "self".
  if (userArg.toLowerCase() === 'self') {
    if (!boundJfName) return reply(interaction, '⛔ You are not bound to a Jellyfin user.');
    userArg = boundJfName;
  }

  // Non-admins may only target themselves.
  if (!isAdmin && userArg.toLowerCase() !== boundJfName.toLowerCase()) {
    return reply(interaction, '⛔ You can only act on your own Jellyfin sessions.');
  }

  const user = await jf.findUserByName(userArg);
  if (!user) return reply(interaction, `No Jellyfin user found matching \`${userArg}\`.`);

  // For pause/stop, only acting on sessions that are actually playing makes
  // sense (idle sessions have nothing to pause/stop). For logout we want to
  // revoke every device the user is signed in on, idle or not.
  const activeOnly = action !== 'logout';

  let sessions = await jf.getSessions({ userId: user.Id, activeOnly });
  if (tvOnly) sessions = sessions.filter(JellyfinService.looksLikeTV);

  if (sessions.length === 0) {
    const what = activeOnly ? 'sessions currently playing' : 'active sessions';
    return reply(interaction, `No ${tvOnly ? 'TV ' : ''}${what} for **${user.Name}**.`);
  }

  const results = [];
  for (const s of sessions) {
    const row = {
      device: s.DeviceName || '?',
      client: s.Client || '?',
      tv: JellyfinService.looksLikeTV(s),
      nowPlaying: nowPlayingDesc(s.NowPlayingItem),
    };
    try {
      if (action === 'pause') {
        await jf.pause(s.Id);
      } else if (action === 'stop') {
        await jf.stop(s.Id);
      } else if (action === 'logout') {
        if (!s.DeviceId) throw new Error('session has no DeviceId');
        // Stop first so playback actually halts; revoking the token alone
        // doesn't interrupt a buffered/in-flight stream.
        try {
          await jf.stop(s.Id);
        } catch (stopErr) {
          console.warn(`[JfCommand] stop before logout failed on ${s.Id}: ${stopErr.message}`);
        }
        await jf.deleteDevice(s.DeviceId);
      }
      results.push({ ...row, ok: true, msg: action });
    } catch (e) {
      console.error(`[JfCommand] ${action} failed on ${s.Id}:`, e);
      results.push({ ...row, ok: false, msg: e.message });
    }
  }

  const embed = buildResultsEmbed(results, { action, user, tvOnly });
  return replyEmbeds(interaction, [embed]);
}

async function runSystem(interaction, jf, sub) {
  if (sub === 'info') {
    const info = await jf.getSystemInfo();
    const embed = new EmbedBuilder()
      .setColor(COLOR_INFO)
      .setTitle(`🎥 ${info.ServerName || 'Jellyfin'}`)
      .addFields(
        { name: 'Version', value: info.Version || '?', inline: true },
        { name: 'OS', value: info.OperatingSystem || info.OperatingSystemDisplayName || '?', inline: true },
        { name: 'Id', value: `\`${info.Id || '?'}\``, inline: false },
      );
    return replyEmbeds(interaction, [embed]);
  }
  if (sub === 'restart') {
    await jf.restartSystem();
    return reply(interaction, '♻️ Jellyfin restart requested.');
  }
  if (sub === 'shutdown') {
    await jf.shutdownSystem();
    return reply(interaction, '🔌 Jellyfin shutdown requested.');
  }
  return reply(interaction, `Unknown system subcommand: ${sub}`);
}

// ---------------------------------------------------------------------------
// Reply helpers
// ---------------------------------------------------------------------------

async function reply(interaction, content) {
  await interaction.editReply({ content: truncate(content), embeds: [], components: [] });
  return true;
}

async function replyEmbeds(interaction, embeds) {
  // Clear any prior "Thinking!" content; cap to Discord's 10-embed limit.
  await interaction.editReply({
    content: '',
    embeds: embeds.slice(0, MAX_EMBEDS_PER_MESSAGE),
    components: [],
  });
  return true;
}

function truncate(s, max = 1900) {
  if (s.length <= max) return s;
  return s.slice(0, max - 20) + '\n…(truncated)';
}

// ---------------------------------------------------------------------------
// Embed builders
// ---------------------------------------------------------------------------

/** Human-readable "now playing" string from a NowPlayingItem. */
function nowPlayingDesc(n) {
  if (!n) return '';
  const series = n.SeriesName ? `${n.SeriesName} — ` : '';
  const ep = (n.ParentIndexNumber != null && n.IndexNumber != null)
    ? `S${n.ParentIndexNumber}E${n.IndexNumber} `
    : '';
  return `${series}${ep}${n.Name || '?'}`;
}

/** Truncate to fit Discord's 1024-char field value limit (with safety margin). */
function clip(s, max = 1000) {
  s = String(s ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Pick an emoji that roughly matches the client kind. */
function deviceIcon(s) {
  if (JellyfinService.looksLikeTV(s)) return '📺';
  const c = (s.Client || '').toLowerCase();
  if (c.includes('android') || c.includes('ios') || c.includes('iphone') || c.includes('ipad') || c.includes('mobile')) return '📱';
  if (c.includes('web')) return '💻';
  return '🎬';
}

/**
 * Build one embed for a single Jellyfin session. Card layout:
 *   title       📺 alice
 *   description **Living Room TV** · Jellyfin AndroidTV · 📍 192.168.1.42
 *   field       ▶ Now Playing  (full width)
 *   field       Method         (inline)
 *   field       Transcode      (inline, only when transcoding)
 *   field       Session ID     (full width, inline code = click to copy)
 * Color: green = direct play, red = transcoding, grey = idle.
 */
function buildSessionEmbed(s) {
  const playing = !!s.NowPlayingItem;
  const method = s.PlayState?.PlayMethod || '';
  const reasons = s.TranscodingInfo?.TranscodeReasons || [];
  const isTranscode = method === 'Transcode' || reasons.length > 0;

  let color;
  if (!playing) color = 0x99AAB5;       // idle grey
  else if (isTranscode) color = COLOR_ERROR;
  else color = COLOR_SUCCESS;

  const ip = cleanIp(s.RemoteEndPoint);
  const descBits = [`**${s.DeviceName || '?'}**`];
  if (s.Client) descBits.push(s.Client);
  if (ip) descBits.push(`📍 \`${ip}\``);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${deviceIcon(s)} ${s.UserName || '?'}`)
    .setDescription(descBits.join(' · '));

  if (playing) {
    embed.addFields({
      name: '▶ Now Playing',
      value: clip(nowPlayingDesc(s.NowPlayingItem) || '?'),
      inline: false,
    });
  }
  if (method) {
    embed.addFields({ name: 'Method', value: method, inline: true });
  }
  if (reasons.length > 0) {
    embed.addFields({ name: 'Transcode reasons', value: clip(reasons.join(', ')), inline: true });
  }
  embed.addFields({ name: 'Session ID', value: `\`${s.Id}\``, inline: false });

  return embed;
}

/** Normalize Jellyfin's RemoteEndPoint into a plain IP. */
function cleanIp(ep) {
  if (!ep) return '';
  let ip = String(ep);
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(':')[0];
  return ip;
}

/**
 * Build the /jf user <action> result embed.
 */
function buildResultsEmbed(results, { action, user, tvOnly }) {
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;
  const color = fail === 0 ? COLOR_SUCCESS : ok === 0 ? COLOR_ERROR : COLOR_WARN;
  const icon = action === 'pause' ? '⏸️' : action === 'stop' ? '⏹️' : '🚪';

  const descBits = [
    `${results.length} session${results.length === 1 ? '' : 's'}`,
    `${ok} ok`,
    fail > 0 ? `${fail} failed` : null,
    tvOnly ? 'TV only' : null,
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} ${action} → ${user.Name}`)
    .setDescription(`_${descBits.join(' · ')}_`)
    .addFields(results.slice(0, MAX_FIELDS_PER_EMBED).map(r => {
      const mark = r.ok ? '✅' : '❌';
      const lines = [r.client];
      if (r.nowPlaying) lines.push(`▶ ${r.nowPlaying}`);
      lines.push(r.ok ? `_${r.msg}_` : `error: ${r.msg}`);
      return {
        name: `${mark} ${r.tv ? '📺 ' : ''}${r.device}`,
        value: clip(lines.join('\n')),
        inline: false,
      };
    }));

  if (results.length > MAX_FIELDS_PER_EMBED) {
    embed.setFooter({ text: `…and ${results.length - MAX_FIELDS_PER_EMBED} more (truncated)` });
  }
  return embed;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
