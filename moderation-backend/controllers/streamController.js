/**
 * Server-Sent Events stream of moderation log activity.
 *
 * GET /api/moderation/logs/stream
 *
 * Auth: since EventSource cannot set custom headers, this endpoint accepts
 * the token via ?token=... query param when API_AUTH_TOKEN is configured.
 */
const log = require('../services/logService');

exports.stream = (req, res) => {
  // Manual auth check (route is mounted outside the auth middleware)
  const required = process.env.API_AUTH_TOKEN;
  if (required) {
    const token =
      req.query.token ||
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token !== required) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
    'Access-Control-Allow-Origin': '*',
  });
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Initial snapshot so clients render immediately
  send('snapshot', { logs: log.list({ limit: 30 }) });
  send('connected', { time: new Date().toISOString() });

  // Push every new log entry
  const unsubscribe = log.subscribe((record) => send('log', record));

  // Heartbeat to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
};
