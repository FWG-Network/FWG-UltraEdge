/// <reference types="@cloudflare/workers-types" />

interface Env {
  ENVIRONMENT?: string;
  APP_VERSION?: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":   "*",
  "X-Powered-By":                  "FWG-UltraEdge 🌍⚡",
  "X-Frame-Options":               "SAMEORIGIN",
  "X-Content-Type-Options":        "nosniff",
  "X-XSS-Protection":              "1; mode=block",
  "Referrer-Policy":               "strict-origin-when-cross-origin",
  "Strict-Transport-Security":     "max-age=31536000; includeSubDomains; preload",
  "Permissions-Policy":            "camera=(), microphone=(), geolocation=()",
};

function getCacheTtl(contentType: string, pathname: string): number {
  const isVideo = contentType.includes("video") ||
    /\.(mp4|webm|m3u8|ts|mkv|avi)$/i.test(pathname);
  const isImage = contentType.includes("image") ||
    /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(pathname);
  const isFont  = contentType.includes("font") ||
    /\.(woff|woff2|ttf|eot)$/i.test(pathname);
  const isStatic = /\.(js|css)$/i.test(pathname);

  if (isVideo)  return 31_536_000; // 1 year
  if (isFont)   return 31_536_000; // 1 year
  if (isImage)  return 2_592_000;  // 30 days
  if (isStatic) return 86_400;     // 1 day
  return 3_600;                    // 1 hour default
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url   = new URL(request.url);
    const start = Date.now();

    // ── CORS preflight ──
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin":  "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age":       "86400",
        },
      });
    }

    // ── Health check ──
    if (url.pathname === "/health") {
      return Response.json({
        status:      "ok",
        timestamp:   Date.now(),
        version:     env.APP_VERSION ?? "3.0.0",
        environment: env.ENVIRONMENT ?? "production",
      }, {
        headers: {
          "Cache-Control":    "no-store, no-cache",
          "X-Powered-By":     "FWG-UltraEdge 🌍⚡",
        },
      });
    }

    try {
      const contentType = "";
      const cacheTtl    = getCacheTtl(contentType, url.pathname);

      const response = await fetch(request.url, {
        cf: {
          cacheEverything: true,
          cacheTtl,
          minify: {
            javascript: true,
            css:        true,
            html:       true,
          },
        },
      } as RequestInit);

      const headers = new Headers(response.headers);

      // Apply security headers
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
        headers.set(k, v);
      }

      // Smart cache headers
      const resContentType = response.headers.get("content-type") ?? "";
      const ttl = getCacheTtl(resContentType, url.pathname);
      headers.set("Cache-Control",    `public, max-age=${ttl}`);
      headers.set("X-Cache-Status",   "MISS");
      headers.set("X-Response-Time",  `${Date.now() - start}ms`);
      headers.set("X-App-Version",    env.APP_VERSION   ?? "3.0.0");
      headers.set("X-Environment",    env.ENVIRONMENT   ?? "production");

      return new Response(response.body, {
        status:     response.status,
        statusText: response.statusText,
        headers,
      });

    } catch (_err) {
      return Response.json({
        error:     "Worker Error",
        app:       "FWG-UltraEdge 🌍⚡",
        timestamp: new Date().toISOString(),
      }, {
        status:  500,
        headers: SECURITY_HEADERS,
      });
    }
  },
} satisfies ExportedHandler<Env>;
