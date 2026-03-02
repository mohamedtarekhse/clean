/**
 * Send a successful response
 * @param {Response} res
 * @param {*}        data
 * @param {number}   status  HTTP status code
 * @param {object}   meta    Extra metadata (pagination, counts …)
 */
function ok(res, data, status = 200, meta = {}) {
  return res.status(status).json({ success: true, data, ...meta });
}

/**
 * Send an error response
 * @param {Response} res
 * @param {number}   status  HTTP status code
 * @param {string}   message Human-readable error
 * @param {*}        details Optional details (validation errors etc.)
 */
function fail(res, status, message, details = null) {
  const body = { success: false, error: message };
  if (details) body.details = details;
  return res.status(status).json(body);
}

/**
 * Handle a Supabase query result: propagate error or return data
 */
function fromSupabase(res, { data, error }, status = 200, meta = {}) {
  if (error) {
    console.error('[Supabase]', error.message);
    return fail(res, 500, error.message);
  }
  return ok(res, data, status, meta);
}

module.exports = { ok, fail, fromSupabase };
