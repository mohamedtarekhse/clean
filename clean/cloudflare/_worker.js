/**
 * _worker.js — Cloudflare Pages Worker
 *
 * Proxies /api/* to Railway and injects the API key server-side.
 * The key is NEVER exposed to the browser.
 *
 * Secrets to set (via dashboard or wrangler):
 *   RAILWAY_API_URL = https://cleanndc.up.railway.app
 *   API_SECRET_KEY  = a3f8c2e1d4b7e9f0c6a2d8e4f1b3c7a9e2d5f8b1c4a7e0d3f6b9c2a5e8d1f4
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── CORS preflight ────────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    // ── Proxy all /api/* requests to Railway ──────────────────────────────────
    if (url.pathname.startsWith('/api/')) {
      const base   = (env.RAILWAY_API_URL || 'https://cleanndc.up.railway.app').replace(/\/$/, '');
      const target = base + url.pathname + (url.search || '');

      const proxyReq = new Request(target, {
        method:  request.method,
        headers: {
          'Content-Type':  'application/json',
          'x-api-key':     env.API_SECRET_KEY || '',
          'x-user-role':   request.headers.get('x-user-role') || 'Admin',
          'x-user-name':   request.headers.get('x-user-name') || 'System',
        },
        body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
      });

      try {
        const resp = await fetch(proxyReq);
        return corsResponse(resp.body, resp.status, resp.headers.get('content-type'));
      } catch (err) {
        return corsResponse(
          JSON.stringify({ success: false, error: 'Proxy error: ' + err.message }),
          502,
          'application/json'
        );
      }
    }

    // ── Everything else → Cloudflare Pages static assets ─────────────────────
    return env.ASSETS.fetch(request);
  },
};

// ── Helper: return a response with CORS headers ───────────────────────────────
function corsResponse(body, status = 200, contentType = 'application/json') {
  return new Response(body, {
    status,
    headers: {
      'Content-Type':                contentType || 'application/json',
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,x-api-key,x-user-role,x-user-name',
    },
  });
}
