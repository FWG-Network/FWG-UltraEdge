// FWG-UltraEdge 🌍⚡ — src/middleware/fastLoad.ts
// Fast Load: HTTP/3 + Priority Hints + Client Hints + Minify JSON

export function applyPerformanceHeaders(res: Response, pathname: string): Response {
  const headers = new Headers(res.headers);
  headers.set("Alt-Svc", 'h3=":443"; ma=86400');
  headers.set("Priority", pathname.startsWith("/api/video") ? "u=3, i" : "u=1, i");
  headers.set("Connection", "keep-alive");
  headers.set("Keep-Alive", "timeout=60, max=1000");
  headers.set("X-DNS-Prefetch-Control", "on");
  headers.set("Accept-CH", "Downlink, ECT, RTT, Save-Data");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (pathname.startsWith("/api/video")) {
    headers.set("Accept-Ranges", "bytes");
    headers.set("Timing-Allow-Origin", "*");
    headers.set("X-Accel-Buffering", "no");
  }
  if (pathname === "/health") {
    headers.set("CF-Cache-Status", "BYPASS");
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function minifyJsonResponse(res: Response): Promise<Response> {
  const ct = res.headers.get("Content-Type") ?? "";
  if (!ct.includes("application/json")) return res;
  try {
    const json = await res.json();
    const minified = JSON.stringify(json);
    const headers = new Headers(res.headers);
    headers.set("Content-Length", String(new TextEncoder().encode(minified).length));
    return new Response(minified, { status: res.status, headers });
  } catch {
    return res;
  }
}

export async function withFastLoad(
  req: Request,
  next: (req: Request) => Promise<Response>
): Promise<Response> {
  const pathname = new URL(req.url).pathname;
  let res = await next(req);
  res = applyPerformanceHeaders(res, pathname);
  if (!pathname.startsWith("/api/video")) res = await minifyJsonResponse(res);
  return res;
}
