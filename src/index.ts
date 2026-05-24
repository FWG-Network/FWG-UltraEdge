/**
 * FWG-UltraEdge — Cloudflare Worker
 * ============================================================
 * 🔐 SECURITY HARDENED — FWG White-Hat Audit v4.0
 * Fixes:
 *   [FIX-1] SENTRY_DSN hardcode → env.SENTRY_DSN (secret)
 *   [FIX-2] tracesSampleRate 1.0 → 0.1 នៅ production
 *   [FIX-3] catch block → Sentry.captureException
 *   [FIX-4] Env interface ពេញលេញ
 *   [FIX-5] CORS allowlist — explicit origins
 *   [FIX-6] UA blocking — hardened regex
 *   [FIX-7] Path sanitisation — CRLF injection prevention
 *   [FIX-8] Security headers ពេញលេញ
 *   [FIX-9] Rate limiting via KV
 * ============================================================
 */

import { withSentry } from "@sentry/cloudflare";
import * as Sentry from "@sentry/cloudflare";

// ─── Env Interface ────────────────────────────────────────────────────────────
// Bindings ទាំងអស់ត្រូវប្រកាសនៅទីនេះ
export interface Env {
  // 🔐 Secrets (wrangler secret put)
  SENTRY_DSN:        string;
  CF_CLIENT_ID:      string;
  CF_CLIENT_SECRET:  string;

  // KV / R2 / Durable Objects
  ULTRA_EDGE_KV:     KVNamespace;
  ULTRA_EDGE_VIDEOS: R2Bucket;
  SMART_ROUTER:      DurableObjectNamespace;

  // Vars (wrangler.toml [vars])
  ENVIRONMENT:  string;
  APP_NAME:     string;
  APP_VERSION:  string;
}

// ─── [FIX-5] CORS Allowlist ───────────────────────────────────────────────────
// ប្រើ explicit origins — កុំ "*" ឡើយ!
const ALLOWED_ORIGINS = new Set<string>([
  "https://ultraedge-prod.fasterwgseverkh.workers.dev",
  "https://ultraedge-stg.fasterwgseverkh.workers.dev",
  // បន្ថែម custom domain នៅទីនេះ បើមាន
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

  if (!SAFE_PATH_RE.test(nextPath))                        return null;
  if (nextPath.includes("://"))                            return null;
  if (nextPath.startsWith("//"))                           return null;
  if (nextPath.includes("\n") || nextPath.includes("\r"))  return null;

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
    const ip  = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const key = `ratelimit:${ip}`;
    const current = parseInt((await env.ULTRA_EDGE_KV.get(key)) ?? "0");
    if (current > 100) return true; // 100 req/min
    await env.ULTRA_EDGE_KV.put(key, String(current + 1), {
      expirationTtl: 60,
    });
    return false;
  } catch {
    // បើ KV error → មិន block traffic
    return false;
  }
}

// ─── [FIX-8] Security Headers ────────────────────────────────────────────────
function applySecurityHeaders(headers: Headers, corsOrigin: string | null): void {

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
  headers.set("X-Frame-Options", "DENY");

  // MIME sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // Referrer
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

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
  // [FIX-1] SENTRY_DSN ពី secret — មិន hardcode!
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    // [FIX-2] tracesSampleRate — 10% production, 100% staging
    tracesSampleRate: env.ENVIRONMENT === "production" ? 0.1 : 1.0,
    environment: env.ENVIRONMENT,
    release: env.APP_VERSION,
  }),
  {
    async fetch(
      request: Request,
      env: Env,
      _ctx: ExecutionContext,
    ): Promise<Response> {

      const url = new URL(request.url);

      // ── [FIX-6] UA Gate ───────────────────────────────────────────────────
      if (isBlockedUA(request)) {
        return new Response("Forbidden", { status: 403 });
      }

      // ── [FIX-9] Rate Limiting ─────────────────────────────────────────────
      if (await isRateLimited(request, env)) {
        return new Response("Too Many Requests", {
          status: 429,
          headers: { "Retry-After": "60" },
        });
      }

      // ── CORS Origin Resolution ────────────────────────────────────────────
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
          polish:  "lossless" as const,
          mirage:  true,
          minify: {
            javascript: !isVideo,
            css:        !isVideo,
            html:       !isVideo,
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
        }

        // ── HLS Manifest — No Cache ───────────────────────────────────────
        if (isHLS) {
          headers.set("Cache-Control", "no-cache, no-store");
          headers.set("Content-Type",  "application/vnd.apple.mpegurl");
        }

        // ── Prefetch Next Segment ─────────────────────────────────────────
        if (isSegment) {
          const linkValue = buildNextSegmentLink(url.pathname);
          if (linkValue) {
            headers.set("Link", linkValue);
          }
        }

        return new Response(originResponse.body, {
          status:     originResponse.status,
          statusText: originResponse.statusText,
          headers,
        });

      } catch (err) {
        // [FIX-3] Report ទៅ Sentry ជាប្រចាំ
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
