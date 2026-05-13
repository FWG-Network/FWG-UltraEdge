/// <reference types="@cloudflare/workers-types" />

// ═══════════════════════════════════════════════════════════════
// WORKER #6 — UNIVERSAL VIDEO HUB v2.0
// NETFLIX SYSTEM STANDARD — Enterprise Grade
// ═══════════════════════════════════════════════════════════════

const WORKER_VERSION = "2.0.0";

// ─── Video catalog (extend freely) ───────────────────────────

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

// ─── HTML Builder ─────────────────────────────────────────────

function buildHomePage(catalog: VideoItem[]): string {
  const cards = catalog.map(v => `
    <div class="card" onclick="openVideo('${v.embedUrl}','${v.title.replace(/'/g,"\\'")}')">
      <div class="thumb">
        <img src="${v.thumb}" alt="${v.title}" loading="lazy" onerror="this.style.display='none'"/>
        <div class="play-btn">▶</div>
        <div class="badge">${v.quality}</div>
        <div class="duration">${v.duration}</div>
      </div>
      <div class="info">
        <div class="cat">${v.category}</div>
        <div class="ttl">${v.title}</div>
      </div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="km">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<meta name="theme-color" content="#0a0a0f"/>
<title>Universal Video Hub</title>
<style>
  /* ── Reset ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Design Tokens ── */
  :root {
    --bg:        #0a0a0f;
    --surface:   #141418;
    --surface2:  #1e1e26;
    --accent:    #e50914;
    --accent2:   #ff1a1a;
    --text:      #f0f0f0;
    --muted:     #888;
    --radius:    10px;
    --font:      'Segoe UI', system-ui, sans-serif;
    --trans:     0.25s cubic-bezier(.4,0,.2,1);
  }

  html, body {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Header ── */
  .header {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    background: linear-gradient(180deg, rgba(10,10,15,0.98) 0%, rgba(10,10,15,0) 100%);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }

  .logo {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: var(--accent);
    text-shadow: 0 0 30px rgba(229,9,20,0.5);
  }

  .version {
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  /* ── Hero Banner ── */
  .hero {
    padding: 32px 24px 16px;
    background: linear-gradient(135deg, rgba(229,9,20,0.08) 0%, transparent 60%);
  }

  .hero h1 {
    font-size: clamp(20px, 5vw, 32px);
    font-weight: 800;
    letter-spacing: -0.5px;
    margin-bottom: 6px;
  }

  .hero p {
    font-size: 14px;
    color: var(--muted);
  }

  /* ── Section ── */
  .section { padding: 16px 0 8px; }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--muted);
    padding: 0 24px;
    margin-bottom: 12px;
  }

  /* ── Grid ── */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
    padding: 0 24px 24px;
  }

  /* ── Card ── */
  .card {
    background: var(--surface);
    border-radius: var(--radius);
    overflow: hidden;
    cursor: pointer;
    position: relative;
    transition: transform var(--trans), box-shadow var(--trans);
    border: 1px solid rgba(255,255,255,0.05);
  }

  .card:hover {
    transform: scale(1.04) translateY(-2px);
    box-shadow: 0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(229,9,20,0.3);
    z-index: 2;
  }

  .card:active { transform: scale(0.98); }

  /* ── Thumbnail ── */
  .thumb {
    position: relative;
    aspect-ratio: 16/9;
    background: var(--surface2);
    overflow: hidden;
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform var(--trans);
  }

  .card:hover .thumb img { transform: scale(1.08); }

  /* ── Play button overlay ── */
  .play-btn {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    background: rgba(0,0,0,0);
    color: white;
    opacity: 0;
    transition: opacity var(--trans), background var(--trans);
  }

  .card:hover .play-btn {
    opacity: 1;
    background: rgba(0,0,0,0.45);
  }

  /* ── Badge / Duration ── */
  .badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--accent);
    color: white;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1px;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .duration {
    position: absolute;
    bottom: 6px;
    right: 8px;
    font-size: 10px;
    color: rgba(255,255,255,0.85);
    background: rgba(0,0,0,0.7);
    padding: 1px 5px;
    border-radius: 3px;
  }

  /* ── Card info ── */
  .info { padding: 10px 12px 12px; }

  .cat {
    font-size: 10px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 3px;
    font-weight: 700;
  }

  .ttl {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Modal / Player ── */
  .modal {
    display: none;
    position: fixed;
    inset: 0;
    background: #000;
    z-index: 1000;
    flex-direction: column;
  }

  .modal.open { display: flex; }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: linear-gradient(180deg, rgba(0,0,0,0.9) 0%, transparent 100%);
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
  }

  .modal-title {
    font-size: 15px;
    font-weight: 700;
    color: white;
    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255,255,255,0.15);
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    transition: background var(--trans);
  }

  .close-btn:hover { background: rgba(229,9,20,0.6); }

  .player-wrap {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  iframe, video {
    width: 100vw;
    height: 100vh;
    border: none;
    object-fit: cover;
  }

  /* ── Footer ── */
  .footer {
    text-align: center;
    padding: 20px;
    font-size: 11px;
    color: var(--muted);
    border-top: 1px solid rgba(255,255,255,0.04);
  }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--surface2); border-radius: 2px; }

  /* ── Mobile ── */
  @media (max-width: 480px) {
    .grid { grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 0 12px 20px; }
    .hero, .section-title { padding-left: 12px; padding-right: 12px; }
  }
</style>
</head>
<body>

<header class="header">
  <div class="logo">🎬 Video Hub</div>
  <div class="version">v${WORKER_VERSION}</div>
</header>

<div class="hero">
  <h1>Universal Video Hub</h1>
  <p>Netflix System Standard — Enterprise Grade</p>
</div>

<div class="section">
  <div class="section-title">🔥 Trending Now</div>
  <div class="grid">${cards}</div>
</div>

<!-- Player Modal -->
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
  Ultra-Edge Deploy · Cloudflare Workers · v${WORKER_VERSION}
</footer>

<script>
(function() {
  var modal  = document.getElementById('modal');
  var player = document.getElementById('player');
  var title  = document.getElementById('modal-title');

  function openVideo(url, name) {
    player.src = url;
    title.textContent = name || '';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Request fullscreen (mobile-friendly)
    var el = modal;
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
    if (req) { try { req.call(el); } catch(e) {} }
  }

  function closeVideo() {
    modal.classList.remove('open');
    player.src = '';
    document.body.style.overflow = '';
    if (document.exitFullscreen)       { try { document.exitFullscreen(); }       catch(e) {} }
    if (document.webkitExitFullscreen) { try { document.webkitExitFullscreen(); } catch(e) {} }
  }

  // Expose globally
  window.openVideo  = openVideo;
  window.closeVideo = closeVideo;

  // ESC key closes player
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeVideo();
  });

  // Click outside player closes modal
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeVideo();
  });
})();
</script>
</body>
</html>`;
}

// ─── Direct video player page ─────────────────────────────────

function buildPlayerPage(videoUrl: string): string {
  const isMP4    = videoUrl.endsWith(".mp4") || videoUrl.includes(".mp4?");
  const isM3U8   = videoUrl.includes(".m3u8");

  let playerHtml: string;
  if (isMP4 || isM3U8) {
    playerHtml = `<video src="${videoUrl}" controls autoplay playsinline
      style="width:100vw;height:100vh;object-fit:cover;border:none;background:#000"></video>`;
  } else {
    playerHtml = `<iframe src="${videoUrl}"
      allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
      allowfullscreen referrerpolicy="no-referrer"
      style="width:100vw;height:100vh;border:none;background:#000"></iframe>`;
  }

  return `<!DOCTYPE html>
<html lang="km">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<meta name="theme-color" content="#000000"/>
<title>Player — Video Hub</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%; height: 100%;
    background: #000;
    overflow: hidden;
  }
  .wrap {
    width: 100vw; height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
  }
</style>
</head>
<body>
<div class="wrap">${playerHtml}</div>
</body>
</html>`;
}

// ─── YouTube URL → embed ──────────────────────────────────────

function toYouTubeEmbed(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      const id = u.searchParams.get("v")
        || u.pathname.split("/").filter(Boolean).pop()
        || "";
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
    }
  } catch (_err) { /* passthrough */ }
  return rawUrl;
}

// ─── Main Worker ──────────────────────────────────────────────

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const HEADERS = {
      "content-type":              "text/html;charset=UTF-8",
      "content-security-policy":   "frame-ancestors *",
      "x-worker-version":          WORKER_VERSION,
      "x-content-type-options":    "nosniff",
      "cache-control":             "no-store",
    };

    // ── Health check ─────────────────────────────────────────
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", version: WORKER_VERSION }, {
        headers: { "cache-control": "no-store" },
      });
    }

    // ── Direct video player (/?v=URL) ─────────────────────────
    const v = url.searchParams.get("v");
    if (v) {
      const embedUrl = toYouTubeEmbed(decodeURIComponent(v));
      return new Response(buildPlayerPage(embedUrl), { headers: HEADERS });
    }

    // ── Home page (Netflix UI) ────────────────────────────────
    return new Response(buildHomePage(CATALOG), { headers: HEADERS });
  },
} satisfies ExportedHandler;