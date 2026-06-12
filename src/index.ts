// ============================================================
// FWG Edge Worker — Production Grade
// Fixes: template literal secret, HTTP-5xx fallback,
//        per-type cacheTtl, cacheKey safety, retry logic,
//        Range passthrough, health endpoint, request tracing
// ============================================================

export interface Env {
  PRIMARY_ORIGIN: string;
  SECONDARY_ORIGIN: string;
  FWG_API_SECRET: string;
}

// ─── TTL constants ───────────────────────────────────────────
const CACHE_TTL_VIDEO  = 31_536_000; // 1 year  — .ts / .m4s
const CACHE_TTL_STATIC =     86_400; // 1 day   — default assets
const CACHE_TTL_SHORT  =      3_600; // 1 hour  — everything else

// ─── Helpers ─────────────────────────────────────────────────

function isVideoSegment(pathname: string): boolean {
  return pathname.endsWith(".ts") || pathname.endsWith(".m4s");
}

function isManifest(pathname: string): boolean {
  return pathname.endsWith(".m3u8") || pathname.endsWith(".mpd");
}

/**
 * Resolve the correct cache TTL based on the request path.
 */
function resolveCacheTtl(pathname: string): number {
  if (isVideoSegment(pathname)) return CACHE_TTL_VIDEO;
  if (isManifest(pathname))     return 0; // never cache manifests at origin
  return CACHE_TTL_STATIC;
}

/**
 * Build a normalised, method-safe cache key.
 * Only GET / HEAD requests are cacheable; strip auth headers
 * so they never become part of the key.
 */
function buildCacheKey(request: Request): Request {
  const url = new URL(request.url);
  // Normalise: lowercase pathname, drop unstable query params if needed
  const key = new URL(url.pathname.toLowerCase() + url.search, url.origin);
  return new Request(key.toString(), { method: "GET" });
}

/**
 * Generate a short request-ID for tracing across logs.
 */
function requestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// ─── Origin fetch ─────────────────────────────────────────────

async function fetchFromOrigin(
  request: Request,
  env: Env,
  origin: string,
  cacheTtl: number,
  rid: string
): Promise<Response> {
  const incoming = new URL(request.url);
  const target   = new URL(incoming.pathname + incoming.search, origin);

  const headers = new Headers(request.headers);

  // ✅ FIX #1 — was "Bearer ${env.FWG_API_SECRET}" (plain string)
  if (env.FWG_API_SECRET) {
    headers.set("Authorization", `Bearer ${env.FWG_API_SECRET}`);
  }

  headers.set("X-Forwarded-Proto", "https");
  headers.set("X-Request-ID",      rid);
  headers.delete("host"); // let fetch set the correct Host header

  const proxyRequest = new Request(target.toString(), {
    method:  request.method,
    headers,
    // Stream the body through for POST/PUT (not typical for media, but correct)
    body:    ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "follow",
  });

  return fetch(proxyRequest, {
    cf: {
      cacheEverything: cacheTtl > 0,
      cacheTtl:        cacheTtl > 0 ? cacheTtl : undefined,
      // Lossy polish only makes sense for images, not video segments
      polish:          isVideoSegment(incoming.pathname.toLowerCase()) ? "off" : "lossy",
      mirage:          true,
    },
  });
}

// ─── Fallback logic ───────────────────────────────────────────

/**
 * Try PRIMARY, fall back to SECONDARY on:
 *   • network error (exception)          ← was already handled
 *   • HTTP 5xx from origin               ← ✅ FIX #2 — was missing
 */
async function fetchWithFallback(
  request: Request,
  env: Env,
  cacheTtl: number,
  rid: string
): Promise<Response> {
  let response: Response;

  // ── Primary ──────────────────────────────────────────────
  try {
    response = await fetchFromOrigin(request, env, env.PRIMARY_ORIGIN, cacheTtl, rid);

    // ✅ FIX #2 — fall through to secondary on upstream server errors
    if (response.status >= 500) {
      console.warn(`[${rid}] Primary returned ${response.status}, trying secondary`);
      throw new Error(`Primary HTTP ${response.status}`);
    }

    return response;
  } catch (err) {
    console.warn(`[${rid}] Primary failed: ${(err as Error).message}`);
  }

  // ── Secondary ─────────────────────────────────────────────
  try {
    response = await fetchFromOrigin(request, env, env.SECONDARY_ORIGIN, cacheTtl, rid);

    if (response.status >= 500) {
      throw new Error(`Secondary HTTP ${response.status}`);
    }

    return response;
  } catch (err) {
    console.error(`[${rid}] Secondary failed: ${(err as Error).message}`);
    throw new Error("all_origins_down");
  }
}

// ─── Security headers ─────────────────────────────────────────

/**
 * Merge security headers onto the response.
 * Does NOT overwrite a more-restrictive ACAO from the origin.
 */
function applySecurityHeaders(response: Response, rid: string): Response {
  const headers = new Headers(response.headers);

  // Only set wildcard CORS if origin didn't already set a stricter value
  if (!headers.has("Access-Control-Allow-Origin")) {
    headers.set("Access-Control-Allow-Origin", "*");
  }

  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  headers.set("X-Content-Type-Options",    "nosniff");
  headers.set("Referrer-Policy",           "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options",           "DENY");
  headers.set("X-Request-ID",              rid);

  return new Response(response.body, {
    status:     response.status,
    statusText: response.statusText,
    headers,
  });
}

// ─── Cache-Control per content type ──────────────────────────

function applyCacheControl(headers: Headers, pathname: string): void {
  if (isManifest(pathname)) {
    // Manifests must always be fresh — never cache
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Pragma", "no-cache");
  } else if (isVideoSegment(pathname)) {
    // Segments are immutable — aggressive caching
    headers.set("Cache-Control", `public, max-age=${CACHE_TTL_VIDEO}, immutable`);
  } else {
    headers.set("Cache-Control", `public, max-age=${CACHE_TTL_SHORT}`);
  }
}

// ─── Main handler ─────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {

    const rid      = requestId();
    const url      = new URL(request.url);
    const pathname = url.pathname.toLowerCase();

    // ── Health check ────────────────────────────────────────
    if (pathname === "/health" || pathname === "/_fwg/health") {
      return new Response(
        JSON.stringify({ status: "ok", rid, ts: Date.now() }),
        {
          headers: {
            "Content-Type":  "application/json",
            "Cache-Control": "no-store",
            "X-Request-ID":  rid,
          },
        }
      );
    }

    // ── CORS preflight ──────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin":  "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Range, Authorization",
          "Access-Control-Max-Age":       "86400",
          "X-Request-ID":                 rid,
        },
      });
    }

    // ── Only GET / HEAD supported downstream ───────────────
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD, OPTIONS" },
      });
    }

    // ── Worker-level cache (video segments only) ────────────
    const cache    = caches.default;
    const cacheKey = buildCacheKey(request);
    const cacheTtl = resolveCacheTtl(pathname); // ✅ FIX #3

    if (isVideoSegment(pathname)) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const h = new Headers(cached.headers);
        h.set("X-Cache",      "HIT");
        h.set("X-Request-ID", rid);
        return new Response(cached.body, {
          status:  cached.status,
          headers: h,
        });
      }
    }

    // ── Fetch from origin(s) ────────────────────────────────
    let originResponse: Response;

    try {
      originResponse = await fetchWithFallback(request, env, cacheTtl, rid);
    } catch {
      return new Response(
        JSON.stringify({ error: "FWG Edge: all origins unavailable", rid }),
        {
          status:  503,
          headers: {
            "Content-Type":  "application/json",
            "Retry-After":   "30",
            "X-Request-ID":  rid,
          },
        }
      );
    }

    // ── Build final response with correct Cache-Control ─────
    const headers = new Headers(originResponse.headers);
    applyCacheControl(headers, pathname);
    headers.set("X-Cache",      "MISS");
    headers.set("X-Request-ID", rid);

    const finalResponse = new Response(originResponse.body, {
      status:     originResponse.status,
      statusText: originResponse.statusText,
      headers,
    });

    // ── Store segments in Worker cache ──────────────────────
    if (isVideoSegment(pathname) && originResponse.ok) {
      ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
    }

    return applySecurityHeaders(finalResponse, rid);
  },
};
