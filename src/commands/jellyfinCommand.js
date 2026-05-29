/* dd-bot - /jf command
 *
 * Jellyfin controls organised by target type:
 *
 *   /jf sessions [user] [playing_only] [tv_only]
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

const { SlashCommandBuilder } = require('discord.js');
const { JellyfinService } = require('../services/jellyfinService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jf')
    .setDescription('Jellyfin controls')

    // ---- discovery ---------------------------------------------------------
    .addSubcommand(sc =>
      sc.setName('sessions')
        .setDescription('List active Jellyfin sessions')
        .addStringOption(o => o.setName('user').setDescription('Filter by Jellyfin user name (admin only)').setRequired(false))
        .addBooleanOption(o => o.setName('playing_only').setDescription('Only show sessions currently playing').setRequired(false))
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
  const playingOnly = interaction.options.getBoolean('playing_only') ?? false;
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

  const header = `**Jellyfin sessions** (${sessions.length}` +
    (userArg ? ` for ${userArg}` : '') +
    (tvOnly ? ', TV only' : '') +
    (playingOnly ? ', playing only' : '') +
    `)`;
  return reply(interaction, `${header}\n${buildSessionsBlock(sessions)}`);
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

  const header = `**${action} → ${user.Name}** (${results.length} session${results.length === 1 ? '' : 's'}${tvOnly ? ', TV only' : ''})`;
  return reply(interaction, `${header}\n${buildResultsBlock(results)}`);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function runSystem(interaction, jf, sub) {
  if (sub === 'info') {
    const info = await jf.getSystemInfo();
    const lines = [
      `**${info.ServerName || '?'}** — v${info.Version || '?'}`,
      `OS: ${info.OperatingSystem || info.OperatingSystemDisplayName || '?'}`,
      `Id: \`${info.Id || '?'}\``,
    ];
    return reply(interaction, lines.join('\n'));
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

async function reply(interaction, content) {
  await interaction.editReply(truncate(content));
  return true;
}

function truncate(s, max = 1900) {
  if (s.length <= max) return s;
  return s.slice(0, max - 20) + '\n…(truncated)';
}

// ---------------------------------------------------------------------------
// Rich output helpers
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

/** Pad/truncate a string to fixed display width. */
function pad(s, w) {
  s = String(s ?? '');
  if (s.length > w) return s.slice(0, Math.max(0, w - 1)) + '…';
  return s + ' '.repeat(w - s.length);
}

/**
 * Build the rich /jf sessions output: a playing table, an idle table,
 * and a footer listing session ids for copy-paste into /jf session ....
 */
function buildSessionsBlock(sessions) {
  const playing = sessions.filter(s => s.NowPlayingItem);
  const idle = sessions.filter(s => !s.NowPlayingItem);

  const parts = [];
  let n = 0;
  const indexed = [];

  if (playing.length > 0) {
    parts.push(`▶️ **Playing** (${playing.length})`);
    parts.push(renderSessionTable(playing, true, ++n - 1, indexed));
    n = indexed.length;
  }

  if (idle.length > 0) {
    if (parts.length > 0) parts.push('—'.repeat(20));
    parts.push(`⏸️ **Idle** (${idle.length})`);
    parts.push(renderSessionTable(idle, false, n, indexed));
  }

  // Footer: numbered list of session ids so users can copy them out.
  if (indexed.length > 0) {
    parts.push('**Session IDs**');
    parts.push(indexed.map((s, i) => `\`${i + 1}\` \`${s.Id}\` — ${s.UserName || '?'} / ${s.DeviceName || '?'}`).join('\n'));
  }

  return parts.join('\n');
}

/**
 * Render a code-block table for a list of sessions. `withNowPlaying` adds
 * a Now Playing column. Sessions are pushed into `indexed` so the footer
 * can list ids by 1-based index across both tables.
 */
function renderSessionTable(list, withNowPlaying, startIdx, indexed) {
  const W = { idx: 3, user: 12, device: 16, client: 20, tv: 3, np: 28 };
  const head = [
    pad('#', W.idx),
    pad('User', W.user),
    pad('Device', W.device),
    pad('Client', W.client),
    pad('TV', W.tv),
  ];
  if (withNowPlaying) head.push(pad('Now Playing', W.np));
  const sep = head.map(h => '─'.repeat(h.length)).join('─┼─');

  const rows = list.map((s, i) => {
    indexed.push(s);
    const idx = startIdx + i + 1;
    const cells = [
      pad(String(idx), W.idx),
      pad(s.UserName || '?', W.user),
      pad(s.DeviceName || '?', W.device),
      pad(s.Client || '?', W.client),
      pad(JellyfinService.looksLikeTV(s) ? '✓' : '', W.tv),
    ];
    if (withNowPlaying) cells.push(pad(nowPlayingDesc(s.NowPlayingItem), W.np));
    return cells.join(' │ ');
  });

  return '```\n' + head.join(' │ ') + '\n' + sep + '\n' + rows.join('\n') + '\n```';
}

/** Table of results from runUserAction. */
function buildResultsBlock(results) {
  const W = { mark: 2, device: 16, client: 20, tv: 3, np: 22, msg: 24 };
  const head = [
    pad('', W.mark),
    pad('Device', W.device),
    pad('Client', W.client),
    pad('TV', W.tv),
    pad('Was Playing', W.np),
    pad('Result', W.msg),
  ];
  const sep = head.map(h => '─'.repeat(h.length)).join('─┼─');
  const rows = results.map(r => [
    pad(r.ok ? '✓' : '✗', W.mark),
    pad(r.device, W.device),
    pad(r.client, W.client),
    pad(r.tv ? '✓' : '', W.tv),
    pad(r.nowPlaying, W.np),
    pad(r.msg, W.msg),
  ].join(' │ '));
  return '```\n' + head.join(' │ ') + '\n' + sep + '\n' + rows.join('\n') + '\n```';
}
