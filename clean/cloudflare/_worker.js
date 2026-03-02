/**
 * Cloudflare Pages Worker — _worker.js
 *
 * Place this file at the ROOT of your Cloudflare Pages project (same folder as index.html).
 * It does two things:
 *   1. Intercepts /api/* requests and proxies them to Railway (adding the API key)
 *   2. Serves the HTML file for all other routes (SPA fallback)
 *
 * Environment variables to set in Cloudflare Pages dashboard → Settings → Environment:
 *   RAILWAY_API_URL  = https://cleanndc.up.railway.app/api
 *   API_SECRET_KEY   = a3f8c2e1d4b7e9f0c6a2d8e4f1b3c7a9e2d5f8b1c4a7e0d3f6b9c2a5e8d1f4
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── Proxy /api/* → Railway ────────────────────────────────────────────────
    if (url.pathname.startsWith('/api/')) {
      const railwayUrl = (env.RAILWAY_API_URL || 'https://cleanndc.up.railway.app/api')
        .replace(/\/$/, '');

      // Strip the /api prefix because Railway already has /api in the URL
      // e.g. CF /api/assets → Railway https://...railway.app/api/assets
      const targetPath = url.pathname; // keep /api/assets
      const targetUrl  = railwayUrl.replace(/\/api$/, '') + targetPath + (url.search || '');

      const proxyReq = new Request(targetUrl, {
        method:  request.method,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':    env.API_SECRET_KEY || '',
          // Forward user role/name headers if sent by frontend
          'x-user-role':  request.headers.get('x-user-role') || 'Admin',
          'x-user-name':  request.headers.get('x-user-name') || 'System',
        },
        body: ['GET','HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
      });

      const railwayRes = await fetch(proxyReq);

      // Add CORS headers to the response
      const headers = new Headers(railwayRes.headers);
      headers.set('Access-Control-Allow-Origin',  '*');
      headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type,x-api-key,x-user-role,x-user-name');

      return new Response(railwayRes.body, {
        status:  railwayRes.status,
        headers,
      });
    }

    // ── Handle CORS preflight ─────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,x-api-key,x-user-role,x-user-name',
        },
      });
    }

    // ── Serve static assets (JS, CSS, fonts etc.) ────────────────────────────
    // Cloudflare Pages handles static files automatically.
    // This fetch() call falls through to the Pages static asset serving.
    return env.ASSETS.fetch(request);
  },
};
