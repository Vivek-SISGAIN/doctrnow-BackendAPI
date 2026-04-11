const crypto = require('crypto');

/**
 * Middleware to protect inter-service communication.
 * Validates the X-Internal-Sig header against the shared INTERNAL_SERVICE_SECRET.
 */
function internalAuth(req, res, next) {
  const secret = process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    console.warn('CRITICAL: INTERNAL_SERVICE_SECRET is not set');
    return res.status(500).json({ success: false, message: 'Internal config error' });
  }

  const sig = req.headers['x-internal-sig'];
  if (!sig || sig !== secret) {
    return res.status(403).json({ success: false, message: 'Forbidden: Invalid internal signature' });
  }

  next();
}

module.exports = { internalAuth };
