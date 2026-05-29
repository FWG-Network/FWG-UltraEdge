import { withSentry } from "@sentry/cloudflare";
import * as Sentry    from "@sentry/cloudflare";

 * FWG-UltraEdge — Cloudflare Worker v3.1.0
 * Security hardening applied:
 *   [1]  CORS wildcard → explicit allowlist (port :443 removed — [V5])
 *   [2]  scrapeShield: true preserved
 *   [3]  Prefetch Link header → path sanitised + validated
 *   [4]  UA check → pattern-hardened, not trivially bypassable
 *   [5]  CSP + Permissions-Policy headers added
 *   [6]  X-Frame-Options: SAMEORIGIN → DENY
 *   [7]  SENTRY_DSN from env secret — never hardcoded
 *   [8]  tracesSampleRate: 0.1 production, 1.0 staging
 *   [9]  catch err → Sentry.captureException
 *   [10] Env interface complete
 *   [11] Rate limiting via KV
 *
 * 🎬 HD Video Quality fixes:
 *   [V1] polish: "off" for all media (video + audio) — prevents byte corruption
 *   [V2] mirage: false for all media — prevents resolution downscale
 *   [V3] minify: off for all media — prevents stream corruption
 *   [V4] Content-Type per format — mp4/webm/ts/mkv + audio formats
 *   [V5] CORS origins — :443 removed (browser never sends port)
 *
 * 🎵 Audio Quality fixes (v3.1.0):
 *   [A1] Audio extensions added to isMedia detection — mp3/aac/flac/ogg/opus/wav/m4a/weba
 *   [A2] polish: "off" explicitly for audio — [V1] was video-only before, now covers audio too
 *   [A3] Audio Cache-Control: no-transform — prevents ANY proxy recompression
 *   [A4] detectMediaContentType() replaces detectVideoContentType() — covers audio MIME types
 *   [A5] Audio cacheTtl tuned — 24h for files, 0 for playlists (same as video logic)
 *   [A6] Cross-Origin-Embedder-Policy: credentialless — allows external audio; was "require-corp"
 *        which silently blocked cross-origin audio loading in browsers
 *   [A7] Accept-Ranges: bytes — ensures Range requests work for audio seeking
 *   [A8] Vary: Origin removed from non-CORS responses — prevents incorrect cache fragmentation
 */

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface Env {
  // 🔐 Secrets — set via: wrangler secret put <NAME> --env <production|staging>
  SENTRY_DSN:       string;
  CF_CLIENT_ID:     string;
  CF_CLIENT_SECRET: string;

  // Bindings
  ULTRA_EDGE_KV:     KVNamespace;
  ULTRA_EDGE_VIDEOS: R2Bucket;
  SMART_ROUTER:      DurableObjectNamespace;

  // Vars (wrangler.toml [vars])
  ENVIRONMENT: string;
  APP_NAME:    string;
  APP_VERSION: string;

  // Optional: rate limit config via wrangler vars
  RATE_LIMIT_MAX:    string; // default "100"
  RATE_LIMIT_WINDOW: string; // default "60"
}

// ─── [1][V5] CORS allowlist — :443 removed ────────────────────────────────────
// Browsers NEVER include the port in Origin header for default HTTPS (443).
// Including ":443" means CORS will always fail → browser falls back to degraded playback.
const ALLOWED_ORIGINS = new Set<string>([
  // ── Production ──
  "https://ultraedge-prod.fasterwgseverkh.workers.dev",
  "https://stream-ultraedge-prod.fasterwgseverkh.workers.dev",
  "https://cdn-ultraedge-prod.fasterwgseverkh.workers.dev",
  "https://1g12e6nfi4.cloudflare-gateway.com",
  // ── Staging ──
  "https://ultraedge-stg.fasterwgseverkh.workers.dev",
  "https://stream-ultraedge-stg.fasterwgseverkh.workers.dev",
  "https://cdn-ultraedge-stg.fasterwgseverkh.workers.dev",
]);

function resolveCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  return null;
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

// ─── [4] User-Agent validation ─────────────────────────────────────────────────
const BLOCKED_UA_RE =
  /^\s*$|curl\/|wget\/|python[-/\s]|python-requests|go-http-client|java\/|libwww-perl|scrapy|mechanize/i;

function isBlockedUA(request: Request): boolean {
  const ua = request.headers.get("User-Agent") ?? "";
  return BLOCKED_UA_RE.test(ua);
}

// ─── [11] Rate Limiting via KV ─────────────────────────────────────────────────
async function isRateLimited(request: Request, env: Env): Promise<boolean> {
  try {
    const ip         = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const key        = `ratelimit:${ip}`;
    const maxReq     = parseInt(env.RATE_LIMIT_MAX    ?? "100", 10);
    const windowSecs = parseInt(env.RATE_LIMIT_WINDOW ?? "60",  10);
    const current    = parseInt((await env.ULTRA_EDGE_KV.get(key)) ?? "0", 10);

    if (current >= maxReq) return true;

    await env.ULTRA_EDGE_KV.put(key, String(current + 1), {
      expirationTtl: windowSecs,
    });
    return false;
  } catch {
    // KV failure must never block legitimate traffic
    return false;
  }
}

// ─── [A4][V4] Media Content-Type Detection ────────────────────────────────────
// Covers both video and audio formats.
// Missing/wrong Content-Type → browser guesses → misinterprets bitrate → ព្រិល!
function detectMediaContentType(pathname: string): string | null {
  // ── Video ──
  if (pathname.endsWith(".mp4"))  return "video/mp4";
  if (pathname.endsWith(".webm")) return "video/webm";
  if (pathname.endsWith(".ts"))   return "video/mp2t";
  if (pathname.endsWith(".mkv"))  return "video/x-matroska";
  if (pathname.endsWith(".avi"))  return "video/x-msvideo";
  if (pathname.endsWith(".mov"))  return "video/quicktime";

  // ── [A4] Audio ── (NEW in v3.1.0)
  if (pathname.endsWith(".mp3"))  return "audio/mpeg";
  if (pathname.endsWith(".aac"))  return "audio/aac";
  if (pathname.endsWith(".flac")) return "audio/flac";
  if (pathname.endsWith(".ogg"))  return "audio/ogg";
  if (pathname.endsWith(".opus")) return "audio/ogg; codecs=opus";
  if (pathname.endsWith(".wav"))  return "audio/wav";
  if (pathname.endsWith(".m4a"))  return "audio/mp4";
  if (pathname.endsWith(".weba")) return "audio/webm";
  if (pathname.endsWith(".wma"))  return "audio/x-ms-wma";
  if (pathname.endsWith(".aiff") || pathname.endsWith(".aif")) return "audio/aiff";

  // ── HLS / DASH manifests ──
  if (pathname.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (pathname.endsWith(".mpd"))  return "application/dash+xml";

  return null;
}

// ─── Route classification helpers ─────────────────────────────────────────────
const VIDEO_EXT_RE = /\.(mp4|webm|mkv|avi|mov|m3u8|ts|mpd)$/i;

// [A1] Audio extensions added — these were missing before → polish/minify applied → quality drop
const AUDIO_EXT_RE = /\.(mp3|aac|flac|ogg|opus|wav|m4a|weba|wma|aiff|aif)$/i;

function classifyPath(pathname: string) {
  const isAudio   = AUDIO_EXT_RE.test(pathname);
  const isVideo   = VIDEO_EXT_RE.test(pathname);
  const isHLS     = pathname.endsWith(".m3u8");
  const isDASH    = pathname.endsWith(".mpd");
  const isSegment = pathname.endsWith(".ts");
  const isMedia   = isVideo || isAudio || isSegment;  // [A1]
  const isManifest = isHLS || isDASH;
  return { isAudio, isVideo, isHLS, isDASH, isSegment, isMedia, isManifest };
}

// ─── [5][6] Security response headers ─────────────────────────────────────────
function applySecurityHeaders(
  headers:    Headers,
  corsOrigin: string | null,
  isMedia:    boolean = false,
): void {

  // [1][V5] CORS
  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin",  corsOrigin);
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Range, Authorization");
    headers.set("Access-Control-Expose-Headers","Content-Length, Content-Range, Accept-Ranges");
    headers.set("Access-Control-Max-Age",       "86400");
    headers.set("Vary",                         "Origin");
  }

  // HSTS — 2-year max-age
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
    "img-src 'self' data:",
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

  // [A6] COEP: credentialless instead of require-corp
  // "require-corp" silently blocks cross-origin audio/video without CORP headers
  // "credentialless" allows media loading while maintaining isolation for credentialed requests
  headers.set("Cross-Origin-Opener-Policy",   "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", isMedia ? "credentialless" : "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");  // allow media embedding
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export default withSentry(
  // [7] SENTRY_DSN from secret
  (env: Env) => ({
    dsn:              env.SENTRY_DSN,
    tracesSampleRate: env.ENVIRONMENT === "production" ? 0.1 : 1.0,  // [8]
    environment:      env.ENVIRONMENT,
    release:          `${env.APP_NAME}@${env.APP_VERSION}`,
  }),
  {
    async fetch(
      request: Request,
      env:     Env,
      _ctx:    ExecutionContext,
    ): Promise<Response> {

      const url = new URL(request.url);
      const {
        isAudio, isVideo, isHLS, isDASH,
        isSegment, isMedia, isManifest,
      } = classifyPath(url.pathname);

      // ── [4] UA gate ─────────────────────────────────────────────────────────
      if (isBlockedUA(request)) {
        return new Response("Forbidden", {
          status:  403,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // ── [11] Rate limiting ──────────────────────────────────────────────────
      if (await isRateLimited(request, env)) {
        return new Response("Too Many Requests", {
          status:  429,
          headers: {
            "Content-Type": "text/plain",
            "Retry-After":  env.RATE_LIMIT_WINDOW ?? "60",
          },
        });
      }

      // ── CORS origin resolution ──────────────────────────────────────────────
      const corsOrigin = resolveCorsOrigin(request);

      // ── OPTIONS pre-flight ──────────────────────────────────────────────────
      if (request.method === "OPTIONS") {
        const preflightHeaders = new Headers();
        applySecurityHeaders(preflightHeaders, corsOrigin, isMedia);
        return new Response(null, { status: 204, headers: preflightHeaders });
      }

      // ── Cloudflare fetch config ─────────────────────────────────────────────
      const cfConfig = {
        cf: {
          cacheEverything: true,

          // Cache TTL strategy:
          //   manifest (m3u8/mpd) → 0 (never cache — changes every segment)
          //   media files         → 24h
          //   everything else     → 1h
          cacheTtl: isManifest ? 0 : isMedia ? 86400 : 3600,

          cacheTtlByStatus: {
            "200-299": isManifest ? 0 : 86400,
            "404":     60,
            "500-599": 0,
          } as Record<string, number>,

          // [V1][A2] polish: "off" for ALL media (video + audio)
          // polish is an image byte-optimizer. On audio: it can mangle encoded bytes
          // → popping artifacts, pitch shift, volume drops. MUST be off.
          polish: isMedia ? ("off" as const) : ("lossless" as const),

          // [V2] mirage: off for media — mirage is image-resolution-aware, not audio-aware
          mirage: !isMedia,

          // [V3][A2] minify: off for ALL media
          // Minification strips "unnecessary" bytes. In audio streams those bytes ARE the audio.
          minify: {
            javascript: !isMedia,
            css:        !isMedia,
            html:       !isMedia,
          },

          scrapeShield: true,  // [2]
        },
      };

      try {
        const originResponse = await fetch(request, cfConfig);
        const headers        = new Headers(originResponse.headers);

        // ── Security headers ────────────────────────────────────────────────
        applySecurityHeaders(headers, corsOrigin, isMedia);

        // ── [A3][A7] Audio-specific headers ────────────────────────────────
        if (isAudio) {
          // [A7] Range request support — essential for audio seeking/scrubbing
          headers.set("Accept-Ranges", "bytes");

          // [A3] no-transform — instructs ALL intermediaries (CDN, ISP proxies)
          // to NEVER transcode, compress, or alter the audio stream bytes
          headers.set("Cache-Control",
            "public, max-age=86400, stale-while-revalidate=3600, no-transform");

          // CDN-level caching
          headers.set("CDN-Cache-Control", "max-age=86400");
        }

        // ── Video/segment streaming headers ────────────────────────────────
        if (isVideo || isSegment) {
          headers.set("Accept-Ranges",     "bytes");  // [A7]
          headers.set("Cache-Control",
            "public, max-age=86400, stale-while-revalidate=3600, no-transform");
          headers.set("CDN-Cache-Control", "max-age=86400");
        }

        // ── HLS / DASH manifest — never cache ──────────────────────────────
        if (isManifest) {
          headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
          // Content-Type set below via detectMediaContentType
        }

        // ── [A4][V4] Correct Content-Type ──────────────────────────────────
        // Only set if origin didn't provide one.
        // Wrong/missing type → browser guesses → wrong decoder → degraded quality
        const detectedType = detectMediaContentType(url.pathname);
        if (detectedType && !headers.get("Content-Type")) {
          headers.set("Content-Type", detectedType);
        }

        // ── [3] Prefetch next HLS segment ──────────────────────────────────
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
        // [9] Always report to Sentry with full context
        Sentry.captureException(err, {
          tags: {
            path:        url.pathname,
            environment: env.ENVIRONMENT,
            version:     env.APP_VERSION,
            media_type:  isAudio ? "audio" : isVideo ? "video" : "other",
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
  },
);
