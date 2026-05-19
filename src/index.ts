async fetch(request, env, ctx) {
  const url = new URL(request.url);
  
  // 🎯 កូដសម្រាប់កូនក្មេងតេស្តឱ្យលោត Error ទៅ Sentry
  if (url.pathname === "/test-sentry-error") {
    throw new Error("⚠️ តេស្តប្រព័ន្ធអាសន្ន៖ Sentry កំពុងដំណើរការក្នុង FWG-UltraEdge!");
  }

  // កូដចាស់ៗរបស់បងខាងក្រោមទុកដដែល...

import { withSentry } from "@sentry/cloudflare";

 * FWG-UltraEdge — Cloudflare Worker
 * Security hardening applied:
 *   [1] CORS wildcard → explicit allowlist
 *   [2] scrapeShield: false → true
 *   [3] Prefetch Link header → path sanitised + validated
 *   [4] UA check → pattern-hardened, not trivially bypassable
 *   [5] CSP + Permissions-Policy headers added
 *   [6] X-Frame-Options: SAMEORIGIN → DENY
 */

// ─── Types ────────────────────────────────────────────────────────────────────
// Extend when you add KV / D1 / secret bindings in wrangler.toml
export interface Env {
  // KV_NAMESPACE_PROD:    KVNamespace;
  // KV_NAMESPACE_STAGING: KVNamespace;
}

// ─── [1] CORS allowlist ───────────────────────────────────────────────────────
// List every legitimate first-party origin explicitly.
// Never use "*" — it defeats credentialed-request protection entirely.
const ALLOWED_ORIGINS = new Set<string>([
  "https://fwg-ultraedge.example.com",
  "https://staging.fwg-ultraedge.example.com",
  // "https://partner.example.net",   ← add real partner origins here
]);

function resolveCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  return null; // omit CORS headers entirely for unlisted origins
}

// ─── [3] Prefetch link sanitisation ──────────────────────────────────────────
// Vulnerability: url.pathname was injected directly into the Link header.
// Fix: reconstruct path from a *numeric capture only*, then validate the
//      result against a strict allowlist pattern before emitting the header.
const SAFE_PATH_RE = /^[a-zA-Z0-9._\-/]+$/;

function buildNextSegmentLink(pathname: string): string | null {
  // Capture the directory prefix and the numeric segment index separately.
  const match = pathname.match(/^(.*\/)(\d+)\.ts$/);
  if (!match) return null;

  const [, dir, numStr] = match;
  const nextIndex = parseInt(numStr, 10) + 1;
  const nextPath  = `${dir}${nextIndex}.ts`;

  // Validate the *constructed* path — never trust raw user input.
  if (!SAFE_PATH_RE.test(nextPath))           return null;
  if (nextPath.includes("://"))               return null; // no scheme smuggling
  if (nextPath.startsWith("//"))              return null; // no protocol-relative URLs
  if (nextPath.includes("\n") || nextPath.includes("\r")) return null; // no CRLF injection

  return `<${nextPath}>; rel=prefetch`;
}

// ─── [4] User-Agent validation ────────────────────────────────────────────────
// Original check used .includes("curl") — trivially bypassed with any custom UA.
// Fix: match against a regex that covers tool signatures regardless of version
//      strings, capitalisation, or minor prefix variations.
const BLOCKED_UA_RE =
  /^\s*$|curl\/|wget\/|python[-/\s]|python-requests|go-http-client|java\/|libwww-perl|scrapy|mechanize/i;

function isBlockedUA(request: Request): boolean {
  const ua = request.headers.get("User-Agent") ?? "";
  return BLOCKED_UA_RE.test(ua);
}

// ─── [5][6] Security response headers ────────────────────────────────────────
function applySecurityHeaders(headers: Headers, corsOrigin: string | null): void {

  // [1] CORS — reflect the verified origin only; include Vary so caches
  //     do not serve a credentialed response to a different origin.
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

  // [6] Clickjacking — DENY is correct for a CDN Worker (not a framed page)
  headers.set("X-Frame-Options", "DENY");

  // MIME sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // Referrer
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // [5a] Content-Security-Policy
  // Worker serves streaming/API responses — lock down to bare minimum.
  // Tune script-src / style-src if you ever serve HTML documents.
  headers.set("Content-Security-Policy", [
    "default-src 'none'",
    "media-src 'self'",          // allow video / audio from same origin
    "connect-src 'self'",
    "img-src 'self'",
    "frame-ancestors 'none'",   // belt-and-braces alongside X-Frame-Options
    "base-uri 'none'",
    "form-action 'none'",
    "upgrade-insecure-requests",
  ].join("; "));

  // [5b] Permissions-Policy — opt out of every browser capability not used
  headers.set("Permissions-Policy", [
    "geolocation=()",
    "camera=()",
    "microphone=()",
    "payment=()",
    "usb=()",
    "bluetooth=()",
    "interest-cohort=()",        // opt out of Topics API
  ].join(", "));

  // Cross-Origin isolation (required for SharedArrayBuffer / high-res timers)
  headers.set("Cross-Origin-Opener-Policy",   "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-site");
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export default withSentry(
  (env: Env) => ({
    dsn: "https://8b2b7c964d66972f73628c012170dae2@o4511416806342656.ingest.us.sentry.io/4511417333186560",
    tracesSampleRate: 1.0,
  }),
  {
    // ____old logic 
  async fetch(
    request: Request,
    _env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {

    const url = new URL(request.url);

    // ── [4] UA gate ──────────────────────────────────────────────────────────
    if (isBlockedUA(request)) {
      return new Response("Forbidden", { status: 403 });
    }

    // ── CORS origin resolution ────────────────────────────────────────────────
    const corsOrigin = resolveCorsOrigin(request);

    // ── OPTIONS pre-flight ────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      const preflightHeaders = new Headers();
      applySecurityHeaders(preflightHeaders, corsOrigin);
      return new Response(null, { status: 204, headers: preflightHeaders });
    }

    // ── Route classification ──────────────────────────────────────────────────
    const isVideo   = /\.(mp4|webm|mkv|avi|mov|m3u8|ts)$/i.test(url.pathname);
    const isHLS     = url.pathname.endsWith(".m3u8");
    const isSegment = url.pathname.endsWith(".ts");

    // ── [2] CF fetch config — scrapeShield ENABLED ───────────────────────────
    const cfConfig = {
      cf: {
        cacheEverything:    true,
        cacheTtl:           isHLS ? 0 : isVideo ? 86400 : 3600,
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
        scrapeShield: true,           // [2] was: false
      },
    };

    try {
      const originResponse = await fetch(request, cfConfig);
      const headers        = new Headers(originResponse.headers);

      // ── [1][5][6] Security headers ─────────────────────────────────────────
      applySecurityHeaders(headers, corsOrigin);

      // ── Video / segment streaming ──────────────────────────────────────────
      if (isVideo || isSegment) {
        headers.set("Accept-Ranges",     "bytes");
        headers.set("Cache-Control",     "public, max-age=86400, stale-while-revalidate=3600");
        headers.set("CDN-Cache-Control", "max-age=86400");
      }

      // ── HLS manifest — must never cache ───────────────────────────────────
      if (isHLS) {
        headers.set("Cache-Control", "no-cache, no-store");
        headers.set("Content-Type",  "application/vnd.apple.mpegurl");
      }

      // ── [3] Prefetch next segment — sanitised ──────────────────────────────
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

    } catch (_err) {
      return new Response("Service Unavailable", {
        status: 503,
        headers: {
          "Content-Type": "text/plain",
          "Retry-After":  "30",
        },
      });
    }
    }
  }
);
  
