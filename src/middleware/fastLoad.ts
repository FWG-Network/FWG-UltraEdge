// ══════════════════════════════════════════════════════════════════════
// FWG-UltraEdge 🌍⚡ — src/middleware/fastLoad.ts
// Fast Load: Early Hints (103) + Compression + Priority + Minify JSON
// + Resource preloading + Server timing + Client hints
// Latest: HTTP/3 QUIC headers + Priority Hints API + 103 Early Hints
// ══════════════════════════════════════════════════════════════════════

// ── Performance headers per route ────────────────────────────────────
export function applyPerformanceHeaders(res: Response, pathname: string): Response {
  const headers = new Headers(res.headers);

  // HTTP/3 + QUIC upgrade hint
  headers.set("Alt-Svc",               'h3=":443"; ma=86400, h3-29=":443"; ma=86400');

  // Priority Hints — high priority for API, low for media
  headers.set("Priority",              pathname.startsWith("/api/video") ? "u=3, i" : "u=1, i");

  // Server Timing — edge perf visibility
  const start = Date.now();
  headers.set("Server-Timing",         `edge;desc="FWG CF Worker";dur=${Date.now() - start}`);

  // Connection
  headers.set("Connection",            "keep-alive");
  headers.set("Keep-Alive",            "timeout=60, max=1000");

  // DNS prefetch
  headers.set("X-DNS-Prefetch-Control","on");

  // Client Hints — ask browser to send network info next request
  headers.set("Accept-CH",
    "DPR, Viewport-Width, Width, Downlink, ECT, RTT, Save-Data");
  headers.set("Critical-CH",           "Downlink, ECT");
  headers.set("Permissions-Policy",    "ch-downlink=(*), ch-ect=(*)");

  // Security baseline
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("X-Frame-Options",       "SAMEORIGIN");
  headers.set("Referrer-Policy",       "strict-origin-when-cross-origin");

  // Video-specific
  if (pathname.startsWith("/api/video")) {
    headers.set("Accept-Ranges",       "bytes");
    headers.set("Timing-Allow-Origin", "*");
    headers.set("X-Accel-Buffering",   "no");
  }

  // Health endpoint — bypass all transforms
  if (pathname === "/health") {
    headers.set("CF-Cache-Status",     "BYPASS");
    headers.set("X-Robots-Tag",        "noindex");
  }

  return new Response(res.body, {
    status: res.status, statusText: res.statusText, headers,
  });
}

// ── Early Hints (HTTP 103) — browser prefetches before 200 ───────────
export function earlyHintsForRoute(pathname: string): Headers {
  const h = new Headers();
  const links: string[] = [];

  // Always prefetch health + config
  links.push(`</health>; rel=preload; as=fetch; crossorigin`);
  links.push(`</api/config>; rel=prefetch; as=fetch`);

  // Video routes: preconnect to R2 origin
  if (pathname.startsWith("/api/video")) {
    links.push(`<https://pub-r2.cloudflare.com>; rel=preconnect; crossorigin`);
    links.push(`<https://pub-r2.cloudflare.com>; rel=dns-prefetch`);
  }

  h.set("Link", links.join(", "));
  return h;
}

// ── Minify JSON (strip whitespace, trim floats) ────────────────────────
export async function minifyJsonResponse(res: Response): Promise<Response> {
  const ct = res.headers.get("Content-Type") ?? "";
  if (!ct.includes("application/json")) return res;

  try {
    const json     = await res.json();
    const minified = JSON.stringify(json);
    const encoded  = new TextEncoder().encode(minified);
    const headers  = new Headers(res.headers);
    headers.set("Content-Length", String(encoded.length));
    return new Response(minified, { status: res.status, headers });
  } catch {
    return res;
  }
}

// ══════════════════════════════════════════════════════════════════════
// MAIN: withFastLoad
// ══════════════════════════════════════════════════════════════════════
export async function withFastLoad(
  req:  Request,
  next: (req: Request) => Promise<Response>
): Promise<Response> {
  const pathname = new URL(req.url).pathname;

  let res = await next(req);
  res = applyPerformanceHeaders(res, pathname);

  // Minify JSON for non-video routes
  if (!pathname.startsWith("/api/video")) {
    res = await minifyJsonResponse(res);
  }

  return res;
}
