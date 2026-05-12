// FWG-UltraEdge 🌍⚡ — src/middleware/streaming.ts
// Direct R2 body — no TransformStream loop
import type { Env } from "../types/env";

export function detectMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const MIME: Record<string,string> = {
    mp4:"video/mp4", webm:"video/webm", mov:"video/quicktime",
    mkv:"video/x-matroska", avi:"video/x-msvideo",
    m3u8:"application/vnd.apple.mpegurl", ts:"video/MP2T",
    mpd:"application/dash+xml", m4s:"video/iso.segment",
    jpg:"image/jpeg", png:"image/png", webp:"image/webp",
  };
  return MIME[ext] ?? "application/octet-stream";
}

export function parseRange(rangeHeader: string|null, totalSize: number): { start:number; end:number }|null {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  const start = match[1] ? parseInt(match[1]) : totalSize - parseInt(match[2]);
  const end   = match[2] ? parseInt(match[2]) : totalSize - 1;
  if (isNaN(start)||isNaN(end)||start>end||end>=totalSize) return null;
  return { start, end };
}

export async function streamR2Video(req: Request, env: Env, filename: string): Promise<Response> {
  const contentType = detectMimeType(filename);
  const rangeHeader = req.headers.get("Range");

  if (rangeHeader) {
    const head = await env.R2.head(filename);
    if (!head) return Response.json({ error: "Video not found" }, { status: 404 });
    const range = parseRange(rangeHeader, head.size);
    if (!range) return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
    const { start, end } = range;
    const obj = await env.R2.get(filename, { range: { offset: start, length: end - start + 1 } });
    if (!obj) return Response.json({ error: "Video not found" }, { status: 404 });
    return new Response(obj.body, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes ${start}-${end}/${head.size}`,
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
      },
    });
  }

  const obj = await env.R2.get(filename);
  if (!obj) return Response.json({ error: "Video not found" }, { status: 404 });
  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(obj.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "CDN-Cache-Control": "public, max-age=31536000, immutable",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
    },
  });
}

export async function proxyLiveStream(req: Request, originUrl: string): Promise<Response> {
  const upstream = await fetch(new Request(originUrl, {
    method: req.method,
    headers: { "Accept": req.headers.get("Accept")??"*/*", "Range": req.headers.get("Range")??"", "User-Agent": "FWG-UltraEdge/3.0 🌍⚡", "Cache-Control": "no-cache" },
  }));
  const headers = new Headers(upstream.headers);
  headers.set("X-Accel-Buffering", "no");
  headers.set("Cache-Control", "no-cache, no-store");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Powered-By", "FWG-UltraEdge 🌍⚡");
  return new Response(upstream.body, { status: upstream.status, headers });
}
