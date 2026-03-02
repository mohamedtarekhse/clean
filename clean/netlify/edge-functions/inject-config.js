/**
 * Netlify Edge Function: inject-config.js
 * =========================================
 * Injects window.__API_CONFIG__ into every HTML response so the frontend
 * can read the Railway API URL and key from environment variables set in
 * the Netlify dashboard — without hard-coding anything in source files.
 *
 * Netlify Edge Functions run on Deno at the CDN edge.
 *
 * Deploy path: netlify/edge-functions/inject-config.js
 * Configure in netlify.toml:
 *   [[edge_functions]]
 *     function = "inject-config"
 *     path = "/*"
 */

export default async (request, context) => {
  const response = await context.next();

  // Only modify HTML documents
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const apiUrl = Deno.env.get('API_URL')        || '';
  const apiKey = Deno.env.get('API_SECRET_KEY') || '';

  const configScript = `<script>
window.__API_CONFIG__ = {
  baseUrl: "${apiUrl}",
  apiKey:  "${apiKey}"
};
</script>`;

  // Inject before </head>
  const text     = await response.text();
  const modified = text.replace('</head>', `${configScript}\n</head>`);

  return new Response(modified, {
    status:  response.status,
    headers: response.headers,
  });
};
