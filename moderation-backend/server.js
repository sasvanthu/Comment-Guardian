/**
 * Social Media Comment Moderation - Backend Server
 * Express.js entry point
 */
const path = require('path');
require('dotenv').config(); // load local .env
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); // also load root .env


const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const ws = require('./services/wsService');

const twitterRoutes = require('./routes/twitter');
const facebookRoutes = require('./routes/facebook');
const instagramRoutes = require('./routes/instagram');
const youtubeRoutes = require('./routes/youtube');
const linkedinRoutes = require('./routes/linkedin');
const pinterestRoutes = require('./routes/pinterest');
const aiRoutes = require('./routes/ai');
const dashboardRoutes = require('./routes/dashboard');
const moderationRoutes = require('./routes/moderation');
const rpcRoutes = require('./routes/rpc');

const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;

// --- Security & parsing middleware ---
app.use(helmet());

// CORS: explicit allow-list from env (comma-separated). Falls back to
// common localhost ports for development convenience.
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:4173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin / curl / server-to-server requests have no Origin header.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: false,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Global rate limit
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// --- Health check ---
app.get('/', (_req, res) => {
  res.json({
    name: 'Moderation Backend',
    status: 'ok',
    time: new Date().toISOString(),
  });
});

// --- Routes ---
app.use('/api/twitter', twitterRoutes);
app.use('/api/facebook', facebookRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/pinterest', pinterestRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/rpc', rpcRoutes);

// --- 404 + error handler (must be last) ---
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
ws.attach(server, { path: '/ws/logs' });

server.listen(PORT, () => {
  console.log(`[server] Moderation backend listening on http://localhost:${PORT}`);
  console.log(`[server] WebSocket log stream at ws://localhost:${PORT}/ws/logs`);
});

module.exports = app;
