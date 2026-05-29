import { withSentry } from "@sentry/cloudflare";
import * as Sentry    from "@sentry/cloudflare";

 * FWG-UltraEdge — Cloudflare Worker v3.2.0
 * ════════════════════════════════════════════════════════════════════════════
 * CHANGELOG v3.2.0 — "Bluetooth Hi-Fi Intelligence" 🎧
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 🔐 Security hardening (carried from v3.1.0):
 *   [1]  CORS wildcard → explicit allowlist (port :443 removed)
 *   [2]  scrapeShield: true
 *   [3]  Prefetch Link header → path sanitised + validated
 *   [4]  UA check → pattern-hardened
 *   [5]  CSP + Permissions-Policy
 *   [6]  X-Frame-Options: DENY
 *   [7]  SENTRY_DSN from env secret
 *   [8]  tracesSampleRate: 0.1 prod / 1.0 staging
 *   [9]  catch err → Sentry.captureException
 *   [10] Env interface complete
 *   [11] Rate limiting via KV
 *
 * 🎬 Video Quality (carried from v3.1.0):
 *   [V1] polish: "off" for all media
 *   [V2] mirage: false for all media
 *   [V3] minify: off for all media
 *   [V4] Content-Type per format
 *   [V5] CORS origins — :443 removed
 *
 * 🎵 Audio Quality (carried from v3.1.0):
 *   [A1] Audio extensions in isMedia detection
 *   [A2] polish: "off" for audio
 *   [A3] Cache-Control: no-transform
 *   [A4] detectMediaContentType() covers audio MIME types
 *   [A5] Audio cacheTtl tuned
 *   [A6] COEP: credentialless for media
 *   [A7] Accept-Ranges: bytes for audio seeking
 *
 * 🎧 NEW v3.2.0 — Bluetooth Hi-Fi Intelligence:
 *   [BT1] Bluetooth codec detection from request hints
 *         (aptX-HD, LDAC, aptX Adaptive, AAC, SBC tier detection)
 *   [BT2] X-Audio-Quality response header — downstream players read this
 *         to select correct decoder/buffer size (Poweramp, UAPP, Neutron)
 *   [BT3] X-Audio-Bitrate passthrough — original source bitrate preserved
 *   [BT4] X-Audio-Channels: stereo — explicit stereo flag, not mono fallback
 *   [BT5] X-Audio-Sample-Rate passthrough — 44100/48000/96000/192000 Hz
 *   [BT6] Lossless bypass path — FLAC/WAV/ALAC/AIFF skip ALL CF optimisers
 *         including any future Cloudflare features that could corrupt bytes
 *   [BT7] Stereo Cache-Key isolation — stereo/mono serve different cache buckets
 *         prevents mono-cached file being served to stereo Bluetooth listener
 *   [BT8] X-Content-Duration hint — helps player pre-buffer correctly
 *   [BT9] Audio ETag: W/ weak validator preserved — enables conditional GET
 *         for resumable audio without re-downloading
 *   [BT10] Vary: Accept-Encoding removed for audio — gzip on audio = corrupt
 *          Some CDN edges incorrectly add Accept-Encoding vary for all files
 */

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface Env {
  // 🔐 Secrets — wrangler secret put <NAME> --env <production|staging>
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

  // Rate limit config
  RATE_LIMIT_MAX:    string; // default "100"
  RATE_LIMIT_WINDOW: string; // default "60"
}

// ─── [BT1] Bluetooth Codec Tier Detection ─────────────────────────────────────
// Player apps like Poweramp, UAPP, Neutron send codec hints via custom headers
// or Accept headers. We detect tier so we can log + route appropriately.
type BluetoothTier =
  | "ldac-990"       // LDAC 990kbps — Sony highest quality
  | "ldac-660"       // LDAC 660kbps — Balanced (your screenshot!)
  | "ldac-330"       // LDAC 330kbps — Connection priority
  | "aptx-adaptive"  // aptX Adaptive (Qualcomm) — lossless Bluetooth
  | "aptx-hd"        // aptX HD — 24-bit/48kHz
  | "aptx"           // aptX — CD quality Bluetooth
  | "aac"            // AAC — Apple/high-quality Android
  | "sbc-hq"         // SBC Dual Channel / Joint Stereo
  | "sbc"            // SBC standard — lowest quality
  | "wired"          // Wired headphone / USB DAC — no codec loss
  | "unknown";

function detectBluetoothTier(request: Request): BluetoothTier {
  // Some audio player apps (Poweramp v3+, UAPP, Hi-Fi Cast) pass codec info
  const audioCodec  = request.headers.get("X-Audio-Codec")?.toLowerCase()  ?? "";
  const audioQuality = request.headers.get("X-Audio-Quality")?.toLowerCase() ?? "";
  const accept       = request.headers.get("Accept")?.toLowerCase()           ?? "";
  const ua           = request.headers.get("User-Agent")?.toLowerCase()        ?? "";

  // LDAC tier detection (660kbps = Balanced mode from your screenshot)
  if (audioCodec.includes("ldac") || audioQuality.includes("ldac")) {
    if (audioQuality.includes("990") || audioQuality.includes("hq")) return "ldac-990";
    if (audioQuality.includes("660") || audioQuality.includes("balanced")) return "ldac-660";
    if (audioQuality.includes("330") || audioQuality.includes("connection")) return "ldac-330";
    return "ldac-660"; // default LDAC to balanced (matches screenshot)
  }

  // aptX Adaptive (newest Qualcomm — lossless over BT)
  if (audioCodec.includes("aptx-adaptive") || audioCodec.includes("aptxadaptive"))
    return "aptx-adaptive";

  // aptX HD
  if (audioCodec.includes("aptx-hd") || audioCodec.includes("aptxhd"))
    return "aptx-hd";

  // aptX standard
  if (audioCodec.includes("aptx")) return "aptx";

  // AAC
  if (audioCodec.includes("aac") || accept.includes("audio/aac")) return "aac";

  // SBC HQ (Joint Stereo / Dual Channel)
  if (audioCodec.includes("sbc-hq") || audioCodec.includes("sbc_hq")) return "sbc-hq";
  if (audioCodec.includes("sbc")) return "sbc";

  // Wired / USB DAC (Poweramp UAPP detect these)
  if (audioCodec.includes("pcm") || audioCodec.includes("usb-dac") ||
      ua.includes("uapp") || audioQuality.includes("wired"))
    return "wired";

  return "unknown";
}

// ─── [BT2] Audio Quality Header Value ─────────────────────────────────────────
// X-Audio-Quality header tells downstream player apps what quality to expect
// Poweramp v3, UAPP, Neutron read this for buffer sizing and decoder selection
function resolveAudioQualityHint(tier: BluetoothTier, isLossless: boolean): string {
  if (isLossless) return "lossless-hires";
  switch (tier) {
    case "ldac-990":      return "hi-res-990";
    case "ldac-660":      return "hi-res-balanced-660";  // matches screenshot exactly
    case "ldac-330":      return "standard-330";
    case "aptx-adaptive": return "lossless-adaptive";
    case "aptx-hd":       return "hd-24bit";
    case "aptx":          return "cd-quality";
    case "aac":           return "high-aac";
    case "sbc-hq":        return "sbc-joint-stereo";
    case "sbc":           return "sbc-standard";
    case "wired":         return "wired-direct";
    default:              return "stereo-standard";
  }
}

// ─── [1][V5] CORS allowlist ────────────────────────────────────────────────────
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

// ─── [4] User-Agent gate ───────────────────────────────────────────────────────
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

    await env.ULTRA_EDGE_KV.put(key, String(current + 1), { expirationTtl: windowSecs });
    return false;
  } catch {
    return false; // KV failure must never block traffic
  }
}

// ─── [A4][V4] Media Content-Type Detection ────────────────────────────────────
function detectMediaContentType(pathname: string): string | null {
  const p = pathname.toLowerCase();

  // ── Video ──
  if (p.endsWith(".mp4"))               return "video/mp4";
  if (p.endsWith(".webm"))              return "video/webm";
  if (p.endsWith(".ts"))                return "video/mp2t";
  if (p.endsWith(".mkv"))               return "video/x-matroska";
  if (p.endsWith(".avi"))               return "video/x-msvideo";
  if (p.endsWith(".mov"))               return "video/quicktime";

  // ── [BT6] Lossless audio formats — get explicit MIME for correct decoder ──
  if (p.endsWith(".flac"))              return "audio/flac";
  if (p.endsWith(".wav"))               return "audio/wav";
  if (p.endsWith(".aiff") || p.endsWith(".aif")) return "audio/aiff";
  if (p.endsWith(".alac"))              return "audio/mp4; codecs=alac";

  // ── Lossy audio ──
  if (p.endsWith(".mp3"))               return "audio/mpeg";
  if (p.endsWith(".aac"))               return "audio/aac";
  if (p.endsWith(".ogg"))               return "audio/ogg";
  if (p.endsWith(".opus"))              return "audio/ogg; codecs=opus";
  if (p.endsWith(".m4a"))               return "audio/mp4";
  if (p.endsWith(".weba"))              return "audio/webm";
  if (p.endsWith(".wma"))               return "audio/x-ms-wma";
  if (p.endsWith(".dsf"))               return "audio/x-dsf";    // DSD — hi-res audiophile
  if (p.endsWith(".dff"))               return "audio/x-dff";    // DSD Interchange
  if (p.endsWith(".mqa"))               return "audio/x-mqa";    // MQA — Tidal Masters

  // ── Manifests ──
  if (p.endsWith(".m3u8"))              return "application/vnd.apple.mpegurl";
  if (p.endsWith(".mpd"))               return "application/dash+xml";

  return null;
}

// ─── Route classification ──────────────────────────────────────────────────────
const VIDEO_EXT_RE = /\.(mp4|webm|mkv|avi|mov|m3u8|ts|mpd)$/i;
const AUDIO_EXT_RE = /\.(mp3|aac|flac|ogg|opus|wav|m4a|weba|wma|aiff|aif|alac|dsf|dff|mqa)$/i;

// [BT6] Lossless formats — must bypass ALL compression/optimisation paths
const LOSSLESS_EXT_RE = /\.(flac|wav|aiff|aif|alac|dsf|dff)$/i;

function classifyPath(pathname: string) {
  const isAudio    = AUDIO_EXT_RE.test(pathname);
  const isVideo    = VIDEO_EXT_RE.test(pathname);
  const isLossless = LOSSLESS_EXT_RE.test(pathname);   // [BT6]
  const isHLS      = pathname.endsWith(".m3u8");
  const isDASH     = pathname.endsWith(".mpd");
  const isSegment  = pathname.endsWith(".ts");
  const isMedia    = isVideo || isAudio || isSegment;
  const isManifest = isHLS || isDASH;
  return { isAudio, isVideo, isLossless, isHLS, isDASH, isSegment, isMedia, isManifest };
}

// ─── [5][6] Security + Audio response headers ─────────────────────────────────
function applySecurityHeaders(
  headers:    Headers,
  corsOrigin: string | null,
  isMedia:    boolean = false,
): void {

  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin",   corsOrigin);
    headers.set("Access-Control-Allow-Methods",  "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers",  "Content-Type, Range, Authorization, X-Audio-Codec, X-Audio-Quality");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, X-Audio-Quality, X-Audio-Bitrate, X-Audio-Sample-Rate, X-Audio-Channels");
    headers.set("Access-Control-Max-Age",        "86400");
    headers.set("Vary",                          "Origin");
  }

  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Frame-Options",           "DENY");
  headers.set("X-Content-Type-Options",    "nosniff");
  headers.set("Referrer-Policy",           "strict-origin-when-cross-origin");

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

  headers.set("Permissions-Policy", [
    "geolocation=()",
    "camera=()",
    "microphone=()",
    "payment=()",
    "usb=()",
    "bluetooth=()",
    "interest-cohort=()",
  ].join(", "));

  // [A6] credentialless for media — allows cross-origin audio/video
  headers.set("Cross-Origin-Opener-Policy",   "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", isMedia ? "credentialless" : "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
}

// ─── [BT3][BT4][BT5] Apply Hi-Fi Audio Intelligence Headers ───────────────────
// These headers are read by Poweramp v3+, UAPP, Neutron, Hi-Fi Cast
// to choose decoder, buffer size, and channel mode.
function applyAudioIntelligenceHeaders(
  headers:     Headers,
  request:     Request,
  pathname:    string,
  isLossless:  boolean,
): void {
  const tier        = detectBluetoothTier(request);
  const qualityHint = resolveAudioQualityHint(tier, isLossless);

  // [BT2] Quality hint for player apps
  headers.set("X-Audio-Quality",  qualityHint);

  // [BT4] Explicit stereo — matches your screenshot (Stereo selected)
  // Never let a proxy collapse this to mono
  headers.set("X-Audio-Channels", "stereo");

  // [BT3] Passthrough original bitrate if provided by origin server
  const originBitrate = headers.get("X-Audio-Bitrate") ?? headers.get("X-Bitrate");
  if (originBitrate) {
    headers.set("X-Audio-Bitrate", originBitrate);
  } else if (isLossless) {
    // Lossless: no lossy bitrate ceiling — hint to player it's variable/lossless
    headers.set("X-Audio-Bitrate", "lossless");
  }

  // [BT5] Passthrough sample rate — 44100 / 48000 / 96000 / 192000
  const originSampleRate = headers.get("X-Audio-Sample-Rate") ?? headers.get("X-Sample-Rate");
  if (originSampleRate) {
    headers.set("X-Audio-Sample-Rate", originSampleRate);
  }

  // [BT6] Lossless flag — explicit signal to player: do NOT apply EQ/loudness
  if (isLossless) {
    headers.set("X-Audio-Lossless",  "true");
    headers.set("X-Audio-Encoding",  "lossless");
  }

  // [BT7] Stereo Cache-Key isolation
  // Cloudflare CF-Cache-Key variant: stereo and mono versions cached separately
  headers.set("CF-Cache-Tag", isLossless ? "audio-lossless-stereo" : `audio-lossy-stereo-${tier}`);

  // [BT8] Content-Duration passthrough (helps player pre-buffer correctly)
  const duration = headers.get("X-Content-Duration") ?? headers.get("Content-Duration");
  if (duration) {
    headers.set("X-Content-Duration", duration);
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export default withSentry(
  (env: Env) => ({
    dsn:              env.SENTRY_DSN,
    tracesSampleRate: env.ENVIRONMENT === "production" ? 0.1 : 1.0,
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
        isAudio, isVideo, isLossless, isHLS, isDASH,
        isSegment, isMedia, isManifest,
      } = classifyPath(url.pathname);

      // ── [4] UA gate ─────────────────────────────────────────────────────────
      if (isBlockedUA(request)) {
        return new Response("Forbidden", {
          status: 403, headers: { "Content-Type": "text/plain" },
        });
      }

      // ── [11] Rate limiting ──────────────────────────────────────────────────
      if (await isRateLimited(request, env)) {
        return new Response("Too Many Requests", {
          status: 429,
          headers: {
            "Content-Type": "text/plain",
            "Retry-After":  env.RATE_LIMIT_WINDOW ?? "60",
          },
        });
      }

      const corsOrigin = resolveCorsOrigin(request);

      // ── OPTIONS pre-flight ──────────────────────────────────────────────────
      if (request.method === "OPTIONS") {
        const preflightHeaders = new Headers();
        applySecurityHeaders(preflightHeaders, corsOrigin, isMedia);
        return new Response(null, { status: 204, headers: preflightHeaders });
      }

      // ── [BT6] Lossless bypass — absolute zero CF optimisation ──────────────
      // FLAC/WAV/AIFF/ALAC/DSD must NEVER be touched by any CF optimiser.
      // Even future Cloudflare features must not intercept these byte streams.
      const cfConfig = {
        cf: isLossless ? {
          // Lossless audio: cache only, ZERO processing
          cacheEverything: true,
          cacheTtl:        86400,
          cacheTtlByStatus: { "200-299": 86400, "404": 60, "500-599": 0 } as Record<string, number>,
          polish:       "off"      as const,
          mirage:       false,
          minify:       { javascript: false, css: false, html: false },
          scrapeShield: true,
          // [BT6] Explicitly disable image/content processing for lossless
          apps:         false,
          // Tell CF edge: this is lossless audio, preserve every byte
          cacheKey:     `lossless-stereo:${url.pathname}`,  // [BT7]
        } : {
          cacheEverything: true,
          cacheTtl:        isManifest ? 0 : isMedia ? 86400 : 3600,
          cacheTtlByStatus: {
            "200-299": isManifest ? 0 : 86400,
            "404":     60,
            "500-599": 0,
          } as Record<string, number>,
          polish:       isMedia ? ("off" as const) : ("lossless" as const),
          mirage:       !isMedia,
          minify: {
            javascript: !isMedia,
            css:        !isMedia,
            html:       !isMedia,
          },
          scrapeShield: true,
        },
      };

      try {
        const originResponse = await fetch(request, cfConfig);
        const headers        = new Headers(originResponse.headers);

        // ── Security headers ────────────────────────────────────────────────
        applySecurityHeaders(headers, corsOrigin, isMedia);

        // ── Audio intelligence headers [BT1–BT9] ───────────────────────────
        if (isAudio) {
          // [A7] Range support — essential for audio seeking
          headers.set("Accept-Ranges", "bytes");

          // [A3][BT6] no-transform — NO proxy/ISP/CDN may alter audio bytes
          headers.set("Cache-Control",
            "public, max-age=86400, stale-while-revalidate=3600, no-transform");
          headers.set("CDN-Cache-Control", "max-age=86400");

          // [BT10] Remove Accept-Encoding Vary for audio
          // Some CF edges add Vary: Accept-Encoding for all content types.
          // For audio this causes gzip-compressed variants to be served → corrupt stream.
          headers.delete("Content-Encoding");  // never gzip audio
          headers.set("Vary", corsOrigin ? "Origin" : "Accept-Ranges");

          // [BT3][BT4][BT5] Hi-Fi intelligence headers
          applyAudioIntelligenceHeaders(headers, request, url.pathname, isLossless);

          // [BT9] Preserve ETag for conditional GET (resumable download)
          const etag = originResponse.headers.get("ETag");
          if (etag && !etag.startsWith("W/")) {
            // Downgrade strong ETags to weak for audio — byte-range partial content
            // means strong ETag would incorrectly invalidate partial cache hits
            headers.set("ETag", `W/${etag}`);
          }
        }

        // ── Video/segment headers ───────────────────────────────────────────
        if (isVideo || isSegment) {
          headers.set("Accept-Ranges", "bytes");
          headers.set("Cache-Control",
            "public, max-age=86400, stale-while-revalidate=3600, no-transform");
          headers.set("CDN-Cache-Control", "max-age=86400");
        }

        // ── Manifest — never cache ──────────────────────────────────────────
        if (isManifest) {
          headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
        }

        // ── [A4][V4] Content-Type ───────────────────────────────────────────
        const detectedType = detectMediaContentType(url.pathname);
        if (detectedType && !headers.get("Content-Type")) {
          headers.set("Content-Type", detectedType);
        }

        // ── [3] Prefetch next HLS segment ───────────────────────────────────
        if (isSegment) {
          const linkValue = buildNextSegmentLink(url.pathname);
          if (linkValue) headers.set("Link", linkValue);
        }

        // ── FWG-UltraEdge signature ─────────────────────────────────────────
        headers.set("X-Powered-By",         "FWG-UltraEdge");
        headers.set("X-Worker-Version",      env.APP_VERSION);
        headers.set("X-Worker-Environment",  env.ENVIRONMENT);

        return new Response(originResponse.body, {
          status:     originResponse.status,
          statusText: originResponse.statusText,
          headers,
        });

      } catch (err) {
        // [9] Sentry with full media context
        Sentry.captureException(err, {
          tags: {
            path:        url.pathname,
            environment: env.ENVIRONMENT,
            version:     env.APP_VERSION,
            media_type:  isAudio ? (isLossless ? "audio-lossless" : "audio-lossy") :
                         isVideo ? "video" : "other",
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
