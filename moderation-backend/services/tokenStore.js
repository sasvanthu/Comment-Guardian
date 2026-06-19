/**
 * Lightweight OAuth token store.
 *
 * Keeps tokens in memory for fast access and persists them to a local JSON
 * file so they survive server restarts. The file is gitignored.
 *
 * Shape per platform key (e.g. "youtube"):
 *   { access_token, refresh_token, expires_at, channel_id, channel_name, channel_avatar }
 */
const fs = require('fs');
const path = require('path');

const STORE_PATH = path.resolve(__dirname, '..', 'youtube_oauth_tokens.json');

/** @type {Record<string, any>} */
let _cache = {};

// --- Load on startup ---
function _load() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      _cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('[tokenStore] Failed to load persisted tokens:', err.message);
    _cache = {};
  }
}
_load();

function _persist() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(_cache, null, 2), 'utf-8');
  } catch (err) {
    console.error('[tokenStore] Failed to persist tokens:', err.message);
  }
}

// --- Public API ---

/**
 * Get the stored data for a platform.
 * @param {string} platform
 * @returns {object|null}
 */
exports.get = (platform) => _cache[platform] ?? null;

/**
 * Save/update the data for a platform and persist to disk.
 * @param {string} platform
 * @param {object} data
 */
exports.set = (platform, data) => {
  _cache[platform] = { ...(_cache[platform] || {}), ...data };
  _persist();
};

/**
 * Remove all data for a platform and persist.
 * @param {string} platform
 */
exports.remove = (platform) => {
  delete _cache[platform];
  _persist();
};

/**
 * Check if a platform has a stored refresh token.
 * @param {string} platform
 * @returns {boolean}
 */
exports.hasTokens = (platform) => {
  const d = _cache[platform];
  return !!(d && d.refresh_token);
};

/**
 * Check if the access token is expired (with 60s buffer).
 * @param {string} platform
 * @returns {boolean}
 */
exports.isExpired = (platform) => {
  const d = _cache[platform];
  if (!d || !d.expires_at) return true;
  return Date.now() >= d.expires_at - 60_000;
};
