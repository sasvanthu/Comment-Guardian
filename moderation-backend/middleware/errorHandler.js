/**
 * Centralized error handler + 404 helper.
 * Never leaks API keys or upstream secrets to the client.
 *
 * Clients only see `err.publicMessage` (explicitly opted-in) or a generic
 * "Internal server error" — raw `err.message` may contain provider config
 * hints (e.g. "TWITTER_BEARER_TOKEN is not configured"). Full details are
 * logged server-side.
 */
function notFound(req, res, _next) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, _req, res, _next) {
  const status = err.status || err.statusCode || 500;

  // Log full detail server-side only.
  console.error('[error]', status, err.message, err.stack || '');

  // Default to a generic message for any non-2xx response. Service code that
  // wants to surface a safe message must set `err.publicMessage` explicitly.
  let publicMessage = err.publicMessage;
  if (!publicMessage) {
    if (status === 400) publicMessage = 'Bad request';
    else if (status === 401) publicMessage = 'Unauthorized';
    else if (status === 403) publicMessage = 'Forbidden';
    else if (status === 404) publicMessage = 'Not found';
    else if (status === 429) publicMessage = 'Too many requests';
    else publicMessage = 'Internal server error';
  }

  res.status(status).json({
    error: publicMessage,
    ...(err.publicDetails ? { details: err.publicDetails } : {}),
  });
}

module.exports = { notFound, errorHandler };
