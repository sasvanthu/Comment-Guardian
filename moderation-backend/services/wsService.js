/**
 * WebSocket server for real-time moderation log streaming.
 *
 * Endpoint: ws://<host>/ws/logs?token=<API_AUTH_TOKEN>
 *
 * Messages sent to clients (all JSON):
 *   { type: 'snapshot',  logs: [...] }   // sent once on connect
 *   { type: 'connected', time: '...' }
 *   { type: 'log',       record: {...} } // every new log entry
 *   { type: 'ping',      time: 1234 }    // keepalive heartbeat
 */
const { WebSocketServer } = require('ws');
const log = require('./logService');

function attach(httpServer, { path = '/ws/logs' } = {}) {
  const wss = new WebSocketServer({ noServer: true });

  // Manual upgrade handling so we can validate path + token before accepting.
  httpServer.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname !== path) return; // let other upgrade handlers (if any) try

    const required = process.env.API_AUTH_TOKEN;
    if (required) {
      const token =
        url.searchParams.get('token') ||
        (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (token !== required) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    const send = (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };

    send({ type: 'snapshot', logs: log.list({ limit: 30 }) });
    send({ type: 'connected', time: new Date().toISOString() });

    const unsubscribe = log.subscribe((record) => send({ type: 'log', record }));

    // Keepalive: ws ping frame + JSON ping (some proxies eat ping frames).
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const heartbeat = setInterval(() => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
      send({ type: 'ping', time: Date.now() });
    }, 25000);

    ws.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  console.log(`[ws] log stream attached at ${path}`);
  return wss;
}

module.exports = { attach };
