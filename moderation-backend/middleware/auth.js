/**
 * Required bearer-token auth middleware.
 *
 * The backend always requires API_AUTH_TOKEN in env. If it is missing the
 * process refuses to authorize any request — there is no "disable in
 * development" opt-out, because forgetting to set it in production would
 * silently expose every endpoint (delete comments, manage blacklist,
 * auto-moderate) to the public internet.
 */
module.exports = function auth(req, res, next) {
  const required = process.env.API_AUTH_TOKEN;
  if (!required) {
    console.error('[auth] API_AUTH_TOKEN is not configured; rejecting request');
    return res.status(503).json({ error: 'Service not configured' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token || token !== required) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
