const { fail } = require('../utils/response');

function errorHandler(err, req, res, next) {
  console.error('[Unhandled Error]', err.stack || err.message);
  return fail(res, err.status || 500, err.message || 'Internal Server Error');
}

function notFound(req, res) {
  return fail(res, 404, `Route not found: ${req.method} ${req.path}`);
}

module.exports = { errorHandler, notFound };
