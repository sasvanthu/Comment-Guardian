/**
 * Blacklist service — persistent JSON store.
 * Tracks blocked user IDs across platforms with the reason and timestamp.
 */
const { load, save } = require('./store');
const FILE = 'blacklist.json';

function list() {
  return load(FILE, []);
}

function isBlocked(userId, platform) {
  if (!userId) return false;
  return list().some((b) => b.userId === userId && (!platform || b.platform === platform));
}

function add({ userId, username, platform, reason, categories = [], ip = null }) {
  if (!userId || !platform) {
    const err = new Error('userId and platform are required');
    err.status = 400;
    throw err;
  }
  const all = list();
  if (all.some((b) => b.userId === userId && b.platform === platform)) {
    return { added: false, reason: 'already blocked' };
  }
  const entry = {
    userId, username: username || userId, platform, reason: reason || 'Auto-blocked by AI moderation',
    categories, ip, timestamp: new Date().toISOString(),
  };
  all.unshift(entry);
  save(FILE, all);
  return { added: true, entry };
}

function remove(userId, platform) {
  const all = list();
  const next = all.filter((b) => !(b.userId === userId && (!platform || b.platform === platform)));
  save(FILE, next);
  return { removed: all.length - next.length };
}

module.exports = { list, isBlocked, add, remove };
