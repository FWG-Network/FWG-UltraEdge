// FWG-UltraEdge 🌍⚡ — Caching Handler
// 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
// Fixes:
//   [FIX-9]  Error → Sentry report + proper status
//   [FIX-10] cacheEverything → GET only

import * as Sentry from "@sentry/cloudflare";

export default {
  async fetch(request, env, ctx) {

    // [FIX-10] Cache GET requests only
    // POST/PUT/DELETE must never be cached
    const cf = {
      cf: {
        cacheEverything: request.method === "GET",
        cacheTtl:        request.method === "GET" ? 3600 : 0,
        minify: {
          javascript: true,
          css:        true,
          html:       true,
        },
      },
    };

    try {
      const response = await fetch(request.url, cf);
      return new Response(response.body, response);

    } catch (err) {
      // [FIX-9] Report to Sentry + proper 503
      Sentry.captureException(err, {
        tags: {
          handler:     "Caching",
          url:         request.url,
          method:      request.method,
          environment: env?.ENVIRONMENT ?? "unknown",
        },
      });

      return new Response("Service Unavailable", {
        status:  503,
        headers: { "Retry-After": "30" },
      });
    }
  },
};
