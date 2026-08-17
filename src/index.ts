import { withSentry } from "@sentry/cloudflare";
export { SmartRouter } from "./durable/SmartRouter";

// ============================================================
// FWG-UltraEdge — Media Streaming Edge Worker
// Bluetooth-aware audio quality + EQ profile intelligence
// + Traffic Metrics (Phase 1 — AI traffic analytics foundation)
// ============================================================

// ── Bluetooth codec/tier detection ──────────────────────────
function detectBluetoothTier(request) {
  const codec = request.headers.get("X-Audio-Codec")?.toLowerCase() ?? "";
  const quality = request.headers.get("X-Audio-Quality")?.toLowerCase() ?? "";
  const accept = request.headers.get("Accept")?.toLowerCase() ?? "";
  const ua = request.headers.get("User-Agent")?.toLowerCase() ?? "";
  if (codec.includes("ldac") || quality.includes("ldac")) {
    if (quality.includes("990") || quality.includes("hq")) return "ldac-990";
    if (quality.includes("660") || quality.includes("balanced")) return "ldac-660";
    if (quality.includes("330") || quality.includes("connection")) return "ldac-330";
    return "ldac-660";
  }
  if (codec.includes("aptx-adaptive") || codec.includes("aptxadaptive")) return "aptx-adaptive";
  if (codec.includes("aptx-hd") || codec.includes("aptxhd")) return "aptx-hd";
  if (codec.includes("aptx")) return "aptx";
  if (codec.includes("aac") || accept.includes("audio/aac")) return "aac";
  if (codec.includes("sbc-hq") || codec.includes("sbc_hq")) return "sbc-hq";
  if (codec.includes("sbc")) return "sbc";
  if (codec.includes("pcm") || codec.includes("usb-dac") || ua.includes("uapp") || quality.includes("wired")) return "wired";
  return "unknown";
}

function resolveAudioQualityHint(tier, isLossless) {
  if (isLossless) return "lossless-hires";
  switch (tier) {
    case "ldac-990": return "hi-res-990";
    case "ldac-660": return "hi-res-balanced-660";
    case "ldac-330": return "standard-330";
    case "aptx-adaptive": return "lossless-adaptive";
    case "aptx-hd": return "hd-24bit";
    case "aptx": return "cd-quality";
    case "aac": return "high-aac";
    case "sbc-hq": return "sbc-joint-stereo";
    case "sbc": return "sbc-standard";
    case "wired": return "wired-direct";
    default: return "stereo-standard";
  }
}

var ALLOWED_ORIGINS = new Set([
  "https://ultraedge-prod.fasterwgseverkh.workers.dev/",
  "https://stream-ultraedge-prod.fasterwgseverkh.workers.dev/",
  "https://cdn-ultraedge-prod.fasterwgseverkh.workers.dev/",
  "https://1g12e6nfi4.cloudflare-gateway.com/",
  "https://ultraedge-stg.fasterwgseverkh.workers.dev/",
  "https://stream-ultraedge-stg.fasterwgseverkh.workers.dev/",
  "https://cdn-ultraedge-stg.fasterwgseverkh.workers.dev/"
]);

function resolveCorsOrigin(request) {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  return null;
}

var SAFE_PATH_RE = /^[a-zA-Z0-9._\-/]+$/;
var AUDIO_STREAM_PATH_RE = /\/(audio|vocals?|voice|speech|sound)\//i;

function buildNextSegmentLink(pathname, isAudioOnlyStream) {
  if (isAudioOnlyStream) return null;
  const match = pathname.match(/^(.*\/)(\d+)\.ts$/);
  if (!match) return null;
  const [, dir, numStr] = match;
  const nextIndex = parseInt(numStr, 10) + 1;
  const nextPath = `${dir}${nextIndex}.ts`;
  if (!SAFE_PATH_RE.test(nextPath)) return null;
  if (nextPath.includes("://")) return null;
  if (nextPath.startsWith("//")) return null;
  if (nextPath.includes("\n") || nextPath.includes("\r")) return null;
  return `<${nextPath}>; rel=prefetch`;
}

var BLOCKED_UA_RE = /^\s*$|curl\/|wget\/|python[-/\s]|python-requests|go-http-client|java\/|libwww-perl|scrapy|mechanize/i;
function isBlockedUA(request) {
  const ua = request.headers.get("User-Agent") ?? "";
  return BLOCKED_UA_RE.test(ua);
}

async function isRateLimited2(request, env) {
  try {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const key = `ratelimit:${ip}`;
    const maxReq = parseInt(env.RATE_LIMIT_MAX ?? "100", 10);
    const windowSecs = parseInt(env.RATE_LIMIT_WINDOW ?? "60", 10);
    const current = parseInt(await env.ULTRA_EDGE_KV.get(key) ?? "0", 10);
    if (current >= maxReq) return true;
    await env.ULTRA_EDGE_KV.put(key, String(current + 1), { expirationTtl: windowSecs });
    return false;
  } catch {
    return false;
  }
}

function detectMediaContentType(pathname) {
  const p = pathname.toLowerCase();
  if (p.endsWith(".mp4")) return "video/mp4";
  if (p.endsWith(".webm")) return "video/webm";
  if (p.endsWith(".ts")) return "video/mp2t";
  if (p.endsWith(".mkv")) return "video/x-matroska";
  if (p.endsWith(".avi")) return "video/x-msvideo";
  if (p.endsWith(".mov")) return "video/quicktime";
  if (p.endsWith(".flac")) return "audio/flac";
  if (p.endsWith(".wav")) return "audio/wav";
  if (p.endsWith(".aiff") || p.endsWith(".aif")) return "audio/aiff";
  if (p.endsWith(".alac")) return "audio/mp4; codecs=alac";
  if (p.endsWith(".mp3")) return "audio/mpeg";
  if (p.endsWith(".aac")) return "audio/aac";
  if (p.endsWith(".ogg")) return "audio/ogg";
  if (p.endsWith(".opus")) return "audio/ogg; codecs=opus";
  if (p.endsWith(".m4a")) return "audio/mp4";
  if (p.endsWith(".weba")) return "audio/webm";
  if (p.endsWith(".wma")) return "audio/x-ms-wma";
  if (p.endsWith(".dsf")) return "audio/x-dsf";
  if (p.endsWith(".dff")) return "audio/x-dff";
  if (p.endsWith(".mqa")) return "audio/x-mqa";
  if (p.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (p.endsWith(".mpd")) return "application/dash+xml";
  return null;
}

var VIDEO_EXT_RE = /\.(mp4|webm|mkv|avi|mov|m3u8|ts|mpd)$/i;
var AUDIO_EXT_RE = /\.(mp3|aac|flac|ogg|opus|wav|m4a|weba|wma|aiff|aif|alac|dsf|dff|mqa)$/i;
var LOSSLESS_EXT_RE = /\.(flac|wav|aiff|aif|alac|dsf|dff)$/i;

function classifyPath(pathname) {
  const isAudio = AUDIO_EXT_RE.test(pathname);
  const isVideo = VIDEO_EXT_RE.test(pathname);
  const isLossless = LOSSLESS_EXT_RE.test(pathname);
  const isHLS = pathname.endsWith(".m3u8");
  const isDASH = pathname.endsWith(".mpd");
  const isSegment = pathname.endsWith(".ts");
  const isMedia = isVideo || isAudio || isSegment;
  const isManifest = isHLS || isDASH;
  const isAudioOnlyStream = isSegment && AUDIO_STREAM_PATH_RE.test(pathname);
  return { isAudio, isVideo, isLossless, isHLS, isDASH, isSegment, isMedia, isManifest, isAudioOnlyStream };
}

function buildMediaCacheControl(isManifest, isLiveSegment) {
  if (isManifest) return "no-cache, no-store, must-revalidate";
  if (isLiveSegment) return "public, max-age=2, stale-while-revalidate=4, no-transform";
  return "public, max-age=86400, stale-while-revalidate=3600, no-transform";
}

function applySecurityHeaders(headers, corsOrigin, isMedia = false) {
  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin", corsOrigin);
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Range, Authorization, X-Audio-Codec, X-Audio-Quality");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, X-Audio-Quality, X-Audio-Bitrate, X-Audio-Sample-Rate, X-Audio-Channels, CF-Cache-Status, Timing-Allow-Origin");
    headers.set("Access-Control-Max-Age", "86400");
  }
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Content-Security-Policy", [
    "default-src 'none'", "media-src 'self'", "connect-src 'self'",
    "img-src 'self' data:", "frame-ancestors 'none'", "base-uri 'none'",
    "form-action 'none'", "upgrade-insecure-requests"
  ].join("; "));
  headers.set("Permissions-Policy", [
    "geolocation=()", "camera=()", "microphone=()", "payment=()",
    "usb=()", "bluetooth=()", "interest-cohort=()"
  ].join(", "));
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", isMedia ? "credentialless" : "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
}

var EQ_PROFILES = {
  MUSIC_HIFI: { name: "music-hifi-studio", sub: "+3", bass: "+1", mids: "0", highmid: "+1", treble: "+1", air: "+2", spatial: "stereo", dynamicRange: "lossless-wide", latency: "low-jitter", buffer: "seamless-loop", dspEngine: "reference-flat" },
  MUSIC_CASUAL: { name: "music-casual-vshape", sub: "+3", bass: "+4", mids: "-1", highmid: "+1", treble: "+2", air: "+1", spatial: "stereo", dynamicRange: "normalized-soft", latency: "low-jitter", buffer: "seamless-loop", dspEngine: "v-shape-bt" },
  CINEMA: { name: "cinema-spatial-thx", sub: "+5", bass: "+2", mids: "+3", highmid: "-1", treble: "+1", air: "+1", spatial: "surround", dynamicRange: "high-cinema", latency: "fixed-sync", buffer: "aggressive-prebuffer", dspEngine: "dolby-surround-v2" },
  GAMING: { name: "gaming-spatial-competitive", sub: "+2", bass: "+2", mids: "+2", highmid: "+4", treble: "+3", air: "+1", spatial: "spatial", dynamicRange: "gaming-dynamic", latency: "ultra-low", buffer: "ultra-low-latency", dspEngine: "hrtf-spatial-v1" },
  PODCAST: { name: "podcast-voice-clarity", sub: "-3", bass: "-2", mids: "+5", highmid: "+2", treble: "0", air: "-1", spatial: "stereo", dynamicRange: "voice-compressed", latency: "low-jitter", buffer: "stable-sync", dspEngine: "voice-presence" },
  STANDARD: { name: "standard-balanced", sub: "0", bass: "0", mids: "0", highmid: "0", treble: "0", air: "0", spatial: "stereo", dynamicRange: "standard", latency: "low-jitter", buffer: "stable-sync", dspEngine: "passthrough" }
};

function detectContentMode(request, path, isLossless, tier) {
  const explicit = request.headers.get("X-Content-Mode")?.toLowerCase() ?? "";
  if (explicit === "cinema" || explicit === "movie") return "cinema";
  if (explicit === "gaming" || explicit === "game") return "gaming";
  if (explicit === "podcast" || explicit === "voice") return "podcast";
  if (explicit === "music-hifi" || explicit === "hifi") return "music-hifi";
  if (explicit === "music-casual" || explicit === "music") return "music-casual";
  const isCinemaPath = /\/(movies?|cinema|film|netflix-style|series|episode)\//i.test(path);
  const isGamingPath = /\/(games?|gaming|soundtrack|ost|bgm)\//i.test(path);
  const isPodcastPath = /\/(podcast|voice|speech|talk|interview|radio)\//i.test(path);
  const isMusicPath = /\/(music|songs?|mp3|audio|album|artist|spotify-style|track)\//i.test(path);
  if (isCinemaPath) return "cinema";
  if (isGamingPath) return "gaming";
  if (isPodcastPath) return "podcast";
  if (isLossless) return "music-hifi";
  if (isMusicPath) {
    const hiResTiers = ["ldac-990", "ldac-660", "aptx-adaptive", "aptx-hd", "wired"];
    return hiResTiers.includes(tier) ? "music-hifi" : "music-casual";
  }
  return "standard";
}

function selectEQProfile(mode) {
  switch (mode) {
    case "music-hifi": return EQ_PROFILES.MUSIC_HIFI;
    case "music-casual": return EQ_PROFILES.MUSIC_CASUAL;
    case "cinema": return EQ_PROFILES.CINEMA;
    case "gaming": return EQ_PROFILES.GAMING;
    case "podcast": return EQ_PROFILES.PODCAST;
    default: return EQ_PROFILES.STANDARD;
  }
}

function applyAudioIntelligenceHeaders(headers, request, isLossless, pathname) {
  const tier = detectBluetoothTier(request);
  const qualityHint = resolveAudioQualityHint(tier, isLossless);
  const path = pathname.toLowerCase();
  headers.set("X-Audio-Quality", qualityHint);
  const originChannels = headers.get("X-Audio-Channels");
  if (!originChannels) headers.set("X-Audio-Channels", "stereo");
  const originBitrate = headers.get("X-Audio-Bitrate") ?? headers.get("X-Bitrate");
  if (originBitrate) headers.set("X-Audio-Bitrate", originBitrate);
  else if (isLossless) headers.set("X-Audio-Bitrate", "lossless");
  const originSampleRate = headers.get("X-Audio-Sample-Rate") ?? headers.get("X-Sample-Rate");
  if (originSampleRate) headers.set("X-Audio-Sample-Rate", originSampleRate);
  if (isLossless) {
    headers.set("X-Audio-Lossless", "true");
    headers.set("X-Audio-Encoding", "lossless");
  }
  headers.set("CF-Cache-Tag", isLossless ? "audio-lossless-stereo" : `audio-lossy-stereo-${tier}`);
  const duration = headers.get("X-Content-Duration") ?? headers.get("Content-Duration");
  if (duration) headers.set("X-Content-Duration", duration);
  headers.set("Timing-Allow-Origin", "*");
  const mode = detectContentMode(request, path, isLossless, tier);
  const profile = selectEQProfile(mode);
  headers.set("X-Audio-Profile", profile.name);
  headers.set("X-Audio-Mode", mode);
  headers.set("X-Audio-EQ-Sub", profile.sub);
  headers.set("X-Audio-EQ-Bass", profile.bass);
  headers.set("X-Audio-EQ-Mids", profile.mids);
  headers.set("X-Audio-EQ-HighMid", profile.highmid);
  headers.set("X-Audio-EQ-Treble", profile.treble);
  headers.set("X-Audio-EQ-Air", profile.air);
  headers.set("X-Audio-Spatial", profile.spatial);
  headers.set("X-Audio-Dynamic-Range", profile.dynamicRange);
  headers.set("X-Audio-Latency-Mode", profile.latency);
  headers.set("X-Audio-Buffer-Model", profile.buffer);
  headers.set("X-Audio-DSP-Engine", profile.dspEngine);
  const ua = request.headers.get("User-Agent") ?? "";
  if (ua.includes("Android")) headers.set("X-Audio-Decoder-Hint", "android-stable-aac");
  else if (ua.includes("iPhone") || ua.includes("iPad")) headers.set("X-Audio-Decoder-Hint", "ios-coreaudio-lowlat");
  else headers.set("X-Audio-Decoder-Hint", "desktop-generic");
}

// ══════════════════════════════════════════════════════════
// 🆕 PHASE 1 — Traffic Metrics recording (foundation for AI reflection)
// Writes one data point per request to Analytics Engine.
// Never throws — a metrics failure must never break the response.
// ══════════════════════════════════════════════════════════
function recordTrafficMetric(env, pathname, method, status, durationMs, colo) {
  try {
    env.ULTRA_EDGE_TRAFFIC_METRICS?.writeDataPoint({
      // blobs = text dimensions (max 20, each up to 5120 bytes)
      blobs: [pathname, method, colo ?? "unknown", env.ENVIRONMENT ?? "unknown"],
      // doubles = numeric dimensions (max 20)
      doubles: [durationMs, status],
      // indexes = up to 1 value, used for fast filtering/grouping
      indexes: [env.ENVIRONMENT ?? "unknown"]
    });
  } catch (err) {
    console.error("[traffic-metrics] write failed:", err);
  }
}
__name?.(recordTrafficMetric, "recordTrafficMetric");

// ── Main handler ─────────────────────────────────────────────
var index_default = withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: env.ENVIRONMENT === "production" ? 0.1 : 1,
    environment: env.ENVIRONMENT,
    release: `${env.APP_NAME}@${env.APP_VERSION}`
  }),
  {
    async fetch(request, env, _ctx) {
      const url = new URL(request.url);
      const requestStart = Date.now();               // 🆕 Phase 1
      const colo = request.cf?.colo ?? "unknown";      // 🆕 Phase 1

      const { isAudio, isVideo, isLossless, isSegment, isMedia, isManifest, isAudioOnlyStream } = classifyPath(url.pathname);

      if (isBlockedUA(request)) {
        recordTrafficMetric(env, url.pathname, request.method, 403, Date.now() - requestStart, colo); // 🆕
        return new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain" } });
      }

      if (await isRateLimited2(request, env)) {
        recordTrafficMetric(env, url.pathname, request.method, 429, Date.now() - requestStart, colo); // 🆕
        return new Response("Too Many Requests", {
          status: 429,
          headers: { "Content-Type": "text/plain", "Retry-After": env.RATE_LIMIT_WINDOW ?? "60" }
        });
      }

      const corsOrigin = resolveCorsOrigin(request);

      if (request.method === "OPTIONS") {
        const h = new Headers();
        applySecurityHeaders(h, corsOrigin, isMedia);
        h.set("Vary", corsOrigin ? "Origin" : "Accept-Encoding");
        recordTrafficMetric(env, url.pathname, request.method, 204, Date.now() - requestStart, colo); // 🆕
        return new Response(null, { status: 204, headers: h });
      }

      const isLiveSegment = isSegment && /\/live\//i.test(url.pathname);

      const cfConfig = {
        cf: isLossless ? {
          cacheEverything: true,
          cacheTtl: 86400,
          cacheTtlByStatus: { "200-299": 86400, "404": 60, "500-599": 0 },
          polish: "off",
          mirage: false,
          minify: { javascript: false, css: false, html: false },
          scrapeShield: true,
          apps: false,
          cacheKey: `lossless-stereo:${url.pathname}`
        } : {
          cacheEverything: true,
          cacheTtl: isManifest ? 0 : isMedia ? 86400 : 3600,
          cacheTtlByStatus: { "200-299": isManifest ? 0 : 86400, "404": 60, "500-599": 0 },
          polish: isMedia ? "off" : "lossless",
          mirage: !isMedia,
          minify: { javascript: !isMedia, css: !isMedia, html: !isMedia },
          scrapeShield: true
        }
      };

      try {
        const originResponse = await fetch(request, cfConfig);
        const headers = new Headers(originResponse.headers);
        applySecurityHeaders(headers, corsOrigin, isMedia);

        const detectedType = detectMediaContentType(url.pathname);
        if (detectedType) {
          const currentType = headers.get("Content-Type") ?? "";
          const shouldForce = !currentType || currentType.startsWith("application/octet-stream") || currentType.startsWith("binary/");
          if (shouldForce) headers.set("Content-Type", detectedType);
        }

        if (isAudio) {
          headers.set("Accept-Ranges", "bytes");
          headers.set("Cache-Control", buildMediaCacheControl(false, isLiveSegment));
          headers.set("CDN-Cache-Control", "max-age=86400");
          headers.delete("Content-Encoding");
          if (!isLiveSegment) headers.delete("Transfer-Encoding");
          const contentLength = originResponse.headers.get("Content-Length");
          if (contentLength && /^\d+$/.test(contentLength)) headers.set("Content-Length", contentLength);
          const contentRange = originResponse.headers.get("Content-Range");
          if (contentRange) headers.set("Content-Range", contentRange);
          const ct = headers.get("Content-Type")?.toLowerCase() ?? "";
          if (ct.includes("audio/aac") && !ct.includes("codecs")) headers.set("Content-Type", "audio/aac; codecs=aac");
          else if (ct.includes("audio/mp4") && !ct.includes("codecs")) headers.set("Content-Type", "audio/mp4; codecs=mp4a.40.2");
          else if (ct.includes("audio/ogg") && !ct.includes("codecs")) headers.set("Content-Type", "audio/ogg; codecs=opus");
          for (const h of ["ICY-BR", "ICY-NAME", "ICY-GENRE", "X-Playback-Session-Id"]) {
            const v = originResponse.headers.get(h);
            if (v) headers.set(h, v);
          }
          const etag = originResponse.headers.get("ETag");
          if (etag && !etag.startsWith("W/")) headers.set("ETag", `W/${etag}`);
          applyAudioIntelligenceHeaders(headers, request, isLossless, url.pathname);
        }

        if (isVideo || isSegment) {
          headers.set("Accept-Ranges", "bytes");
          headers.set("Cache-Control", buildMediaCacheControl(false, isLiveSegment));
          headers.set("CDN-Cache-Control", "max-age=86400");
          if (!isLiveSegment) headers.delete("Transfer-Encoding");
          headers.set("Timing-Allow-Origin", "*");
        }

        if (isManifest) headers.set("Cache-Control", buildMediaCacheControl(true, false));

        if (isSegment) {
          const linkValue = buildNextSegmentLink(url.pathname, isAudioOnlyStream);
          if (linkValue) headers.set("Link", linkValue);
        }

        if (isMedia || isManifest) headers.set("Vary", corsOrigin ? "Origin" : "Accept-Ranges");
        else if (corsOrigin) headers.set("Vary", "Origin");

        headers.set("X-Powered-By", "FWG-UltraEdge");
        headers.set("X-Worker-Version", env.APP_VERSION);
        headers.set("X-Worker-Environment", env.ENVIRONMENT);

        // 🆕 Phase 1 — record successful request metric
        recordTrafficMetric(env, url.pathname, request.method, originResponse.status, Date.now() - requestStart, colo);

        return new Response(originResponse.body, {
          status: originResponse.status,
          statusText: originResponse.statusText,
          headers
        });
      } catch (err) {
        // 🆕 Phase 1 — record failed request metric (status 0 = network/fetch error)
        recordTrafficMetric(env, url.pathname, request.method, 0, Date.now() - requestStart, colo);

        captureException(err, {
          tags: {
            path: url.pathname,
            environment: env.ENVIRONMENT,
            version: env.APP_VERSION,
            media_type: isAudio ? (isLossless ? "audio-lossless" : "audio-lossy") : isVideo ? "video" : "other"
          }
        });
        return new Response("Service Unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain", "Retry-After": "30" }
        });
      }
    }
  }
);

export default index_default;
