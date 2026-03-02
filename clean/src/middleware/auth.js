const { fail } = require('../utils/response');

/**
 * Simple API-key middleware.
 * The frontend must include the header:  x-api-key: <API_SECRET_KEY>
 * In production swap this for Supabase Auth JWT verification.
 */
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key || key !== process.env.API_SECRET_KEY) {
    return fail(res, 401, 'Unauthorized — invalid or missing API key');
  }
  next();
}

/**
 * Role-based guard factory.
 * Usage:  router.delete('/:id', requireApiKey, requireRole(['Admin','Asset Manager']), handler)
 *
 * This is a stub — extend it once you add Supabase Auth JWT decoding.
 * For now it reads a `x-user-role` header (suitable for trusted internal calls).
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    const role = req.headers['x-user-role'];
    if (!role || !allowedRoles.includes(role)) {
      return fail(res, 403, `Forbidden — required role: ${allowedRoles.join(' | ')}`);
    }
    next();
  };
}

module.exports = { requireApiKey, requireRole };
