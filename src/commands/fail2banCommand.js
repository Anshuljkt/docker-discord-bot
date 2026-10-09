/* dd-bot - /fail2ban command
 *
 * Subcommands:
 *   /fail2ban status                       - daemon status + jail list
 *   /fail2ban jails                        - per-jail ban counts
 *   /fail2ban banned [jail]                - list banned IPs (one jail or all)
 *   /fail2ban check  <ip>                  - which jail(s) is this IP banned in?
 *   /fail2ban ban    <ip> <jail>           - ban an IP in a jail
 *   /fail2ban unban  <ip> [jail]           - unban an IP (jail-scoped or global)
 *
 * Authorization:
 *   - Admins (DiscordSettings.AdminIDs) can use everything.
 *   - Otherwise the user/role must have the matching permission under the
 *     existing `fail2ban` permission bucket:
 *       view    - status, jails, banned, check  (also accepts legacy keys)
 *       ban     - ban    (alias: banIP)
 *       unban   - unban  (alias: unbanIP)
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const COLOR_INFO    = 0x5865F2;
const COLOR_SUCCESS = 0x57F287;
const COLOR_ERROR   = 0xED4245;
const COLOR_WARN    = 0xFEE75C;

// Map of subcommand -> required perm (any of these permission tokens grants access).
const PERMS = {
  status: ['view'],
  jails:  ['view'],
  banned: ['view'],
  check:  ['view'],
  ban:    ['ban',   'banIP'],
  unban:  ['unban', 'unbanIP'],
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fail2ban')
    .setDescription('fail2ban controls')
    .addSubcommand(sc =>
      sc.setName('status').setDescription('Show daemon status (jail list + total)'),
    )
    .addSubcommand(sc =>
      sc.setName('jails').setDescription('Show ban counts per jail'),
    )
    .addSubcommand(sc =>
      sc.setName('banned')
        .setDescription('List currently banned IPs')
        .addStringOption(o => o.setName('jail').setDescription('Restrict to one jail').setRequired(false)),
    )
    .addSubcommand(sc =>
      sc.setName('check')
        .setDescription('Check whether an IP is banned (and where)')
        .addStringOption(o => o.setName('ip').setDescription('IPv4 or IPv6 address').setRequired(true)),
    )
    .addSubcommand(sc =>
      sc.setName('ban')
        .setDescription('Ban an IP in a jail')
        .addStringOption(o => o.setName('ip').setDescription('IPv4 or IPv6 address').setRequired(true))
        .addStringOption(o => o.setName('jail').setDescription('Jail name (e.g. sshd)').setRequired(true)),
    )
    .addSubcommand(sc =>
      sc.setName('unban')
        .setDescription('Unban an IP (jail-scoped or global)')
        .addStringOption(o => o.setName('ip').setDescription('IPv4 or IPv6 address').setRequired(true))
        .addStringOption(o => o.setName('jail').setDescription('Restrict to one jail (default: all)').setRequired(false)),
    ),

  async execute(interaction) {
    const tag = `${interaction.user.tag} (${interaction.user.id})`;
    const sub = interaction.options.getSubcommand();
    console.log(`[Fail2banCommand] ${tag} invoked /fail2ban ${sub}`);

    try {
      const settings = await interaction.client.settingsService.loadSettings();

      if (!authorize(interaction, settings, sub)) {
        await interaction.editReply('⛔ You are not allowed to use this command.');
        return false;
      }

      const fb = interaction.client.fail2banService;
      if (!fb) {
        await interaction.editReply('⚠️ fail2ban service not initialised.');
        return false;
      }

      if (sub === 'status') return await runStatus(interaction, fb);
      if (sub === 'jails')  return await runJails(interaction, fb);
      if (sub === 'banned') return await runBanned(interaction, fb);
      if (sub === 'check')  return await runCheck(interaction, fb);
      if (sub === 'ban')    return await runBan(interaction, fb);
      if (sub === 'unban')  return await runUnban(interaction, fb);

      await interaction.editReply(`Unknown subcommand: ${sub}`);
      return false;
    } catch (error) {
      console.error('[Fail2banCommand] Error:', error);
      try {
        await interaction.editReply(`Error: ${error.message || error}`);
      } catch (e) {
        console.error('[Fail2banCommand] Error sending error reply:', e);
      }
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

function authorize(interaction, settings, sub) {
  if (settings.DiscordSettings.AdminIDs.includes(interaction.user.id)) return true;

  const required = PERMS[sub] || [];
  if (required.length === 0) return false;

  const userId = interaction.user.id;
  const userRoles = interaction.member?.roles?.cache;
  const granted = new Set();

  const userPerms = settings.DiscordSettings.UserPermissions?.[userId]?.fail2ban;
  if (Array.isArray(userPerms)) userPerms.forEach(p => granted.add(p));

  if (userRoles) {
    for (const [roleId, rolePerms] of Object.entries(settings.DiscordSettings.RolePermissions || {})) {
      if (userRoles.has(roleId) && Array.isArray(rolePerms.fail2ban)) {
        rolePerms.fail2ban.forEach(p => granted.add(p));
      }
    }
  }

  return required.some(p => granted.has(p));
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function runStatus(interaction, fb) {
  const s = await fb.serverStatus();
  const embed = new EmbedBuilder()
    .setColor(COLOR_INFO)
    .setTitle('🛡️ fail2ban status')
    .setDescription(s.jailList.length === 0
      ? '_No jails configured._'
      : `**${s.total}** jail${s.total === 1 ? '' : 's'} active`)
    .addFields({
      name: 'Jails',
      value: s.jailList.length > 0 ? clip(s.jailList.map(j => `\`${j}\``).join(', ')) : '—',
      inline: false,
    });
  await interaction.editReply({ content: '', embeds: [embed] });
  return true;
}

async function runJails(interaction, fb) {
  const { jailList } = await fb.serverStatus();
  if (jailList.length === 0) {
    await interaction.editReply('No jails configured.');
    return true;
  }

  const stats = await Promise.all(jailList.map(async jail => {
    try {
      const s = await fb.jailStatus(jail);
      return { jail, ok: true, ...s };
    } catch (e) {
      return { jail, ok: false, error: e.message };
    }
  }));

  const totalBanned = stats.reduce((n, s) => n + (s.ok ? s.currentlyBanned : 0), 0);
  const embed = new EmbedBuilder()
    .setColor(totalBanned > 0 ? COLOR_WARN : COLOR_SUCCESS)
    .setTitle('🛡️ fail2ban jails')
    .setDescription(`**${totalBanned}** IP${totalBanned === 1 ? '' : 's'} currently banned across ${jailList.length} jail${jailList.length === 1 ? '' : 's'}`);

  addCappedFields(embed, stats.map(s => s.ok
    ? {
      name: s.jail,
      value: `**${s.currentlyBanned}** banned · ${s.totalBanned} total · ${s.currentlyFailed} failing`,
      inline: true,
    }
    : { name: `❌ ${s.jail}`, value: clip(s.error), inline: true }));
  await interaction.editReply({ content: '', embeds: [embed] });
  return true;
}

async function runBanned(interaction, fb) {
  const jailArg = interaction.options.getString('jail');
  const jails = jailArg ? [jailArg] : (await fb.serverStatus()).jailList;

  if (jails.length === 0) {
    await interaction.editReply('No jails to inspect.');
    return true;
  }

  const groups = [];
  let total = 0;
  for (const jail of jails) {
    try {
      const ips = await fb.bannedIPs(jail);
      total += ips.length;
      groups.push({ jail, ips });
    } catch (e) {
      groups.push({ jail, error: e.message });
    }
  }

  const embed = new EmbedBuilder()
    .setColor(total > 0 ? COLOR_WARN : COLOR_SUCCESS)
    .setTitle(`🚫 banned IPs${jailArg ? ` — ${jailArg}` : ''}`)
    .setDescription(`**${total}** currently banned`);

  addCappedFields(embed, groups.map(g => {
    if (g.error) return { name: `❌ ${g.jail}`, value: clip(g.error), inline: false };
    if (g.ips.length === 0) return { name: g.jail, value: '_(none)_', inline: true };
    return {
      name: `${g.jail} (${g.ips.length})`,
      value: clip(g.ips.map(ip => `\`${ip}\``).join('\n')),
      inline: false,
    };
  }));
  await interaction.editReply({ content: '', embeds: [embed] });
  return true;
}

async function runCheck(interaction, fb) {
  const ip = interaction.options.getString('ip');
  const { hits, failed } = await fb.findIP(ip);
  const lines = [];
  if (hits.length > 0) {
    lines.push(`🚫 Banned in **${hits.length}** jail${hits.length === 1 ? '' : 's'}: ${hits.map(h => `\`${h.jail}\``).join(', ')}`);
  } else if (failed.length === 0) {
    lines.push('✅ Not currently banned in any jail.');
  } else {
    lines.push('❔ Not banned in any jail that could be read.');
  }
  if (failed.length > 0) {
    lines.push(`⚠️ Could not read: ${failed.map(f => `\`${f.jail}\``).join(', ')}`);
  }
  const embed = new EmbedBuilder()
    .setColor(hits.length > 0 || failed.length > 0 ? COLOR_WARN : COLOR_SUCCESS)
    .setTitle(`🔎 \`${ip}\``)
    .setDescription(clip(lines.join('\n'), 4000));
  await interaction.editReply({ content: '', embeds: [embed] });
  return true;
}

async function runBan(interaction, fb) {
  const ip = interaction.options.getString('ip');
  const jail = interaction.options.getString('jail');
  const result = await fb.ban(ip, jail);
  const embed = new EmbedBuilder()
    .setColor(result.ok ? COLOR_SUCCESS : COLOR_ERROR)
    .setTitle(`${result.ok ? '✅' : '❌'} ban \`${ip}\` in \`${jail}\``)
    .setDescription(clip('```\n' + (result.raw.trim() || '(no output)') + '\n```'));
  await interaction.editReply({ content: '', embeds: [embed] });
  return result.ok;
}

async function runUnban(interaction, fb) {
  const ip = interaction.options.getString('ip');
  const jail = interaction.options.getString('jail');
  const result = await fb.unban(ip, jail || undefined);
  const embed = new EmbedBuilder()
    .setColor(result.ok ? COLOR_SUCCESS : COLOR_ERROR)
    .setTitle(`${result.ok ? '✅' : '❌'} unban \`${ip}\`${jail ? ` from \`${jail}\`` : ' (all jails)'}`)
    .setDescription(clip('```\n' + (result.raw.trim() || '(no output)') + '\n```'));
  await interaction.editReply({ content: '', embeds: [embed] });
  return result.ok;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clip(s, max = 1000) {
  s = String(s ?? '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Discord embeds allow at most 25 fields and 6000 characters in total.
const MAX_FIELDS = 25;
const MAX_EMBED_CHARS = 5500;

/** Add as many fields as fit, then a final "N more not shown" field. */
function addCappedFields(embed, fields) {
  let used = (embed.data.title?.length || 0) + (embed.data.description?.length || 0);
  const kept = [];
  for (let i = 0; i < fields.length; i++) {
    const isLast = i === fields.length - 1;
    const slots = isLast ? MAX_FIELDS : MAX_FIELDS - 1; // reserve one for the overflow note
    const size = fields[i].name.length + fields[i].value.length;
    if (kept.length >= slots || used + size > MAX_EMBED_CHARS) break;
    kept.push(fields[i]);
    used += size;
  }
  const dropped = fields.length - kept.length;
  if (dropped > 0) {
    kept.push({ name: '…', value: `${dropped} more jail${dropped === 1 ? '' : 's'} not shown`, inline: false });
  }
  if (kept.length > 0) embed.addFields(kept);
}
