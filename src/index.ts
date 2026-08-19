// ===========================================================
// FWG Live Stream Edge Worker — Zero-Lag 1080p+
// Optimized for HLS / DASH live & VOD over Cloudflare
// ===========================================================

// NOTE: requires `@cloudflare/workers-types` for KVNamespace / R2Bucket /
// D1Database / DurableObjectNamespace / Ai / AnalyticsEngineDataset types.
// These extra bindings are declared here to stay in sync with wrangler.toml
// even though this file's fetch handler only reads BACKEND_URL / FWG_API_SECRET.
export interface Env {
  // Used directly in this file
  BACKEND_URL: string;
  FWG_API_SECRET: string;

  // Plain vars (wrangler.toml [env.production.vars])
  ENVIRONMENT: string;
  APP_NAME: string;
  APP_VERSION: string;

  // KV — [[env.production.kv_namespaces]]
  ULTRA_EDGE_KV: KVNamespace;

  // R2 — [[env.production.r2_buckets]]
  ULTRA_EDGE_VIDEOS: R2Bucket;

  // D1 — [[env.production.d1_databases]]
  ULTRA_EDGE_DB: D1Database;

  // Durable Object — [[env.production.durable_objects.bindings]]
  SMART_ROUTER: DurableObjectNamespace;

  // Workers AI — [env.production.ai]
  ULTRA_EDGE_AI_TRAFFIC: Ai;

  // Analytics Engine — [[env.production.analytics_engine_datasets]]
  ULTRA_EDGE_TRAFFIC_METRICS: AnalyticsEngineDataset;
}

// ─── TTL ─────────────────────────────────────────────────────
const TTL_SEGMENT   = 31_536_000; // 1 year  — .ts / .m4s  (immutable)
const TTL_KEY_FRAME = 600;        // 10 min  — .vtt / .key / subtitles
const TTL_SHORT     = 5;          // 5 sec   — .m3u8 / .mpd (live playlist)

// ─── Content classification ───────────────────────────────────

type ContentKind = "manifest" | "segment" | "key" | "mp4" | "other";

function classifyPath(pathname: string): ContentKind {
  if (pathname.endsWith(".m3u8") || pathname.endsWith(".mpd"))  return "manifest";
  if (pathname.endsWith(".ts")   || pathname.endsWith(".m4s"))  return "segment";
  if (pathname.endsWith(".key")  || pathname.endsWith(".vtt"))  return "key";
  if (pathname.endsWith(".mp4")  || pathname.endsWith(".webm")) return "mp4";
  return "other";
}

// ─── Cache-Control per content kind ──────────────────────────

function cacheControlHeader(kind: ContentKind): string {
  switch (kind) {
    case "manifest":
      // Live playlists MUST be re-fetched every ~2s by the player
      return "no-cache, no-store, must-revalidate";

    case "segment":
      // Segments are write-once / immutable — cache forever at edge & browser
      return `public, max-age=${TTL_SEGMENT}, immutable`;

    case "key":
      // Encryption keys: cache briefly, don't expose too long
      return `public, max-age=${TTL_KEY_FRAME}`;

    case "mp4":
      // Full MP4 direct play — allow range-based caching, no transform
      return "public, max-age=3600, no-transform";

    default:
      return "public, max-age=60";
  }
}

// ─── Cloudflare cf fetch options per content kind ────────────
// This tells Cloudflare's own edge cache (different from Workers cache) what to do.

function cfOptions(kind: ContentKind): RequestInitCfProperties {
  switch (kind) {
    case "segment":
      return {
        cacheEverything: true,
        cacheTtl:        TTL_SEGMENT,
        polish:          "off",   // never compress video binary
        mirage:          false,
        minify:          { javascript: false, css: false, html: false },
      };

    case "manifest":
      return {
        cacheEverything: true,
        cacheTtl:        TTL_SHORT,   // Cloudflare edge caches for 5s only
        polish:          "off",
        mirage:          false,
      };

    case "mp4":
      return {
        cacheEverything: true,
        cacheTtl:        3600,
        polish:          "off",
        mirage:          false,
      };

    default:
      return {
        cacheEverything: false,
        polish:          "lossy",
        mirage:          true,
      };
  }
}

// ─── Build streaming response headers ────────────────────────

function buildResponseHeaders(
  origin: Headers,
  kind: ContentKind,
  rid: string
): Headers {
  const h = new Headers(origin);

  // CORS — required for HLS.js / video.js / Shaka player in browser
  h.set("Access-Control-Allow-Origin",  "*");
  h.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, X-Request-ID");

  // Byte-range support — critical for video seeking and adaptive bitrate
  h.set("Accept-Ranges", "bytes");

  // Cache policy
  h.set("Cache-Control", cacheControlHeader(kind));

  // Live stream: disable Nginx-style proxy buffering on any upstream
  if (kind === "manifest" || kind === "segment") {
    h.set("X-Accel-Buffering", "no");
  }

  // Security
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Request-ID",           rid);

  // Remove headers that can break streaming
  h.delete("content-encoding"); // don't double-encode
  h.delete("transfer-encoding"); // let Workers handle this

  return h;
}

// ─── Safe cache key (GET-only, no auth headers in key) ───────

function safeCacheKey(request: Request): Request {
  const u = new URL(request.url);
  const normalised = new URL(u.pathname.toLowerCase() + u.search, u.origin);
  return new Request(normalised.toString(), { method: "GET" });
}

// ─── Request ID ───────────────────────────────────────────────

const rid = (): string => crypto.randomUUID().slice(0, 8);

// ─── Main handler ─────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {

    const id       = rid();
    const url      = new URL(request.url);
    const pathname = url.pathname.toLowerCase();
    const kind     = classifyPath(pathname);

    // ── Health check ─────────────────────────────────────────
    if (pathname === "/health" || pathname === "/_fwg/health") {
      return Response.json(
        { status: "ok", rid: id, ts: Date.now(), version: "2.0.0" },
        { headers: { "Cache-Control": "no-store", "X-Request-ID": id } }
      );
    }

    // ── CORS Preflight ───────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin":  "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Range, Authorization",
          "Access-Control-Max-Age":       "86400",
          "X-Request-ID":                 id,
        },
      });
    }

    // ── Reject non-GET/HEAD ──────────────────────────────────
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD, OPTIONS" },
      });
    }

    // ── Worker Cache — serve segments instantly from edge ────
    // Workers Cache API is per-datacenter: viewer in Singapore hits
    // Singapore PoP, not your origin.  This is the main lag killer.
    const cache    = caches.default;
    const cacheKey = safeCacheKey(request);

    if (kind === "segment") {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const h = new Headers(cached.headers);
        h.set("X-Cache",      "HIT");
        h.set("X-Request-ID", id);
        return new Response(cached.body, { status: cached.status, headers: h });
      }
    }

    // ── Build proxy request ──────────────────────────────────
    const backendBase = env.BACKEND_URL || "https://fallback.fwg.internal";
    const targetUrl   = new URL(url.pathname + url.search, backendBase);

    const proxyHeaders = new Headers();

    // Pass through ONLY safe, relevant headers — not cookies, not host
    for (const key of ["range", "if-range", "if-none-match", "if-modified-since", "accept", "accept-encoding", "user-agent"]) {
      const val = request.headers.get(key);
      if (val) proxyHeaders.set(key, val);
    }

    proxyHeaders.set("X-Forwarded-Proto", "https");
    proxyHeaders.set("X-Request-ID",      id);

    if (env.FWG_API_SECRET) {
      proxyHeaders.set("Authorization", `Bearer ${env.FWG_API_SECRET}`);
    }

    const proxyRequest = new Request(targetUrl.toString(), {
      method:  request.method,
      headers: proxyHeaders,
      redirect: "follow",
    });

    // ── Fetch from backend ───────────────────────────────────
    let originResponse: Response;

    try {
      originResponse = await fetch(proxyRequest, { cf: cfOptions(kind) });
    } catch (err) {
      console.error(`[${id}] Backend unreachable: ${(err as Error).message}`);
      return Response.json(
        { error: "FWG Edge: Backend offline or too slow", rid: id },
        {
          status:  504,
          headers: { "Retry-After": "5", "X-Request-ID": id },
        }
      );
    }

    // ── Non-2xx passthrough (don't cache errors) ─────────────
    if (!originResponse.ok && originResponse.status !== 206) {
      return new Response(originResponse.body, {
        status:     originResponse.status,
        statusText: originResponse.statusText,
        headers:    new Headers({
          "Content-Type": originResponse.headers.get("Content-Type") ?? "text/plain",
          "X-Request-ID": id,
          "X-Cache":      "BYPASS",
        }),
      });
    }

    // ── Build final streaming response ───────────────────────
    const responseHeaders = buildResponseHeaders(originResponse.headers, kind, id);
    responseHeaders.set("X-Cache", "MISS");

    const finalResponse = new Response(originResponse.body, {
      status:     originResponse.status,  // preserves 206 Partial Content for Range
      statusText: originResponse.statusText,
      headers:    responseHeaders,
    });

    // ── Store segment in Workers Cache (background) ──────────
    if (kind === "segment" && originResponse.ok) {
      ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
    }

    return finalResponse;
  },
};

// ── Durable Object export ──────────────────────────────────────
// REQUIRED: wrangler.toml binds SMART_ROUTER to this class.
// Without this export, deploy will fail / binding will not resolve.
export { SmartRouter } from "./durable/SmartRouter";
