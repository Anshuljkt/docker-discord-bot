/**
 * dd-bot - Jellyfin Service
 *
 * Thin wrapper around the Jellyfin REST API using an admin API key.
 *
 * Auth: an API key generated in Jellyfin (Dashboard > API Keys).
 *   Sent as the `Token` parameter of the `MediaBrowser` Authorization scheme,
 *   which Jellyfin accepts for all admin-scoped endpoints.
 */

const packageJson = require('../../package.json');

class JellyfinService {
  constructor(settings) {
    const jf = settings?.JellyfinSettings || {};
    this.baseUrl = (jf.BaseUrl || '').replace(/\/+$/, '');
    this.apiKey = jf.ApiKey || '';
    this.clientName = jf.ClientName || 'dd-bot';
    this.deviceName = jf.DeviceName || 'dd-bot';
    this.deviceId = jf.DeviceId || 'dd-bot';
    this.clientVersion = jf.ClientVersion || packageJson.version || '0.0.0';

    this.enabled = Boolean(this.baseUrl && this.apiKey);

    console.log('[JellyfinService] Initialized');
    console.log(`[JellyfinService]   BaseUrl: ${this.baseUrl || '(not set)'}`);
    console.log(`[JellyfinService]   ApiKey configured: ${this.apiKey ? 'yes' : 'no'}`);
    console.log(`[JellyfinService]   ClientVersion: ${this.clientVersion}`);
    console.log(`[JellyfinService]   Enabled: ${this.enabled}`);
  }

  /**
   * Build the MediaBrowser Authorization header value.
   * @returns {string}
   */
  authHeader() {
    return (
      `MediaBrowser Client="${this.clientName}", ` +
      `Device="${this.deviceName}", ` +
      `DeviceId="${this.deviceId}", ` +
      `Version="${this.clientVersion}", ` +
      `Token="${this.apiKey}"`
    );
  }

  /**
   * Low-level request helper.
   * @param {string} method
   * @param {string} pathAndQuery - e.g. "/Sessions?ControllableByUserId=..."
   * @param {Object} [body]
   * @returns {Promise<any>} parsed JSON body, or null on empty response
   */
  async request(method, pathAndQuery, body) {
    if (!this.enabled) {
      throw new Error('Jellyfin is not configured (set JellyfinSettings.BaseUrl and ApiKey)');
    }

    const url = `${this.baseUrl}${pathAndQuery}`;
    const headers = {
      'Authorization': this.authHeader(),
      'X-Emby-Token': this.apiKey,
      'Accept': 'application/json',
    };
    const init = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    console.log(`[JellyfinService] ${method} ${url}`);

    const res = await fetch(url, init);
    const text = await res.text();

    if (!res.ok) {
      const snippet = text ? text.slice(0, 300) : '(no body)';
      throw new Error(`Jellyfin ${method} ${pathAndQuery} failed: HTTP ${res.status} - ${snippet}`);
    }

    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * GET /Sessions - active sessions (currently connected clients).
   *
   * NOTE: Jellyfin's `?ControllableByUserId=` query filters by "can this user
   * remote-control that session", which is NOT the same as "sessions owned
   * by that user" (admins typically can control everyone). So we fetch all
   * sessions and filter client-side on `s.UserId`.
   *
   * @param {Object} [opts]
   * @param {string} [opts.userId] - only sessions belonging to this user id
   * @param {boolean} [opts.activeOnly] - only sessions with NowPlayingItem set
   * @returns {Promise<Array>} array of session objects
   */
  async getSessions({ userId, activeOnly } = {}) {
    const sessions = await this.request('GET', '/Sessions');
    let arr = Array.isArray(sessions) ? sessions : [];
    if (userId) arr = arr.filter(s => s.UserId === userId);
    if (activeOnly) arr = arr.filter(s => s.NowPlayingItem);
    return arr;
  }

  /**
   * GET /Users - look up users (so we can resolve a userName to an id).
   * @returns {Promise<Array>}
   */
  async getUsers() {
    const users = await this.request('GET', '/Users');
    return Array.isArray(users) ? users : [];
  }

  /**
   * Resolve a Jellyfin user name (case-insensitive) to a user object.
   * @param {string} name
   * @returns {Promise<Object|null>}
   */
  async findUserByName(name) {
    if (!name) return null;
    const target = name.toLowerCase();
    const users = await this.getUsers();
    return users.find(u => (u.Name || '').toLowerCase() === target) || null;
  }

  /**
   * Heuristic: does this session look like a TV / big-screen client?
   * @param {Object} session
   * @returns {boolean}
   */
  static looksLikeTV(session) {
    const client = (session.Client || '').toLowerCase();
    const device = (session.DeviceName || '').toLowerCase();
    const tvClientHints = ['androidtv', 'android tv', 'apple tv', 'tvos', 'roku', 'kodi', 'samsung', 'lg', 'webos', 'tizen', 'chromecast', 'fire tv', 'firetv'];
    if (tvClientHints.some(h => client.includes(h))) return true;
    if (device.includes('tv')) return true;
    return false;
  }

  /**
   * Format a session as a short human-readable line.
   * @param {Object} s
   * @returns {string}
   */
  static formatSession(s) {
    const now = s.NowPlayingItem;
    const playing = now
      ? `▶ ${now.SeriesName ? `${now.SeriesName} - ` : ''}${now.Name || '?'}`
      : 'idle';
    const tv = JellyfinService.looksLikeTV(s) ? ' [TV]' : '';
    return `\`${s.Id}\` — **${s.UserName || '(no user)'}** on *${s.DeviceName || '?'}* (${s.Client || '?'})${tv} — ${playing}`;
  }

  // ---- Playback / session controls -----------------------------------------

  /** Pause playback on a session. */
  pause(sessionId) {
    return this.request('POST', `/Sessions/${encodeURIComponent(sessionId)}/Playing/Pause`);
  }

  /** Resume playback. */
  unpause(sessionId) {
    return this.request('POST', `/Sessions/${encodeURIComponent(sessionId)}/Playing/Unpause`);
  }

  /** Stop playback. */
  stop(sessionId) {
    return this.request('POST', `/Sessions/${encodeURIComponent(sessionId)}/Playing/Stop`);
  }

  /**
   * Send a toast message to a session.
   * @param {string} sessionId
   * @param {Object} opts
   * @param {string} opts.text
   * @param {string} [opts.header]
   * @param {number} [opts.timeoutMs]
   */
  sendMessage(sessionId, { text, header = 'Notice', timeoutMs = 5000 }) {
    return this.request('POST', `/Sessions/${encodeURIComponent(sessionId)}/Message`, {
      Header: header,
      Text: text,
      TimeoutMs: timeoutMs,
    });
  }

  /**
   * Revoke a device's access token (forces logout for that device).
   * @param {string} deviceId - the `Id` from /Devices, NOT the session id.
   */
  deleteDevice(deviceId) {
    return this.request('DELETE', `/Devices?id=${encodeURIComponent(deviceId)}`);
  }

  // ---- System -------------------------------------------------------------

  /** Restart the Jellyfin server. */
  restartSystem() {
    return this.request('POST', '/System/Restart');
  }

  /** Shut down the Jellyfin server. */
  shutdownSystem() {
    return this.request('POST', '/System/Shutdown');
  }

  /** Get public system info (server name, version, OS, etc.). */
  getSystemInfo() {
    return this.request('GET', '/System/Info');
  }
}

module.exports = { JellyfinService };
