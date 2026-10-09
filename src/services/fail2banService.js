/**
 * dd-bot - fail2ban service
 *
 * Thin wrapper around `fail2ban-client` running inside a Docker container.
 * Commands are dispatched as argv (no shell), so user-supplied IPs and jail
 * names are passed as separate arguments and cannot inject shell metacharacters.
 *
 * Public API:
 *   await fb.serverStatus()                 -> { jailList: [...], total: number, raw }
 *   await fb.jailStatus(jail)               -> { currentlyFailed, totalFailed, currentlyBanned, totalBanned, bannedIPs, raw }
 *   await fb.bannedIPs(jail)                -> string[]                    // alias for jailStatus(jail).bannedIPs
 *   await fb.findIP(ip)                     -> { jail: string, banned: boolean }[]
 *   await fb.ban(ip, jail)                  -> { ok, raw }
 *   await fb.unban(ip, jail?)               -> { ok, raw }
 *
 * Note: `fail2ban-client ban` does NOT exist as a top-level verb in fail2ban —
 * banning requires a jail (`set <jail> banip <ip>`). Unban can be jail-scoped
 * (`set <jail> unbanip <ip>`) or global (`unban <ip>`).
 */

const net = require('net');

const DEFAULT_CONTAINER = 'fail2ban';
const EXEC_TIMEOUT_MS = 15_000;

class Fail2banService {
  /**
   * @param {object} opts
   * @param {import('./dockerService').DockerService} opts.dockerService
   * @param {string} [opts.containerName='fail2ban']
   */
  constructor({ dockerService, containerName = DEFAULT_CONTAINER }) {
    this.dockerService = dockerService;
    this.containerName = containerName;
  }

  // ---- public API ---------------------------------------------------------

  async serverStatus() {
    const { stdout } = await this.exec(['fail2ban-client', 'status']);
    const jails = (stdout.match(/Jail list:\s*([^\n]*)/i)?.[1] || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const total = Number(stdout.match(/Number of jail:\s*(\d+)/i)?.[1] || jails.length);
    return { jailList: jails, total, raw: stdout };
  }

  async jailStatus(jail) {
    assertSafeJailName(jail);
    const { stdout } = await this.exec(['fail2ban-client', 'status', jail]);
    const num = (label) => Number(stdout.match(new RegExp(`${label}:\\s*(\\d+)`, 'i'))?.[1] || 0);
    const ipsLine = stdout.match(/Banned IP list:\s*([^\n]*)/i)?.[1] || '';
    const bannedIPs = ipsLine.split(/\s+/).filter(Boolean);
    return {
      currentlyFailed: num('Currently failed'),
      totalFailed: num('Total failed'),
      currentlyBanned: num('Currently banned'),
      totalBanned: num('Total banned'),
      bannedIPs,
      raw: stdout,
    };
  }

  async bannedIPs(jail) {
    return (await this.jailStatus(jail)).bannedIPs;
  }

  /**
   * Search every jail for `ip`. Returns one entry per jail with banned=true.
   */
  async findIP(ip) {
    assertSafeIP(ip);
    const { jailList } = await this.serverStatus();
    const hits = [];
    for (const jail of jailList) {
      try {
        const ips = await this.bannedIPs(jail);
        if (ips.includes(ip)) hits.push({ jail, banned: true });
      } catch (e) {
        // Skip jails we can't read instead of failing the whole query.
        console.warn(`[Fail2banService] status ${jail} failed: ${e.message}`);
      }
    }
    return hits;
  }

  async ban(ip, jail) {
    assertSafeIP(ip);
    assertSafeJailName(jail);
    const { stdout, exitCode } = await this.exec(['fail2ban-client', 'set', jail, 'banip', ip]);
    // fail2ban-client prints "1" on success (1 IP banned) and "0" if already banned.
    const ok = exitCode === 0;
    return { ok, raw: stdout };
  }

  async unban(ip, jail) {
    assertSafeIP(ip);
    let argv;
    if (jail) {
      assertSafeJailName(jail);
      argv = ['fail2ban-client', 'set', jail, 'unbanip', ip];
    } else {
      argv = ['fail2ban-client', 'unban', ip];
    }
    const { stdout, exitCode } = await this.exec(argv);
    return { ok: exitCode === 0, raw: stdout };
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Exec an argv (no shell) inside the fail2ban container and return
   * { stdout, stderr, exitCode }. Throws if the container is missing or
   * not running, or the exec itself errors.
   */
  async exec(argv) {
    const meta = this.dockerService.getContainerByName(this.containerName);
    if (!meta) throw new Error(`fail2ban container '${this.containerName}' not found`);
    if (meta.State !== 'running') throw new Error(`fail2ban container '${this.containerName}' is not running (state=${meta.State})`);

    const container = this.dockerService.docker.getContainer(meta.Id);
    const exec = await container.exec({
      Cmd: argv,                  // argv form: no shell interpretation
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start();
    const { stdout, stderr } = await collectStream(container, stream, EXEC_TIMEOUT_MS);
    const inspect = await exec.inspect();
    return { stdout, stderr, exitCode: inspect.ExitCode ?? -1 };
  }
}

/**
 * Demultiplex a dockerode exec stream into stdout/stderr.
 * Dockerode's modem.demuxStream handles the 8-byte frame header for us.
 */
function collectStream(container, stream, timeoutMs) {
  return new Promise((resolve, reject) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    const stdoutStream = { write: (b) => stdoutChunks.push(b) };
    const stderrStream = { write: (b) => stderrChunks.push(b) };
    container.modem.demuxStream(stream, stdoutStream, stderrStream);

    const timer = setTimeout(() => {
      stream.destroy(new Error(`fail2ban exec timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    stream.on('end', () => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdoutChunks.map(toBuf)).toString('utf8'),
        stderr: Buffer.concat(stderrChunks.map(toBuf)).toString('utf8'),
      });
    });
    stream.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function toBuf(b) {
  return Buffer.isBuffer(b) ? b : Buffer.from(b);
}

// ---- validation -----------------------------------------------------------

function assertSafeIP(ip) {
  if (typeof ip !== 'string' || net.isIP(ip) === 0) {
    throw new Error(`Invalid IP address: ${ip}`);
  }
}

/**
 * Jail names in fail2ban are conventionally [A-Za-z0-9_.-]. Reject anything
 * else even though we use argv form (defense in depth + clearer errors).
 */
function assertSafeJailName(name) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error(`Invalid jail name: ${name}`);
  }
}

module.exports = { Fail2banService };
