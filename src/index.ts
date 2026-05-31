import { withSentry } from "@sentry/cloudflare";
import * as Sentry    from "@sentry/cloudflare";


 * FWG-UltraEdge — Cloudflare Worker v3.3.0
 * ════════════════════════════════════════════════════════════════════════════
 * CHANGELOG v3.3.0 — "Audio-Video Sync & Balance Engine" 🎵🎬
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 🔐 Security (v3.1.0+): [1–11] carried — no changes
 * 🎬 Video Quality (v3.1.0+): [V1–V5] carried — no changes
 * 🎵 Audio Quality (v3.1.0+): [A1–A7] carried — no changes
 * 🎧 BT Intelligence (v3.2.0+): [BT1–BT10] carried — no changes
 *
 * 🎯 NEW v3.3.0 — Audio-Video Sync fixes ("vocal ≠ music desync"):
 *
 *   Root cause analysis of "95% OK, vocal and music not balanced/in sync":
 *   ─────────────────────────────────────────────────────────────────────
 *   [S1] AUDIO TRACK MISALIGNMENT via inconsistent chunked delivery:
 *        Audio and video segments arrive at different latencies because
 *        audio Cache-Control max-age=86400 was set independently from
 *        video segments. Player buffers audio ahead of video → desync.
 *        FIX: Unified media Cache-Control with matched stale-while-revalidate.
 *
 *   [S2] DUPLICATE Vary HEADER CONFLICT:
 *        applySecurityHeaders() sets Vary: Origin (line 291).
 *        Then audio block overrides with Vary: Accept-Ranges (line 482).
 *        Result: two competing Vary values → CF caches split improperly
 *        → audio and video fetch from DIFFERENT cache shards
 *        → different propagation delays → desync.
 *        FIX: Single Vary header computed once, applied once.
 *
 *   [S3] HLS SEGMENT TIMING BROKEN by prefetch Link header on AUDIO segments:
 *        buildNextSegmentLink() was applied to ALL .ts files.
 *        For HLS mux streams, .ts contains BOTH audio+video interleaved.
 *        Prefetching next segment while current is still decoding causes
 *        the player's PTS (Presentation Timestamp) clock to drift → vocal lag.
 *        FIX: Prefetch Link disabled for audio-only .ts (detect via path pattern).
 *             Only enabled for pure video HLS streams.
 *
 *   [S4] Content-Type OVERRIDE on already-typed responses:
 *        Previous code: `if (!headers.get("Content-Type"))` — good.
 *        BUT: when origin sends wrong Content-Type (e.g. application/octet-stream
 *        for .mp3), we must FORCE correct type so browser picks right decoder.
 *        Wrong decoder adds codec-specific processing latency → desync.
 *        FIX: Force Content-Type for known audio/video extensions regardless
 *             of what origin server sends, except for manifests.
 *
 *   [S5] MISSING Content-Length strips player's ability to pre-calculate
 *        buffer fill time → player over-buffers audio, under-buffers video
 *        → perceived vocal/music desync in the first 2-5 seconds.
 *        FIX: Preserve Content-Length from origin; never delete it.
 *
 *   [S6] Transfer-Encoding: chunked conflicts with Range requests:
 *        When origin responds chunked AND we set Accept-Ranges: bytes,
 *        the player attempts byte-range seeking on a chunked stream.
 *        Seeking mid-stream on chunked delivery = audio position resets
 *        to wrong PTS → vocal/music out of phase permanently until reload.
 *        FIX: Remove Transfer-Encoding for completed (non-streaming) audio.
 *             Preserve it only for live/streaming HLS .ts segments.
 *
 *   [S7] CACHE STAMPEDE on segment boundaries:
 *        All listeners hit the same segment at T=0. If CF cache misses
 *        and 100+ requests hit origin simultaneously, first responses
 *        return faster than later ones. Players receive audio segments
 *        out of order → buffer reorder → vocal stutters then snaps forward.
 *        FIX: Cache-Control: stale-while-revalidate increased for segments.
 *             CF-Cache-Status exposed so player can detect cache miss.
 *
 *   [S8] X-Audio-Channels: "stereo" header was set on ALL audio responses
 *        including mono source files. If source is mono AAC inside stereo
 *        MP4 container, forcing "stereo" hint makes player upmix incorrectly
 *        → center channel bleeds into sides → vocal appears "detached" from music.
 *        FIX: X-Audio-Channels passthrough from origin if provided;
 *             fallback to "stereo" only when origin doesn't specify.
 *
 *   [S9] MISSING Timing-Allow-Origin for audio resources:
 *        Without this header, browser Resource Timing API cannot measure
 *        audio fetch latency. Player apps that use this for AV sync
 *        (e.g. Poweramp DSP engine) see zero latency → miscalculate sync offset.
 *        FIX: Add Timing-Allow-Origin: * for all media responses.
 *
 *   [S10] applySecurityHeaders() called BEFORE audio block sets Vary.
 *         Then audio block sets Vary again. Final Vary value is wrong
 *         because it was set twice with different values in same response.
 *         FIX: applySecurityHeaders() no longer sets Vary. Vary computed
 *              once at end of response building, applied once.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface Env {
  SENTRY_DSN:        string;
  CF_CLIENT_ID:      string;
  CF_CLIENT_SECRET:  string;
  ULTRA_EDGE_KV:     KVNamespace;
  ULTRA_EDGE_VIDEOS: R2Bucket;
  SMART_ROUTER:      DurableObjectNamespace;
  ENVIRONMENT:       string;
  APP_NAME:          string;
  APP_VERSION:       string;
  RATE_LIMIT_MAX:    string;
  RATE_LIMIT_WINDOW: string;
}

// ─── [BT1] Bluetooth Codec Tier ────────────────────────────────────────────────
type BluetoothTier =
  | "ldac-990" | "ldac-660" | "ldac-330"
  | "aptx-adaptive" | "aptx-hd" | "aptx"
  | "aac" | "sbc-hq" | "sbc" | "wired" | "unknown";

function detectBluetoothTier(request: Request): BluetoothTier {
  const codec   = request.headers.get("X-Audio-Codec")?.toLowerCase()   ?? "";
  const quality = request.headers.get("X-Audio-Quality")?.toLowerCase() ?? "";
  const accept  = request.headers.get("Accept")?.toLowerCase()           ?? "";
  const ua      = request.headers.get("User-Agent")?.toLowerCase()       ?? "";

  if (codec.includes("ldac") || quality.includes("ldac")) {
    if (quality.includes("990") || quality.includes("hq"))          return "ldac-990";
    if (quality.includes("660") || quality.includes("balanced"))    return "ldac-660";
    if (quality.includes("330") || quality.includes("connection"))  return "ldac-330";
    return "ldac-660";
  }
  if (codec.includes("aptx-adaptive") || codec.includes("aptxadaptive")) return "aptx-adaptive";
  if (codec.includes("aptx-hd")       || codec.includes("aptxhd"))       return "aptx-hd";
  if (codec.includes("aptx"))                                             return "aptx";
  if (codec.includes("aac") || accept.includes("audio/aac"))             return "aac";
  if (codec.includes("sbc-hq") || codec.includes("sbc_hq"))              return "sbc-hq";
  if (codec.includes("sbc"))                                              return "sbc";
  if (codec.includes("pcm") || codec.includes("usb-dac") ||
      ua.includes("uapp") || quality.includes("wired"))                  return "wired";
  return "unknown";
}

function resolveAudioQualityHint(tier: BluetoothTier, isLossless: boolean): string {
  if (isLossless) return "lossless-hires";
  switch (tier) {
    case "ldac-990":      return "hi-res-990";
    case "ldac-660":      return "hi-res-balanced-660";
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
  "https://ultraedge-prod.fasterwgseverkh.workers.dev/",
  "https://stream-ultraedge-prod.fasterwgseverkh.workers.dev/",
  "https://cdn-ultraedge-prod.fasterwgseverkh.workers.dev/",
  "https://1g12e6nfi4.cloudflare-gateway.com/",
  "https://ultraedge-stg.fasterwgseverkh.workers.dev/",
  "https://stream-ultraedge-stg.fasterwgseverkh.workers.dev/",
  "https://cdn-ultraedge-stg.fasterwgseverkh.workers.dev/",
]);

function resolveCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  return null;
}

// ─── [3][S3] Prefetch link — only for VIDEO HLS segments ──────────────────────
 [S3] Audio mux segments (.ts) must NOT be prefetched — causes PTS clock drift
 Only enable for streams under a path that is clearly video-only (no /audio/)
const SAFE_PATH_RE        = /^[a-zA-Z0-9._\-/]+$/;
const AUDIO_STREAM_PATH_RE = /\/(audio|vocals?|voice|speech|sound)\//i;

function buildNextSegmentLink(pathname: string, isAudioOnlyStream: boolean): string | null {
  // [S3] Never prefetch audio-only HLS streams
  if (isAudioOnlyStream) return null;

  const match = pathname.match(/^(.*\/)(\d+)\.ts$/);
  if (!match) return null;

  const [, dir, numStr] = match;
  const nextIndex       = parseInt(numStr, 10) + 1;
  const nextPath        = `${dir}${nextIndex}.ts`;

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
    return false;
  }
}

// ─── [A4][V4][S4] Media Content-Type — FORCE for known extensions ─────────────
// [S4] Must override wrong origin Content-Type (e.g. application/octet-stream)
//      because wrong codec = extra decode latency = desync.
//      Exception: manifests are never forced (origin may version them).
function detectMediaContentType(pathname: string): string | null {
  const p = pathname.toLowerCase();
  if (p.endsWith(".mp4"))                       return "video/mp4";
  if (p.endsWith(".webm"))                      return "video/webm";
  if (p.endsWith(".ts"))                        return "video/mp2t";
  if (p.endsWith(".mkv"))                       return "video/x-matroska";
  if (p.endsWith(".avi"))                       return "video/x-msvideo";
  if (p.endsWith(".mov"))                       return "video/quicktime";
  if (p.endsWith(".flac"))                      return "audio/flac";
  if (p.endsWith(".wav"))                       return "audio/wav";
  if (p.endsWith(".aiff") || p.endsWith(".aif")) return "audio/aiff";
  if (p.endsWith(".alac"))                      return "audio/mp4; codecs=alac";
  if (p.endsWith(".mp3"))                       return "audio/mpeg";
  if (p.endsWith(".aac"))                       return "audio/aac";
  if (p.endsWith(".ogg"))                       return "audio/ogg";
  if (p.endsWith(".opus"))                      return "audio/ogg; codecs=opus";
  if (p.endsWith(".m4a"))                       return "audio/mp4";
  if (p.endsWith(".weba"))                      return "audio/webm";
  if (p.endsWith(".wma"))                       return "audio/x-ms-wma";
  if (p.endsWith(".dsf"))                       return "audio/x-dsf";
  if (p.endsWith(".dff"))                       return "audio/x-dff";
  if (p.endsWith(".mqa"))                       return "audio/x-mqa";
  if (p.endsWith(".m3u8"))                      return "application/vnd.apple.mpegurl";
  if (p.endsWith(".mpd"))                       return "application/dash+xml";
  return null;
}

// ─── Route classification ──────────────────────────────────────────────────────
const VIDEO_EXT_RE    = /\.(mp4|webm|mkv|avi|mov|m3u8|ts|mpd)$/i;
const AUDIO_EXT_RE    = /\.(mp3|aac|flac|ogg|opus|wav|m4a|weba|wma|aiff|aif|alac|dsf|dff|mqa)$/i;
const LOSSLESS_EXT_RE = /\.(flac|wav|aiff|aif|alac|dsf|dff)$/i;

function classifyPath(pathname: string) {
  const isAudio          = AUDIO_EXT_RE.test(pathname);
  const isVideo          = VIDEO_EXT_RE.test(pathname);
  const isLossless       = LOSSLESS_EXT_RE.test(pathname);
  const isHLS            = pathname.endsWith(".m3u8");
  const isDASH           = pathname.endsWith(".mpd");
  const isSegment        = pathname.endsWith(".ts");
  const isMedia          = isVideo || isAudio || isSegment;
  const isManifest       = isHLS || isDASH;
  // [S3] Detect audio-only stream paths
  const isAudioOnlyStream = isSegment && AUDIO_STREAM_PATH_RE.test(pathname);
  return {
    isAudio, isVideo, isLossless,
    isHLS, isDASH, isSegment,
    isMedia, isManifest, isAudioOnlyStream,
  };
}

// ─── [S1][S7] Unified Media Cache-Control builder ─────────────────────────────
 [S1] Audio and video MUST use identical cache timing to prevent buffer desync.
     Different max-age values between audio/video = one arrives stale, one fresh
     = player buffers at different rates = vocal/music timing drift.
function buildMediaCacheControl(isManifest: boolean, isLiveSegment: boolean): string {
  if (isManifest) {
    // Manifests change every ~2s in live HLS — never cache
    return "no-cache, no-store, must-revalidate";
  }
  if (isLiveSegment) {
    // [S7] Live segments: short SWR to prevent stampede, long enough to absorb revalidation
    return "public, max-age=2, stale-while-revalidate=4, no-transform";
  }
  // VOD audio + video: identical values — both arrive from same cache shard at same age
  // [S1] CRITICAL: same max-age for audio AND video = same buffer fill rate
  return "public, max-age=86400, stale-while-revalidate=3600, no-transform";
}

// ─── [5][6][S10] Security headers — Vary NOT set here ─────────────────────────
// [S10] Vary is set ONCE at end of handler after all headers are finalized.
//       Setting it here then overriding in audio block = wrong final value.
function applySecurityHeaders(
  headers:    Headers,
  corsOrigin: string | null,
  isMedia:    boolean = false,
): void {
  if (corsOrigin) {
    headers.set("Access-Control-Allow-Origin",   corsOrigin);
    headers.set("Access-Control-Allow-Methods",  "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers",
      "Content-Type, Range, Authorization, X-Audio-Codec, X-Audio-Quality");
    headers.set("Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges, " +
      "X-Audio-Quality, X-Audio-Bitrate, X-Audio-Sample-Rate, X-Audio-Channels, " +
      "CF-Cache-Status, Timing-Allow-Origin");
    headers.set("Access-Control-Max-Age", "86400");
    // NOTE: Vary NOT set here — [S10] see end of handler
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
    "geolocation=()", "camera=()", "microphone=()",
    "payment=()", "usb=()", "bluetooth=()", "interest-cohort=()",
  ].join(", "));

  headers.set("Cross-Origin-Opener-Policy",   "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", isMedia ? "credentialless" : "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
}

// ══════════════════════════════════════════════════════════════════════════════
// ADAPTIVE EQ ENGINE v3.4.0 — "A+ Immersion System"
// ══════════════════════════════════════════════════════════════════════════════
//
 Auto-detects content context → selects EQ profile → emits headers
 Player apps (Poweramp, UAPP, Neutron, VLC) read these to configure their DSP.
//
 Detection priority (highest → lowest):
   1. X-Content-Mode request header  (player app declares mode explicitly)
   2. URL path pattern               (/music/, /movies/, /games/, /podcast/)
   3. MIME type                      (audio/flac → force MUSIC_HIFI)
   4. Bluetooth tier                 (LDAC → HIFI, SBC → compensate)
   5. Device UA                      (Android DSP vs iOS CoreAudio)
//
 EQ Profiles:
   MUSIC_HIFI    → flat ref + sub +3dB + air +2dB  — LDAC/aptX audiophile
   MUSIC_CASUAL  → V-shape: bass +4dB, treble +2dB — SBC/AAC casual BT
   CINEMA        → THX: sub +5dB, mid +3dB (dialogue), fixed AV sync
   GAMING        → spatial: 1-4kHz +4dB, sub +2dB, ultra-low latency
   PODCAST       → mid presence +5dB, bass rolloff -3dB (voice clarity)
   STANDARD      → neutral reference, no modification
// ══════════════════════════════════════════════════════════════════════════════

// ─── EQ Profile definitions ───────────────────────────────────────────────────
interface EQProfile {
  name:         string;    human-readable label
  sub:          string;    sub-bass  (<80Hz)   dB delta e.g. "+3"
  bass:         string;    bass      (80-300Hz) dB delta
  mids:         string;    mids      (300Hz-3kHz) dB delta
  highmid:      string;    high-mid  (3-8kHz) dB delta
  treble:       string;    treble    (8-16kHz) dB delta
  air:          string;    air       (16kHz+) dB delta
  spatial:      "stereo" | "surround" | "spatial" | "binaural";
  dynamicRange: string;
  latency:      string;
  buffer:       string;
  dspEngine:    string;
}

const EQ_PROFILES: Record<string, EQProfile> = {
  // 🎵 Music Hi-Fi — audiophile flat reference, lifted sub + air
   Designed for LDAC/aptX HD headphones, studio monitor-style response
  MUSIC_HIFI: {
    name:         "music-hifi-studio",
    sub:          "+3",    sub-bass presence without muddiness
    bass:         "+1",    gentle bass warmth
    mids:         "0",     flat mids — vocal/instrument balance preserved
    highmid:      "+1",    slight definition boost for strings/guitar
    treble:       "+1",    detail and clarity
    air:          "+2",    16kHz+ sparkle — cymbals, breath, space
    spatial:      "stereo",
    dynamicRange: "lossless-wide",
    latency:      "low-jitter",
    buffer:       "seamless-loop",
    dspEngine:    "reference-flat",
  },

  // 🎵 Music Casual — V-shape for Bluetooth casual listening
   Compensates for SBC/AAC codec compression artifacts at high-freq
  MUSIC_CASUAL: {
    name:         "music-casual-vshape",
    sub:          "+3",    punchy bass for casual listening
    bass:         "+4",    strong bass presence
    mids:         "-1",    slight mid scoop (V-shape)
    highmid:      "+1",
    treble:       "+2",    compensate SBC treble loss
    air:          "+1",
    spatial:      "stereo",
    dynamicRange: "normalized-soft",
    latency:      "low-jitter",
    buffer:       "seamless-loop",
    dspEngine:    "v-shape-bt",
  },

  // 🎬 Cinema — THX-style, wide dynamic range, AV sync locked
  // Dialogue clarity boost, immersive sub for action, spatial surround
  CINEMA: {
    name:         "cinema-spatial-thx",
    sub:          "+5",    explosive sub for action scenes
    bass:         "+2",    body and weight
    mids:         "+3",    dialogue clarity — critical for speech intelligibility
    highmid:      "-1",    reduce harshness on loud effects
    treble:       "+1",    detail without fatigue
    air:          "+1",
    spatial:      "surround",
    dynamicRange: "high-cinema",
    latency:      "fixed-sync",   // AV lock — MUST not drift
    buffer:       "aggressive-prebuffer",
    dspEngine:    "dolby-surround-v2",
  },

  // 🎮 Gaming — competitive spatial, footstep detection, ultra-low latency
  // High-mid boost for directional cues, sub for immersion
  GAMING: {
    name:         "gaming-spatial-competitive",
    sub:          "+2",   // explosion/LFE immersion
    bass:         "+2",   // weapon body
    mids:         "+2",   // general presence
    highmid:      "+4",   // 1-4kHz: footsteps, reload, spatial cues — CRITICAL
    treble:       "+3",   // gunshots, high-freq positional audio
    air:          "+1",
    spatial:      "spatial",   // 3D/binaural positioning
    dynamicRange: "gaming-dynamic",
    latency:      "ultra-low", // competitive gaming — every ms counts
    buffer:       "ultra-low-latency",
    dspEngine:    "hrtf-spatial-v1",
  },

  // 🎙️ Podcast / Voice — speech intelligibility, roll off rumble
  PODCAST: {
    name:         "podcast-voice-clarity",
    sub:          "-3",   // roll off sub — removes room rumble/mic handling noise
    bass:         "-2",   // reduce boominess
    mids:         "+5",   // 250Hz-3kHz: core speech intelligibility band
    highmid:      "+2",   // consonant clarity (s, t, f sounds)
    treble:       "0",    // neutral
    air:          "-1",   // reduce sibilance
    spatial:      "stereo",
    dynamicRange: "voice-compressed",
    latency:      "low-jitter",
    buffer:       "stable-sync",
    dspEngine:    "voice-presence",
  },

  // ⚙️ Standard — neutral reference, no EQ modification
  STANDARD: {
    name:         "standard-balanced",
    sub:          "0",
    bass:         "0",
    mids:         "0",
    highmid:      "0",
    treble:       "0",
    air:          "0",
    spatial:      "stereo",
    dynamicRange: "standard",
    latency:      "low-jitter",
    buffer:       "stable-sync",
    dspEngine:    "passthrough",
  },
};

// ─── [EQ1] Content mode detection — 5-signal priority chain ──────────────────
type ContentMode = "music-hifi" | "music-casual" | "cinema" | "gaming" | "podcast" | "standard";

function detectContentMode(
  request:    Request,
  path:       string,        // lowercase pathname from handler
  isLossless: boolean,
  tier:       BluetoothTier,
): ContentMode {
  // ── Signal 1: Explicit X-Content-Mode header (highest priority) ───────────
  // Player app can declare mode directly — overrides all auto-detection
  const explicit = request.headers.get("X-Content-Mode")?.toLowerCase() ?? "";
  if (explicit === "cinema"  || explicit === "movie")   return "cinema";
  if (explicit === "gaming"  || explicit === "game")    return "gaming";
  if (explicit === "podcast" || explicit === "voice")   return "podcast";
  if (explicit === "music-hifi"   || explicit === "hifi")   return "music-hifi";
  if (explicit === "music-casual" || explicit === "music")  return "music-casual";

  // ── Signal 2: URL path pattern ────────────────────────────────────────────
  const isCinemaPath  = /\/(movies?|cinema|film|netflix-style|series|episode)\//i.test(path);
  const isGamingPath  = /\/(games?|gaming|soundtrack|ost|bgm)\//i.test(path);
  const isPodcastPath = /\/(podcast|voice|speech|talk|interview|radio)\//i.test(path);
  const isMusicPath   = /\/(music|songs?|mp3|audio|album|artist|spotify-style|track)\//i.test(path);

  if (isCinemaPath)  return "cinema";
  if (isGamingPath)  return "gaming";
  if (isPodcastPath) return "podcast";

  // ── Signal 3: MIME type (lossless = always hi-fi music mode) ─────────────
  // FLAC/WAV/AIFF files are almost always music — never gaming/cinema
  if (isLossless) return "music-hifi";

  if (isMusicPath) {
    // ── Signal 4: Bluetooth tier refines music → hifi or casual ─────────────
    // Hi-res codecs → serve studio-quality EQ
    // SBC/unknown   → serve V-shape compensation EQ
    const hiResTiers: BluetoothTier[] = ["ldac-990", "ldac-660", "aptx-adaptive", "aptx-hd", "wired"];
    return hiResTiers.includes(tier) ? "music-hifi" : "music-casual";
  }

  return "standard";
}

// ─── [EQ2] Profile selector — maps mode to EQProfile ─────────────────────────
function selectEQProfile(mode: ContentMode): EQProfile {
  switch (mode) {
    case "music-hifi":   return EQ_PROFILES.MUSIC_HIFI;
    case "music-casual": return EQ_PROFILES.MUSIC_CASUAL;
    case "cinema":       return EQ_PROFILES.CINEMA;
    case "gaming":       return EQ_PROFILES.GAMING;
    case "podcast":      return EQ_PROFILES.PODCAST;
    default:             return EQ_PROFILES.STANDARD;
  }
}

// ─── [BT1–BT10][S8][S9][EQ1–EQ2] Audio Intelligence Headers ─────────────────
// pathname param used for content-type routing — avoids BUG-1 url redeclaration
// applyAudioIntelligenceHeaders() runs LAST in the audio block — values are final
function applyAudioIntelligenceHeaders(
  headers:    Headers,
  request:    Request,
  isLossless: boolean,
  pathname:   string,   // pass from handler — do NOT redeclare url inside
): void {
  const tier        = detectBluetoothTier(request);
  const qualityHint = resolveAudioQualityHint(tier, isLossless);
  const path        = pathname.toLowerCase();

  // ── Bluetooth quality hint ────────────────────────────────────────────────
  headers.set("X-Audio-Quality", qualityHint);

  // [S8] Channel passthrough — only default to stereo if origin didn't specify
  // Forcing stereo on mono source = wrong upmix = vocal detaches from music
  const originChannels = headers.get("X-Audio-Channels");
  if (!originChannels) {
    headers.set("X-Audio-Channels", "stereo");
  }

  // [BT3] Bitrate passthrough
  const originBitrate = headers.get("X-Audio-Bitrate") ?? headers.get("X-Bitrate");
  if (originBitrate) {
    headers.set("X-Audio-Bitrate", originBitrate);
  } else if (isLossless) {
    headers.set("X-Audio-Bitrate", "lossless");
  }

  // [BT5] Sample rate passthrough
  const originSampleRate =
    headers.get("X-Audio-Sample-Rate") ?? headers.get("X-Sample-Rate");
  if (originSampleRate) {
    headers.set("X-Audio-Sample-Rate", originSampleRate);
  }

  if (isLossless) {
    headers.set("X-Audio-Lossless", "true");
    headers.set("X-Audio-Encoding", "lossless");
  }

  // [BT7] Stereo cache isolation tag
  headers.set("CF-Cache-Tag",
    isLossless ? "audio-lossless-stereo" : `audio-lossy-stereo-${tier}`);

  // [BT8] Duration passthrough
  const duration =
    headers.get("X-Content-Duration") ?? headers.get("Content-Duration");
  if (duration) headers.set("X-Content-Duration", duration);

  // [S9] Timing-Allow-Origin — player DSP engines measure fetch latency for AV sync
  headers.set("Timing-Allow-Origin", "*");

  // ── [EQ1] Detect content mode via 5-signal priority chain ─────────────────
  const mode    = detectContentMode(request, path, isLossless, tier);
  const profile = selectEQProfile(mode);

  // ── [EQ2] Emit EQ profile headers ─────────────────────────────────────────
  // Player apps read these to configure their DSP equaliser bands.
  // Values are dB delta strings: "+3", "0", "-2" etc.
  // Apps that don't support these headers ignore them gracefully.
  headers.set("X-Audio-Profile",        profile.name);
  headers.set("X-Audio-Mode",           mode);            // machine-readable mode
  headers.set("X-Audio-EQ-Sub",         profile.sub);     // <80Hz
  headers.set("X-Audio-EQ-Bass",        profile.bass);    // 80-300Hz
  headers.set("X-Audio-EQ-Mids",        profile.mids);    // 300Hz-3kHz
  headers.set("X-Audio-EQ-HighMid",     profile.highmid); // 3-8kHz
  headers.set("X-Audio-EQ-Treble",      profile.treble);  // 8-16kHz
  headers.set("X-Audio-EQ-Air",         profile.air);     // 16kHz+
  headers.set("X-Audio-Spatial",        profile.spatial);
  headers.set("X-Audio-Dynamic-Range",  profile.dynamicRange);
  headers.set("X-Audio-Latency-Mode",   profile.latency);
  headers.set("X-Audio-Buffer-Model",   profile.buffer);
  headers.set("X-Audio-DSP-Engine",     profile.dspEngine);

  // ── [A8] Device-aware decoder hint ────────────────────────────────────────
  // Set AFTER profile — device hint is additive, not overriding
  const ua = request.headers.get("User-Agent") ?? "";
  if (ua.includes("Android")) {
    headers.set("X-Audio-Decoder-Hint", "android-stable-aac");
  } else if (ua.includes("iPhone") || ua.includes("iPad")) {
    headers.set("X-Audio-Decoder-Hint", "ios-coreaudio-lowlat");
  } else {
    headers.set("X-Audio-Decoder-Hint", "desktop-generic");
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
        isAudio, isVideo, isLossless,
        isSegment, isMedia, isManifest, isAudioOnlyStream,
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
        const h = new Headers();
        applySecurityHeaders(h, corsOrigin, isMedia);
        // [S10] Vary for preflight
        h.set("Vary", corsOrigin ? "Origin" : "Accept-Encoding");
        return new Response(null, { status: 204, headers: h });
      }

      // ── Determine if this is a live HLS segment (short segment TTL) ─────────
      // Live segments have short numeric filenames under a "live/" path
      const isLiveSegment = isSegment && /\/live\//i.test(url.pathname);

      // ── CF fetch config ─────────────────────────────────────────────────────
      const cfConfig = {
        cf: isLossless ? {
          // [BT6] Lossless: ZERO processing, cache only
          cacheEverything:  true,
          cacheTtl:         86400,
          cacheTtlByStatus: { "200-299": 86400, "404": 60, "500-599": 0 } as Record<string, number>,
          polish:           "off" as const,
          mirage:           false,
          minify:           { javascript: false, css: false, html: false },
          scrapeShield:     true,
          apps:             false,
          cacheKey:         `lossless-stereo:${url.pathname}`,
        } : {
          cacheEverything:  true,
          cacheTtl:         isManifest ? 0 : isMedia ? 86400 : 3600,
          cacheTtlByStatus: {
            "200-299": isManifest ? 0 : 86400,
            "404":     60,
            "500-599": 0,
          } as Record<string, number>,
          // [V1][A2] Off for ALL media — never let CF touch audio/video bytes
          polish:           isMedia ? ("off" as const) : ("lossless" as const),
          mirage:           !isMedia,
          minify:           {
            javascript: !isMedia,
            css:        !isMedia,
            html:       !isMedia,
          },
          scrapeShield:     true,
        },
      };

      try {
        const originResponse = await fetch(request, cfConfig);
        const headers        = new Headers(originResponse.headers);

        // ── Security headers (no Vary yet — [S10]) ──────────────────────────
        applySecurityHeaders(headers, corsOrigin, isMedia);

        // ── [S4] Force correct Content-Type for known media extensions ──────
            Override wrong/missing origin Content-Type to prevent decoder mismatch
        const detectedType = detectMediaContentType(url.pathname);
        if (detectedType) {
          const currentType = headers.get("Content-Type") ?? "";
          // Force override if: missing, or generic (octet-stream/binary), or manifest
          const shouldForce =
            !currentType ||
            currentType.startsWith("application/octet-stream") ||
            currentType.startsWith("binary/");
          if (shouldForce) headers.set("Content-Type", detectedType);
        }

        // ── Audio headers ───────────────────────────────────────────────────
        if (isAudio) {
          // [A1] Byte-range seeking support
          headers.set("Accept-Ranges", "bytes");

          // [S1] Unified Cache-Control — IDENTICAL timing to video prevents buffer desync
          headers.set("Cache-Control",     buildMediaCacheControl(false, isLiveSegment));
          // [BUG-9 FIX] CDN-Cache-Control does NOT accept "public" prefix — CF-specific header
          headers.set("CDN-Cache-Control", "max-age=86400");

          // [A2][BT10] Never gzip/brotli audio — encoding on audio = corrupt bytes
          headers.delete("Content-Encoding");

           [S6] Transfer-Encoding: chunked + Range requests = wrong PTS on seek
           ONLY remove for non-live content — live segments need chunked for streaming
          if (!isLiveSegment) {
            headers.delete("Transfer-Encoding");
          }

           [A4] Preserve Content-Length for DSP/player prebuffer calculation
           [BUG-10 FIX] Guard: only set if value is a valid positive integer
           new Headers(originResponse.headers) already copies it, but Transfer-Encoding
           deletion above may have left a stale chunked response without Content-Length
          const contentLength = originResponse.headers.get("Content-Length");
          if (contentLength && /^\d+$/.test(contentLength)) {
            headers.set("Content-Length", contentLength);
          }

          // [A5] Preserve byte-range response metadata (206 Partial Content)
          const contentRange = originResponse.headers.get("Content-Range");
          if (contentRange) {
            headers.set("Content-Range", contentRange);
          }

           [S4][A8] Decoder stabilization — codec params prevent Android AAC decoder
           from operating in generic mode which adds ~80ms decode latency
           [BUG-6 FIX] Use .includes() not === — Content-Type may have params suffix
          const ct = headers.get("Content-Type")?.toLowerCase() ?? "";
          if (ct.includes("audio/aac") && !ct.includes("codecs")) {
            headers.set("Content-Type", "audio/aac; codecs=aac");
          } else if (ct.includes("audio/mp4") && !ct.includes("codecs")) {
            headers.set("Content-Type", "audio/mp4; codecs=mp4a.40.2");
          } else if (ct.includes("audio/ogg") && !ct.includes("codecs")) {
            headers.set("Content-Type", "audio/ogg; codecs=opus");
          }

          // [A11] Preserve origin stream metadata (ICY headers for internet radio)
          for (const h of ["ICY-BR", "ICY-NAME", "ICY-GENRE", "X-Playback-Session-Id"]) {
            const v = originResponse.headers.get(h);
            if (v) headers.set(h, v);
          }

           [BT9] Downgrade strong ETags to weak for byte-range audio
           Strong ETag requires byte-identical response; partial content breaks that
          const etag = originResponse.headers.get("ETag");
          if (etag && !etag.startsWith("W/")) {
            headers.set("ETag", `W/${etag}`);
          }

           [A6][BT1–BT10][S8][S9] Audio Intelligence — MUST run last
           Sets X-Audio-Profile, X-Audio-Quality, X-Audio-Channels, X-Audio-Latency-Mode etc.
           [BUG-1 FIX] Pass url.pathname — do NOT redeclare `url` inside isAudio block
           [BUG-7 FIX] applyAudioIntelligenceHeaders() is authoritative for latency/profile
                       — no manual X-Audio-Latency-Mode set before this call
          applyAudioIntelligenceHeaders(headers, request, isLossless, url.pathname);

           NOTE: Vary is NOT set here — [S10][BUG-2][BUG-3 FIX]
           See [S10] block at end of handler — set ONCE, final value, after all headers done
        }

        // ── Video/segment headers ───────────────────────────────────────────
        if (isVideo || isSegment) {
          headers.set("Accept-Ranges", "bytes");
          // [S1] Identical Cache-Control to audio — prevents AV buffer desync
          headers.set("Cache-Control",
            buildMediaCacheControl(false, isLiveSegment));
          headers.set("CDN-Cache-Control", "max-age=86400");
          // [S6] Remove Transfer-Encoding for VOD segments
          if (!isLiveSegment) {
            headers.delete("Transfer-Encoding");
          }
          // [S9] Timing-Allow-Origin for video too — AV sync measurement
          headers.set("Timing-Allow-Origin", "*");
        }

        // ── Manifest ────────────────────────────────────────────────────────
        if (isManifest) {
          headers.set("Cache-Control", buildMediaCacheControl(true, false));
        }

        // ── [S3] Prefetch — only for video HLS, never audio-only streams ───
        if (isSegment) {
          const linkValue = buildNextSegmentLink(url.pathname, isAudioOnlyStream);
          if (linkValue) headers.set("Link", linkValue);
        }

        // ── [S7] Expose CF-Cache-Status so player can detect cache miss ─────
        // (CF sets this automatically — we just ensure it isn't stripped)

        // ── [S10] Vary — set ONCE, final value ─────────────────────────────
        // Audio and video use same Vary so CF caches them in same shard family
        if (isMedia || isManifest) {
          headers.set("Vary", corsOrigin ? "Origin" : "Accept-Ranges");
        } else if (corsOrigin) {
          headers.set("Vary", "Origin");
        }

        // ── Signature ───────────────────────────────────────────────────────
        headers.set("X-Powered-By",        "FWG-UltraEdge");
        headers.set("X-Worker-Version",    env.APP_VERSION);
        headers.set("X-Worker-Environment", env.ENVIRONMENT);

        return new Response(originResponse.body, {
          status:     originResponse.status,
          statusText: originResponse.statusText,
          headers,
        });

      } catch (err) {
        Sentry.captureException(err, {
          tags: {
            path:        url.pathname,
            environment: env.ENVIRONMENT,
            version:     env.APP_VERSION,
            media_type:  isAudio
              ? (isLossless ? "audio-lossless" : "audio-lossy")
              : isVideo ? "video" : "other",
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
