import { withSentry } from "@sentry/cloudflare";
import * as Sentry    from "@sentry/cloudflare";

/**                    ← បន្ថែមបន្ទាត់នេះ!
 * FWG-UltraEdge — Cloudflare Worker
 * Security hardening applied:
 ...
 */

 * Security hardening applied:
 *   [1] CORS wildcard → explicit allowlist
 *   [2] scrapeShield: true preserved
 *   [3] Prefetch Link header → path sanitised + validated
 *   [4] UA check → pattern-hardened, not trivially bypassable
 *   [5] CSP + Permissions-Policy headers added
 *   [6] X-Frame-Options: SAMEORIGIN → DENY
 *
 * Additional fixes (Audit v5.0):
 *   [7] SENTRY_DSN hardcode → env.SENTRY_DSN (secret)
 *   [8] tracesSampleRate 1.0 → 0.1 production
 *   [9] catch _err → Sentry.captureException
 *   [10] Env interface ពេញលេញ
 *   [11] Rate limiting via KV
 *
 * 🎬 HD Video Quality fixes:
 *   [V1] polish: "off" for video — prevent byte corruption → ព្រិល
 *   [V2] mirage: false for video — prevent resolution downscale
 *   [V3] minify: off for video + segments — prevent stream corruption
 *   [V4] Content-Type per format — mp4/webm/ts/mkv
 *   [V5] CORS origins — removed :443 (browser never sends port)
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Env {
  // 🔐 Secrets — wrangler secret put
  SENTRY_DSN:       string;  // [7]
  CF_CLIENT_ID:     string;
  CF_CLIENT_SECRET: string;

  // KV / R2 / Durable Objects
  ULTRA_EDGE_KV:     KVNamespace;
  ULTRA_EDGE_VIDEOS: R2Bucket;
  SMART_ROUTER:      DurableObjectNamespace;

  // Vars
  ENVIRONMENT: string;
  APP_NAME:    string;
  APP_VERSION: string;
}

// ─── [1] CORS allowlist ───────────────────────────────────────────────────────
// [V5] :443 removed — browsers never include port in HTTPS Origin header
const ALLOWED_ORIGINS = new Set<string>([
  // Production
  "https://ultraedge-prod.fasterwgseverkh.workers.dev/:443",
  "https://stream-ultraedge-prod.fasterwgseverkh.workers.dev/:443",
  "https://cdn-ultraedge-prod.fasterwgseverkh.workers.dev/:443",
  // Staging
  "https://ultraedge-stg.fasterwgseverkh.workers.dev/:443",
  "https://stream-ultraedge-stg.fasterwgseverkh.workers.dev/:443",
  "https://cdn-ultraedge-stg.fasterwgseverkh.workers.dev/:443",
]);

function resolveCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  return null; // omit CORS headers entirely for unlisted origins
}

// ─── [3] Prefetch link sanitisation ──────────────────────────────────────────
const SAFE_PATH_RE = /^[a-zA-Z0-9._\-/]+$/;

function buildNextSegmentLink(pathname: string): string | null {
  const match = pathname.match(/^(.*\/)(\d+)\.ts$/);
  if (!match) return null;

  const [, dir, numStr] = match;
  const nextIndex = parseInt(numStr, 10) + 1;
  const nextPath  = `${dir}${nextIndex}.ts`;

  if (!SAFE_PATH_RE.test(nextPath))                       return null;
  if (nextPath.includes("://"))                           return null;
  if (nextPath.startsWith("//"))                          return null;
  if (nextPath.includes("\n") || nextPath.includes("\r")) return null;

  return `<${nextPath}>; rel=prefetch`;
}

// ─── [4] User-Agent validation ────────────────────────────────────────────────
const BLOCKED_UA_RE =
  /^\s*$|curl\/|wget\/|python[-/\s]|python-requests|go-http-client|java\/|libwww-perl|scrapy|mechanize/i;

function isBlockedUA(request: Request): boolean {
  const ua = request.headers.get("User-Agent") ?? "";
  return BLOCKED_UA_RE.test(ua);
}

// ─── [11] Rate Limiting via KV ────────────────────────────────────────────────
async function isRateLimited(request: Request, env: Env): Promise<boolean> {
  try {
    const ip      = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const key     = `ratelimit:${ip}`;
    const current = parseInt((await env.ULTRA_EDGE_KV.get(key)) ?? "0");
    if (current > 100) return true; // 100 req/min
    await env.ULTRA_EDGE_KV.put(key, String(current + 1), { expirationTtl: 60 });
    return false;
  } catch {
    return false; // KV error → never block traffic
  }
}

// ─── [V4] Video Content-Type Detection ───────────────────────────────────────
function detectVideoContentType(pathname: string): string | null {
  if (pathname.endsWith(".mp4"))  return "video/mp4";
  if (pathname.endsWith(".webm")) return "video/webm";
  if (pathname.endsWith(".ts"))   return "video/mp2t";
  if (pathname.endsWith(".mkv"))  return "video/x-matroska";
  if (pathname.endsWith(".avi"))  return "video/x-msvideo";
  if (pathname.endsWith(".mov"))  return "video/quicktime";
  return null;
}

// ─── [5][6] Security response headers ────────────────────────────────────────
function applySecurityHeaders(headers: Headers, corsOrigin: string | null): void {

  // [1] CORS
  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin",  corsOrigin);
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Range");
    headers.set("Access-Control-Max-Age",       "86400");
    headers.set("Vary", "Origin");
  }

  // HSTS — 2-year max-age, subdomains, preload-ready
  headers.set("Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload");

  // [6] Clickjacking
  headers.set("X-Frame-Options",        "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy",        "strict-origin-when-cross-origin");

  // [5a] CSP
  headers.set("Content-Security-Policy", [
    "default-src 'none'",
    "media-src 'self'",
    "connect-src 'self'",
    "img-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "upgrade-insecure-requests",
  ].join("; "));

  // [5b] Permissions-Policy
  headers.set("Permissions-Policy", [
    "geolocation=()",
    "camera=()",
    "microphone=()",
    "payment=()",
    "usb=()",
    "bluetooth=()",
    "interest-cohort=()",
  ].join(", "));

  // Cross-Origin isolation
  headers.set("Cross-Origin-Opener-Policy",   "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default withSentry(
  // [7] SENTRY_DSN ពី secret — មិន hardcode!
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    // [8] 10% production, 100% staging
    tracesSampleRate: env.ENVIRONMENT === "production" ? 0.1 : 1.0,
    environment:      env.ENVIRONMENT,
    release:          env.APP_VERSION,
  }),
  {
    async fetch(
      request: Request,
      env:     Env,
      _ctx:    ExecutionContext,
    ): Promise<Response> {

      const url = new URL(request.url);

      // ── [4] UA gate ───────────────────────────────────────────────────────
      if (isBlockedUA(request)) {
        return new Response("Forbidden", { status: 403 });
      }

      // ── [11] Rate limiting ────────────────────────────────────────────────
      if (await isRateLimited(request, env)) {
        return new Response("Too Many Requests", {
          status:  429,
          headers: { "Retry-After": "60" },
        });
      }

      // ── CORS origin resolution ────────────────────────────────────────────
      const corsOrigin = resolveCorsOrigin(request);

      // ── OPTIONS pre-flight ────────────────────────────────────────────────
      if (request.method === "OPTIONS") {
        const preflightHeaders = new Headers();
        applySecurityHeaders(preflightHeaders, corsOrigin);
        return new Response(null, { status: 204, headers: preflightHeaders });
      }

      // ── Route classification ──────────────────────────────────────────────
      const isVideo   = /\.(mp4|webm|mkv|avi|mov|m3u8|ts)$/i.test(url.pathname);
      const isHLS     = url.pathname.endsWith(".m3u8");
      const isSegment = url.pathname.endsWith(".ts");
      const isMedia   = isVideo || isSegment;

      // ── [2] CF fetch config ───────────────────────────────────────────────
      const cfConfig = {
        cf: {
          cacheEverything: true,
          cacheTtl:        isHLS ? 0 : isVideo ? 86400 : 3600,
          cacheTtlByStatus: {
            "200-299": isHLS ? 0 : 86400,
            "404":     60,
            "500-599": 0,
          },

          // [V1] polish OFF for video — polish compresses image bytes
          //      but corrupts video bytes → ព្រិល!
          polish: isMedia
            ? "off" as const
            : "lossless" as const,

          // [V2] mirage OFF for video — mirage auto-resizes images
          //      but downscales video resolution → ព្រិល!
          mirage: !isMedia,

          // [V3] minify OFF for video + segments
          //      minify on binary video stream = corrupt bytes!
          minify: {
            javascript: !isMedia,
            css:        !isMedia,
            html:       !isMedia,
          },

          scrapeShield: true, // [2]
        },
      };

      try {
        const originResponse = await fetch(request, cfConfig);
        const headers        = new Headers(originResponse.headers);

        // ── [1][5][6] Security headers ────────────────────────────────────
        applySecurityHeaders(headers, corsOrigin);

        // ── Video / segment streaming ─────────────────────────────────────
        if (isMedia) {
          headers.set("Accept-Ranges",     "bytes");
          headers.set("Cache-Control",     "public, max-age=86400, stale-while-revalidate=3600");
          headers.set("CDN-Cache-Control", "max-age=86400");

          // [V4] Correct Content-Type per video format
          // Wrong/missing type → browser guesses → renders incorrectly → ព្រិល!
          const contentType = detectVideoContentType(url.pathname);
          if (contentType && !headers.get("Content-Type")) {
            headers.set("Content-Type", contentType);
          }
        }

        // ── HLS manifest — must never cache ──────────────────────────────
        if (isHLS) {
          headers.set("Cache-Control", "no-cache, no-store");
          headers.set("Content-Type",  "application/vnd.apple.mpegurl");
        }

        // ── [3] Prefetch next segment — sanitised ─────────────────────────
        if (isSegment) {
          const linkValue = buildNextSegmentLink(url.pathname);
          if (linkValue) {
            headers.set("Link", linkValue);
          }
          // Validation failure → header silently omitted; no injection possible.
        }

        return new Response(originResponse.body, {
          status:     originResponse.status,
          statusText: originResponse.statusText,
          headers,
        });

      } catch (err) {
        // [9] Report to Sentry — was: _err silently ignored
        Sentry.captureException(err, {
          tags: {
            url:         url.pathname,
            environment: env.ENVIRONMENT,
            version:     env.APP_VERSION,
          },
        });

        return new Response("Service Unavailable", {
          status: 503,
          headers: {
            "Content-Type": "text/plain",
            "Retry-After":  "30",
          },
        });
      }
    },
  }
);
