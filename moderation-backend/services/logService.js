/**
 * Append-only moderation activity log with a tiny EventEmitter
 * for real-time SSE/WebSocket subscribers.
 */
const { EventEmitter } = require('events');
const { load, save } = require('./store');

const FILE = 'moderation-log.json';
const MAX = 5000;

const bus = new EventEmitter();
bus.setMaxListeners(0); // allow many concurrent SSE clients

function list({ limit = 100 } = {}) {
  return load(FILE, []).slice(0, Number(limit) || 100);
}

function append(entry) {
  const all = load(FILE, []);
  const record = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  all.unshift(record);
  if (all.length > MAX) all.length = MAX;
  save(FILE, all);
  // notify live subscribers
  bus.emit('log', record);
  return record;
}

function subscribe(listener) {
  bus.on('log', listener);
  return () => bus.off('log', listener);
}

module.exports = { list, append, subscribe };
