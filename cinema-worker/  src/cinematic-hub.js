/// <reference types="@cloudflare/workers-types" />
import { withSentry } from "@sentry/cloudflare";   // [GAP-1]
import * as Sentry    from "@sentry/cloudflare";    // [GAP-1]

// ═══════════════════════════════════════════════════════════════════════════════
// WORKER #6 — UNIVERSAL VIDEO HUB v2.1.0
// FWG-UltraEdge Standard — Synced with index.ts v3.3.0
// ═══════════════════════════════════════════════════════════════════════════
//
   Gaps closed vs v2.0.0 (synced with index.ts architecture):
   [GAP-1]  Sentry error tracking via withSentry() + captureException
   [GAP-2]  UA gate — same BLOCKED_UA_RE as index.ts
   [GAP-3]  Rate limiting via KV — same isRateLimited() pattern
   [GAP-4]  CSP corrected for video hub:
            - frame-ancestors * preserved (embed is intentional)
            - script-src 'self' 'unsafe-inline' added (inline <script> block)
            - style-src 'self' 'unsafe-inline' added (inline <style> block)
            - img-src includes img.youtube.com (thumbnails)
            - media-src * (video embeds from external origins)
            - frame-src * (YouTube/external iframes)
   [GAP-5]  HSTS header added
   [GAP-6]  X-Frame-Options SAMEORIGIN (HTML pages, not player embeds)
            X-Content-Type-Options: nosniff
            Referrer-Policy: strict-origin-when-cross-origin
   [GAP-7]  Env interface added — matches index.ts Env shape
   [GAP-8]  URL sanitisation: ?v= param validated https:// + allowlisted hosts
   [GAP-9]  escapeHtml() applied to all catalog fields interpolated into HTML
   [GAP-10] /health requires X-Health-Token (matches HEALTH_CHECK_TOKEN secret)
   [GAP-12] X-Powered-By + X-Worker-Version + X-Worker-Environment signature

const WORKER_VERSION = "2.1.0";

// ─── Env interface — matches index.ts Env shape ───────────────────────────────
export interface Env {
  // 🔐 Secrets — wrangler secret put <NAME> --env <production|staging>
  SENTRY_DSN:         string;
  HEALTH_CHECK_TOKEN: string;   // [GAP-10]

  // Bindings (shared with index.ts)
  ULTRA_EDGE_KV:     KVNamespace;

  // Vars
  ENVIRONMENT:       string;
  APP_NAME:          string;
  APP_VERSION:       string;
  RATE_LIMIT_MAX:    string;
  RATE_LIMIT_WINDOW: string;
}

// ─── Video catalog ─────────────────────────────────────────────────────────────
interface VideoItem {
  id:       string;
  title:    string;
  category: string;
  thumb:    string;
  embedUrl: string;
  duration: string;
  quality:  "4K" | "HD" | "SD";
}

const CATALOG: VideoItem[] = [
  {
    id:       "yt-1",
    title:    "Featured #1",
    category: "Trending",
    thumb:    "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0",
    duration: "3:33",
    quality:  "HD",
  },
  {
    id:       "yt-2",
    title:    "Featured #2",
    category: "Trending",
    thumb:    "https://img.youtube.com/vi/ysz5S6PUM-U/mqdefault.jpg",
    embedUrl: "https://www.youtube.com/embed/ysz5S6PUM-U?autoplay=1&rel=0",
    duration: "4:12",
    quality:  "HD",
  },
];

// ─── [GAP-2] UA gate — identical to index.ts ──────────────────────────────────
const BLOCKED_UA_RE =
  /^\s*$|curl\/|wget\/|python[-/\s]|python-requests|go-http-client|java\/|libwww-perl|scrapy|mechanize/i;

function isBlockedUA(request: Request): boolean {
  const ua = request.headers.get("User-Agent") ?? "";
  return BLOCKED_UA_RE.test(ua);
}

// ─── [GAP-3] Rate limiting — identical to index.ts ────────────────────────────
async function isRateLimited(request: Request, env: Env): Promise<boolean> {
  try {
    const ip         = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const key        = `ratelimit:hub:${ip}`;              // hub: prefix avoids KV collision
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

// ─── [GAP-8] URL sanitisation for ?v= param ───────────────────────────────────
// Allowlisted embed hosts — expand as needed
const ALLOWED_EMBED_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "youtu.be",
  "player.vimeo.com",
  "www.dailymotion.com",
  "fast.wistia.net",
]);

function sanitiseVideoUrl(raw: string): string | null {
  try {
    const decoded = decodeURIComponent(raw);
    const u = new URL(decoded);

    // [GAP-8] Must be HTTPS — blocks javascript: data: blob: etc.
    if (u.protocol !== "https:") return null;

    // Must be an allowlisted embed host
    if (!ALLOWED_EMBED_HOSTS.has(u.hostname)) return null;

    return decoded;
  } catch {
    return null;
  }
}

// ─── YouTube URL → embed ───────────────────────────────────────────────────────
function toYouTubeEmbed(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const id = u.searchParams.get("v")
        || u.pathname.split("/").filter(Boolean).pop()
        || "";
      if (id && /^[a-zA-Z0-9_-]{6,16}$/.test(id)) {
        // [GAP-8] Validate YouTube ID format — prevents path traversal
        return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      }
    }
  } catch { /* passthrough */ }
  return rawUrl;
}

// ─── [GAP-9] HTML escaping — applied to all catalog fields ────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#x27;");
}

// ─── [GAP-4] CSP builder for video hub ────────────────────────────────────────
// Different from index.ts CSP — player hub has specific needs:
//   script-src 'unsafe-inline' — inline <script> in HTML pages
//   frame-src * — embed YouTube/Vimeo/etc
//   media-src * — video streams
//   frame-ancestors * — allow hub to be embedded (intentional)
function buildHubCSP(isPlayerPage: boolean): string {
  return [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",                 // inline JS in HTML
    "style-src 'self' 'unsafe-inline'",                  // inline CSS in HTML
    `img-src 'self' data: https://img.youtube.com https://i.vimeocdn.com`,
    "media-src *",                                       // video streams
    isPlayerPage ? "frame-src *" : "frame-src 'none'",   // player needs frames
    "connect-src 'self'",
    "frame-ancestors *",                                 // [GAP-4] intentional embed
    "base-uri 'none'",
    "form-action 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

// ─── Security headers builder — synced with index.ts pattern ──────────────────
function buildPageHeaders(
  env:          Env,
  isPlayerPage: boolean = false,
): Headers {
  const h = new Headers();

  // Content
  h.set("Content-Type",    "text/html; charset=UTF-8");
  h.set("Cache-Control",   "no-store");                  // HTML pages never cached

  // [GAP-4] Correct CSP for video hub
  h.set("Content-Security-Policy", buildHubCSP(isPlayerPage));

  // [GAP-5] HSTS — same as index.ts
  h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  // [GAP-6] Standard security headers
  // Note: X-Frame-Options SAMEORIGIN for HTML shell; player pages use CSP frame-ancestors
  h.set("X-Frame-Options",        isPlayerPage ? "SAMEORIGIN" : "SAMEORIGIN");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy",        "strict-origin-when-cross-origin");

  // Cross-Origin isolation (HTML shell — not media)
  h.set("Cross-Origin-Opener-Policy",   "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "unsafe-none"); // player iframes need this relaxed

  // [GAP-12] Observability signature — same pattern as index.ts
  h.set("X-Powered-By",         "FWG-UltraEdge");
  h.set("X-Worker-Version",     env.APP_VERSION ?? WORKER_VERSION);
  h.set("X-Worker-Environment", env.ENVIRONMENT ?? "production");

  return h;
}

// ─── HTML Builder ─────────────────────────────────────────────────────────────
function buildHomePage(catalog: VideoItem[], env: Env): string {
  // [GAP-9] escapeHtml() on all interpolated catalog fields
  const cards = catalog.map(v => `
    <div class="card" onclick="openVideo('${escapeHtml(v.embedUrl)}','${escapeHtml(v.title).replace(/'/g, "\\'")}')">
      <div class="thumb">
        <img src="${escapeHtml(v.thumb)}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="this.style.display='none'"/>
        <div class="play-btn">▶</div>
        <div class="badge">${escapeHtml(v.quality)}</div>
        <div class="duration">${escapeHtml(v.duration)}</div>
      </div>
      <div class="info">
        <div class="cat">${escapeHtml(v.category)}</div>
        <div class="ttl">${escapeHtml(v.title)}</div>
      </div>
    </div>`).join("");

  const version = escapeHtml(env.APP_VERSION ?? WORKER_VERSION);

  return `<!DOCTYPE html>
<html lang="km">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<meta name="theme-color" content="#0a0a0f"/>
<title>Universal Video Hub</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:      #0a0a0f;
    --surface: #141418;
    --surface2:#1e1e26;
    --accent:  #e50914;
    --text:    #f0f0f0;
    --muted:   #888;
    --radius:  10px;
    --font:    'Segoe UI', system-ui, sans-serif;
    --trans:   0.25s cubic-bezier(.4,0,.2,1);
  }
  html, body { height:100%; background:var(--bg); color:var(--text); font-family:var(--font); overflow-x:hidden; -webkit-font-smoothing:antialiased; }
  .header { position:sticky; top:0; z-index:50; display:flex; align-items:center; justify-content:space-between; padding:16px 24px; background:linear-gradient(180deg,rgba(10,10,15,.98) 0%,rgba(10,10,15,0) 100%); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border-bottom:1px solid rgba(255,255,255,.04); }
  .logo { font-size:22px; font-weight:800; letter-spacing:-0.5px; color:var(--accent); text-shadow:0 0 30px rgba(229,9,20,.5); }
  .version { font-size:11px; color:var(--muted); letter-spacing:1px; text-transform:uppercase; }
  .hero { padding:32px 24px 16px; background:linear-gradient(135deg,rgba(229,9,20,.08) 0%,transparent 60%); }
  .hero h1 { font-size:clamp(20px,5vw,32px); font-weight:800; letter-spacing:-0.5px; margin-bottom:6px; }
  .hero p { font-size:14px; color:var(--muted); }
  .section { padding:16px 0 8px; }
  .section-title { font-size:13px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:var(--muted); padding:0 24px; margin-bottom:12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px; padding:0 24px 24px; }
  .card { background:var(--surface); border-radius:var(--radius); overflow:hidden; cursor:pointer; position:relative; transition:transform var(--trans),box-shadow var(--trans); border:1px solid rgba(255,255,255,.05); }
  .card:hover { transform:scale(1.04) translateY(-2px); box-shadow:0 16px 48px rgba(0,0,0,.6),0 0 0 1px rgba(229,9,20,.3); z-index:2; }
  .card:active { transform:scale(.98); }
  .thumb { position:relative; aspect-ratio:16/9; background:var(--surface2); overflow:hidden; }
  .thumb img { width:100%; height:100%; object-fit:cover; transition:transform var(--trans); }
  .card:hover .thumb img { transform:scale(1.08); }
  .play-btn { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:28px; background:rgba(0,0,0,0); color:white; opacity:0; transition:opacity var(--trans),background var(--trans); }
  .card:hover .play-btn { opacity:1; background:rgba(0,0,0,.45); }
  .badge { position:absolute; top:8px; right:8px; background:var(--accent); color:white; font-size:9px; font-weight:800; letter-spacing:1px; padding:2px 6px; border-radius:4px; }
  .duration { position:absolute; bottom:6px; right:8px; font-size:10px; color:rgba(255,255,255,.85); background:rgba(0,0,0,.7); padding:1px 5px; border-radius:3px; }
  .info { padding:10px 12px 12px; }
  .cat { font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:var(--accent); margin-bottom:3px; font-weight:700; }
  .ttl { font-size:13px; font-weight:600; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .modal { display:none; position:fixed; inset:0; background:#000; z-index:1000; flex-direction:column; }
  .modal.open { display:flex; }
  .modal-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; background:linear-gradient(180deg,rgba(0,0,0,.9) 0%,transparent 100%); position:absolute; top:0; left:0; right:0; z-index:10; }
  .modal-title { font-size:15px; font-weight:700; color:white; text-shadow:0 1px 4px rgba(0,0,0,.8); }
  .close-btn { width:36px; height:36px; border-radius:50%; background:rgba(255,255,255,.15); border:none; color:white; font-size:20px; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(8px); transition:background var(--trans); }
  .close-btn:hover { background:rgba(229,9,20,.6); }
  .player-wrap { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
  iframe, video { width:100vw; height:100vh; border:none; object-fit:cover; }
  .footer { text-align:center; padding:20px; font-size:11px; color:var(--muted); border-top:1px solid rgba(255,255,255,.04); }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-track { background:var(--bg); }
  ::-webkit-scrollbar-thumb { background:var(--surface2); border-radius:2px; }
  @media (max-width:480px) { .grid { grid-template-columns:repeat(2,1fr); gap:8px; padding:0 12px 20px; } .hero, .section-title { padding-left:12px; padding-right:12px; } }
</style>
</head>
<body>
<header class="header">
  <div class="logo">🎬 Video Hub</div>
  <div class="version">v${version}</div>
</header>
<div class="hero">
  <h1>Universal Video Hub</h1>
  <p>FWG-UltraEdge Standard — Enterprise Grade</p>
</div>
<div class="section">
  <div class="section-title">🔥 Trending Now</div>
  <div class="grid">${cards}</div>
</div>
<div class="modal" id="modal" role="dialog" aria-modal="true">
  <div class="modal-header">
    <div class="modal-title" id="modal-title"></div>
    <button class="close-btn" onclick="closeVideo()" aria-label="Close">✕</button>
  </div>
  <div class="player-wrap">
    <iframe id="player"
      allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
      allowfullscreen
      referrerpolicy="no-referrer">
    </iframe>
  </div>
</div>
<footer class="footer">
  FWG-UltraEdge · Cloudflare Workers · v${version}
</footer>
<script>
(function() {
  var modal  = document.getElementById('modal');
  var player = document.getElementById('player');
  var title  = document.getElementById('modal-title');

  function openVideo(url, name) {
    // [GAP-8] Client-side guard — must be https://
    if (!url || !url.startsWith('https://')) return;
    player.src = url;
    title.textContent = name || '';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    var req = modal.requestFullscreen || modal.webkitRequestFullscreen || modal.mozRequestFullScreen;
    if (req) { try { req.call(modal); } catch(e) {} }
  }

  function closeVideo() {
    modal.classList.remove('open');
    player.src = '';
    document.body.style.overflow = '';
    if (document.exitFullscreen)       { try { document.exitFullscreen();       } catch(e) {} }
    if (document.webkitExitFullscreen) { try { document.webkitExitFullscreen(); } catch(e) {} }
  }

  window.openVideo  = openVideo;
  window.closeVideo = closeVideo;

  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeVideo(); });
  modal.addEventListener('click',      function(e) { if (e.target === modal)  closeVideo(); });
})();
</script>
</body>
</html>`;
}

// ─── Direct video player page ─────────────────────────────────────────────────
function buildPlayerPage(videoUrl: string, env: Env): string {
  // [GAP-9] videoUrl already validated by sanitiseVideoUrl() before this call
  const isMP4  = /\.mp4(\?|$)/i.test(videoUrl);
  const isM3U8 = videoUrl.includes(".m3u8");
  const safeUrl = escapeHtml(videoUrl);

  const playerHtml = (isMP4 || isM3U8)
    ? `<video src="${safeUrl}" controls autoplay playsinline
         style="width:100vw;height:100vh;object-fit:cover;border:none;background:#000"></video>`
    : `<iframe src="${safeUrl}"
         allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
         allowfullscreen referrerpolicy="no-referrer"
         style="width:100vw;height:100vh;border:none;background:#000"></iframe>`;

  const version = escapeHtml(env.APP_VERSION ?? WORKER_VERSION);

  return `<!DOCTYPE html>
<html lang="km">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<meta name="theme-color" content="#000000"/>
<title>Player — Video Hub</title>
<style>
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; background:#000; overflow:hidden; }
  .wrap { width:100vw; height:100vh; display:flex; align-items:center; justify-content:center; background:#000; }
</style>
</head>
<body>
<div class="wrap">${playerHtml}</div>
</body>
</html>`;
}

// ─── Main Worker — wrapped with Sentry [GAP-1] ────────────────────────────────
export default withSentry(
  (env: Env) => ({
    dsn:              env.SENTRY_DSN,
    tracesSampleRate: env.ENVIRONMENT === "production" ? 0.1 : 1.0,
    environment:      env.ENVIRONMENT,
    release:          `${env.APP_NAME ?? "VideoHub"}@${env.APP_VERSION ?? WORKER_VERSION}`,
  }),
  {
    async fetch(
      request: Request,
      env:     Env,
      _ctx:    ExecutionContext,
    ): Promise<Response> {

      const url = new URL(request.url);

      // ── [GAP-2] UA gate ──────────────────────────────────────────────────────
      if (isBlockedUA(request)) {
        return new Response("Forbidden", {
          status: 403, headers: { "Content-Type": "text/plain" },
        });
      }

      // ── [GAP-3] Rate limiting ────────────────────────────────────────────────
      if (await isRateLimited(request, env)) {
        return new Response("Too Many Requests", {
          status: 429,
          headers: {
            "Content-Type": "text/plain",
            "Retry-After":  env.RATE_LIMIT_WINDOW ?? "60",
          },
        });
      }

      try {
        // ── [GAP-10] Health check — token required ─────────────────────────────
        if (url.pathname === "/health") {
          const token = request.headers.get("X-Health-Token") ?? "";
          if (!env.HEALTH_CHECK_TOKEN || token !== env.HEALTH_CHECK_TOKEN) {
            return new Response("Unauthorized", {
              status: 401, headers: { "Content-Type": "text/plain" },
            });
          }
          return Response.json(
            { status: "ok", version: env.APP_VERSION ?? WORKER_VERSION },
            { headers: { "Cache-Control": "no-store" } },
          );
        }

        // ── Direct video player /?v=URL ────────────────────────────────────────
        const v = url.searchParams.get("v");
        if (v) {
          // [GAP-8] Sanitise + validate before use
          const safeUrl = sanitiseVideoUrl(v);
          if (!safeUrl) {
            return new Response("Invalid video URL", {
              status: 400, headers: { "Content-Type": "text/plain" },
            });
          }
          const embedUrl = toYouTubeEmbed(safeUrl);
          const headers  = buildPageHeaders(env, true);
          return new Response(buildPlayerPage(embedUrl, env), { headers });
        }

        // ── Home page ──────────────────────────────────────────────────────────
        const headers = buildPageHeaders(env, false);
        return new Response(buildHomePage(CATALOG, env), { headers });

      } catch (err) {
        // [GAP-1] Report all errors to Sentry with full context
        Sentry.captureException(err, {
          tags: {
            path:        url.pathname,
            environment: env.ENVIRONMENT ?? "unknown",
            version:     env.APP_VERSION ?? WORKER_VERSION,
            worker:      "video-hub-6",
          },
        });

        return new Response("Service Unavailable", {
          status:  503,
          headers: { "Content-Type": "text/plain", "Retry-After": "30" },
        });
      }
    },
  },
) satisfies ExportedHandler<Env>;
