/**
 * FWG-UltraEdge — Cloudflare Worker
 * ============================================================
 * 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
 * 🎬 VIDEO QUALITY — HD Resolution Fix
 * Fixes:
 *   [FIX-1]  SENTRY_DSN → env.SENTRY_DSN (secret)
 *   [FIX-2]  tracesSampleRate → 0.1 production
 *   [FIX-3]  catch → Sentry.captureException
 *   [FIX-4]  Env interface ពេញលេញ
 *   [FIX-5]  CORS — :443 removed from origins
 *   [FIX-6]  UA blocking hardened
 *   [FIX-7]  Path sanitisation
 *   [FIX-8]  Security headers
 *   [FIX-9]  Rate limiting via KV
 *   [FIX-10] polish: "off" for video — prevent quality loss
 *   [FIX-11] mirage: false for video — prevent resize
 *   [FIX-12] minify: off for video + segments
 *   [FIX-13] Content-Type headers for video formats
 * ============================================================
 */

import { withSentry } from "@sentry/cloudflare";
import * as Sentry    from "@sentry/cloudflare";

// ─── Env Interface ────────────────────────────────────────────────────────────
export interface Env {
  // 🔐 Secrets (wrangler secret put)
  SENTRY_DSN:       string;
  CF_CLIENT_ID:     string;
  CF_CLIENT_SECRET: string;

  // KV / R2 / Durable Objects
  ULTRA_EDGE_KV:     KVNamespace;
  ULTRA_EDGE_VIDEOS: R2Bucket;
  SMART_ROUTER:      DurableObjectNamespace;

  // Vars (wrangler.toml [vars])
  ENVIRONMENT: string;
  APP_NAME:    string;
  APP_VERSION: string;
}

// ─── [FIX-5] CORS Allowlist ───────────────────────────────────────────────────
// [FIX-5] :443 removed — browsers never include port in HTTPS Origin header
const ALLOWED_ORIGINS = new Set<string>([
  "https://ultraedge-prod.fasterwgseverkh.workers.dev",
  "https://ultraedge-stg.fasterwgseverkh.workers.dev",
  // "https://fwg.yourdomain.com",
]);

function resolveCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  return null;
}

// ─── [FIX-7] Prefetch Link Sanitisation ──────────────────────────────────────
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

// ─── [FIX-6] UA Blocking ─────────────────────────────────────────────────────
const BLOCKED_UA_RE =
  /^\s*$|curl\/|wget\/|python[-/\s]|python-requests|go-http-client|java\/|libwww-perl|scrapy|mechanize/i;

function isBlockedUA(request: Request): boolean {
  const ua = request.headers.get("User-Agent") ?? "";
  return BLOCKED_UA_RE.test(ua);
}

// ─── [FIX-9] Rate Limiting via KV ────────────────────────────────────────────
async function isRateLimited(request: Request, env: Env): Promise<boolean> {
  try {
    const ip      = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const key     = `ratelimit:${ip}`;
    const current = parseInt((await env.ULTRA_EDGE_KV.get(key)) ?? "0");
    if (current > 100) return true;
    await env.ULTRA_EDGE_KV.put(key, String(current + 1), {
      expirationTtl: 60,
    });
    return false;
  } catch {
    return false;
  }
}

// ─── [FIX-13] Video Content-Type Detection ───────────────────────────────────
function detectVideoContentType(pathname: string): string | null {
  if (pathname.endsWith(".mp4"))  return "video/mp4";
  if (pathname.endsWith(".webm")) return "video/webm";
  if (pathname.endsWith(".ts"))   return "video/mp2t";
  if (pathname.endsWith(".mkv"))  return "video/x-matroska";
  if (pathname.endsWith(".avi"))  return "video/x-msvideo";
  if (pathname.endsWith(".mov"))  return "video/quicktime";
  return null;
}

// ─── [FIX-8] Security Headers ────────────────────────────────────────────────
function applySecurityHeaders(
  headers:    Headers,
  corsOrigin: string | null
): void {
  // CORS
  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin",  corsOrigin);
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Range");
    headers.set("Access-Control-Max-Age",       "86400");
    headers.set("Vary", "Origin");
  }

  // HSTS — 2 ឆ្នាំ
  headers.set("Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload");

  // Clickjacking
  headers.set("X-Frame-Options",        "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy",        "strict-origin-when-cross-origin");

  // CSP
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

  // Permissions Policy
  headers.set("Permissions-Policy", [
    "geolocation=()",
    "camera=()",
    "microphone=()",
    "payment=()",
    "usb=()",
    "bluetooth=()",
    "interest-cohort=()",
  ].join(", "));

  // Cross-Origin Isolation
  headers.set("Cross-Origin-Opener-Policy",   "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default withSentry(
  (env: Env) => ({
    dsn:              env.SENTRY_DSN,
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

      // ── UA Gate ───────────────────────────────────────────────────────────
      if (isBlockedUA(request)) {
        return new Response("Forbidden", { status: 403 });
      }

      // ── Rate Limiting ─────────────────────────────────────────────────────
      if (await isRateLimited(request, env)) {
        return new Response("Too Many Requests", {
          status:  429,
          headers: { "Retry-After": "60" },
        });
      }

      // ── CORS ──────────────────────────────────────────────────────────────
      const corsOrigin = resolveCorsOrigin(request);

      // ── OPTIONS Preflight ─────────────────────────────────────────────────
      if (request.method === "OPTIONS") {
        const preflightHeaders = new Headers();
        applySecurityHeaders(preflightHeaders, corsOrigin);
        return new Response(null, { status: 204, headers: preflightHeaders });
      }

      // ── Route Classification ──────────────────────────────────────────────
      const isVideo   = /\.(mp4|webm|mkv|avi|mov|m3u8|ts)$/i.test(url.pathname);
      const isHLS     = url.pathname.endsWith(".m3u8");
      const isSegment = url.pathname.endsWith(".ts");

      // ── CF Fetch Config ───────────────────────────────────────────────────
      const cfConfig = {
        cf: {
          cacheEverything: true,
          cacheTtl:        isHLS ? 0 : isVideo ? 86400 : 3600,
          cacheTtlByStatus: {
            "200-299": isHLS ? 0 : 86400,
            "404":     60,
            "500-599": 0,
          },

          // [FIX-10] polish OFF for video — prevent compression/quality loss
          // polish on video = bytes corrupted = blurry/pixelated!
          polish: isVideo || isSegment
            ? "off" as const
            : "lossless" as const,

          // [FIX-11] mirage OFF for video — prevent lazy load/resize
          // mirage on video = resolution downscaled = blurry!
          mirage: !(isVideo || isSegment),

          // [FIX-12] minify OFF for video + segments
          // minify on video bytes = corrupt stream!
          minify: {
            javascript: !isVideo && !isSegment,
            css:        !isVideo && !isSegment,
            html:       !isVideo && !isSegment,
          },

          scrapeShield: true,
        },
      };

      try {
        const originResponse = await fetch(request, cfConfig);
        const headers        = new Headers(originResponse.headers);

        // ── Security Headers ──────────────────────────────────────────────
        applySecurityHeaders(headers, corsOrigin);

        // ── Video / Segment Streaming ─────────────────────────────────────
        if (isVideo || isSegment) {
          headers.set("Accept-Ranges",     "bytes");
          headers.set("Cache-Control",     "public, max-age=86400, stale-while-revalidate=3600");
          headers.set("CDN-Cache-Control", "max-age=86400");

          // [FIX-13] Set correct Content-Type for each video format
          // Missing Content-Type = browser guesses = quality issues!
          const contentType = detectVideoContentType(url.pathname);
          if (contentType && !headers.get("Content-Type")) {
            headers.set("Content-Type", contentType);
          }
        }

        // ── HLS Manifest — No Cache ───────────────────────────────────────
        if (isHLS) {
          headers.set("Cache-Control", "no-cache, no-store");
          headers.set("Content-Type",  "application/vnd.apple.mpegurl");
        }

        // ── Prefetch Next Segment ─────────────────────────────────────────
        if (isSegment) {
          const linkValue = buildNextSegmentLink(url.pathname);
          if (linkValue) headers.set("Link", linkValue);
        }

        return new Response(originResponse.body, {
          status:     originResponse.status,
          statusText: originResponse.statusText,
          headers,
        });

      } catch (err) {
        Sentry.captureException(err, {
          tags: {
            url:         url.pathname,
            environment: env.ENVIRONMENT,
            version:     env.APP_VERSION,
          },
        });

        return new Response("Service Unavailable", {
          status:  503,
          headers: {
            "Content-Type": "text/plain",
            "Retry-After":  "30",
          },
        });
      }
    },
  }
);
