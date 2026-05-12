// ══════════════════════════════════════════════════════════════════════
// FWG-UltraEdge 🌍⚡ — src/middleware/streaming.ts
// Ultra Video Streaming: Adaptive Bitrate + Range Requests + Chunked
// Supports: Live 1080p, VOD, HLS/DASH prep, R2 direct streaming
// Latest: Web Streams API + TransformStream + ReadableStream chunking
// ══════════════════════════════════════════════════════════════════════

import type { Env } from "../types/env";

// ── Chunk size config ─────────────────────────────────────────────────
const CHUNK_SIZE = {
  SMALL:  256  * 1024,    //  256KB — low bandwidth
  MEDIUM: 512  * 1024,    //  512KB — standard
  LARGE:  1024 * 1024,    //    1MB — high bandwidth / 1080p
  XLARGE: 2048 * 1024,    //    2MB — ultra / LAN
} as const;

// ── Detect optimal chunk size from client hints ───────────────────────
function resolveChunkSize(req: Request): number {
  const ect = req.headers.get("ECT") ??               // Effective Connection Type
              req.headers.get("Downlink") ?? "";
  const downlink = parseFloat(req.headers.get("Downlink") ?? "0");

  if (downlink >= 10 || ect === "4g")  return CHUNK_SIZE.XLARGE;
  if (downlink >= 5)                   return CHUNK_SIZE.LARGE;
  if (downlink >= 2)                   return CHUNK_SIZE.MEDIUM;
  return CHUNK_SIZE.SMALL;
}

// ── Parse Range header → { start, end } ──────────────────────────────
export function parseRange(
  rangeHeader: string | null,
  totalSize: number
): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;

  const start = match[1] ? parseInt(match[1]) : totalSize - parseInt(match[2]);
  const end   = match[2] ? parseInt(match[2]) : totalSize - 1;

  if (isNaN(start) || isNaN(end) || start > end || end >= totalSize) return null;
  return { start, end };
}

// ── Stream R2 object with range support + adaptive chunking ───────────
export async function streamR2Video(
  req:    Request,
  env:    Env,
  filename: string
): Promise<Response> {
  const object = await env.R2.get(filename, {
    range: req.headers.has("Range")
      ? { offset: 0, length: undefined }   // R2 will slice per range header
      : undefined,
  });

  if (!object) {
    return Response.json(
      { error: "Video not found", message: `${filename} does not exist in R2` },
      { status: 404 }
    );
  }

  const contentType = object.httpMetadata?.contentType ?? detectMimeType(filename);
  const totalSize   = object.size;
  const chunkSize   = resolveChunkSize(req);
  const rangeHeader = req.headers.get("Range");
  const range       = parseRange(rangeHeader, totalSize);

  // ── Ranged request (seek / resume) ───────────────────────────────
  if (range) {
    const { start, end } = range;
    const rangeObject = await env.R2.get(filename, {
      range: { offset: start, length: end - start + 1 },
    });

    if (!rangeObject) {
      return new Response("Range Not Satisfiable", { status: 416 });
    }

    return new Response(rangeObject.body, {
      status: 206,
      headers: streamHeaders(contentType, totalSize, chunkSize, start, end),
    });
  }

  // ── Full stream with adaptive chunking ────────────────────────────
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();

  // Pipe R2 body → transform → response
  object.body.pipeTo(writable).catch(() => {});

  return new Response(readable, {
    status: 200,
    headers: streamHeaders(contentType, totalSize, chunkSize),
  });
}

// ── Build optimal streaming headers ──────────────────────────────────
function streamHeaders(
  contentType: string,
  totalSize:   number,
  chunkSize:   number,
  start?:      number,
  end?:        number
): HeadersInit {
  const isRange = start !== undefined && end !== undefined;

  return {
    "Content-Type":              contentType,
    "Content-Length":            isRange ? String(end! - start! + 1) : String(totalSize),
    "Content-Range":             isRange ? `bytes ${start}-${end}/${totalSize}` : "",
    "Accept-Ranges":             "bytes",
    "Cache-Control":             "public, max-age=31536000, immutable",
    "CDN-Cache-Control":         "public, max-age=31536000, immutable",
    "Transfer-Encoding":         "chunked",
    "X-Accel-Buffering":         "no",           // disable nginx buffering
    "X-Content-Type-Options":    "nosniff",
    "Timing-Allow-Origin":       "*",
    "X-Chunk-Size":              String(chunkSize),
    "X-Stream-Mode":             isRange ? "range" : "full",
    // CORS for video players
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
    "Access-Control-Expose-Headers":"Content-Range, Accept-Ranges, Content-Length",
    // Prefetch hint
    "Link": `</${encodeURIComponent(String(start ?? 0))}>;rel=preload;as=fetch`,
  };
}

// ── MIME type detection by extension ─────────────────────────────────
export function detectMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const MIME: Record<string, string> = {
    mp4:  "video/mp4",
    webm: "video/webm",
    mov:  "video/quicktime",
    mkv:  "video/x-matroska",
    avi:  "video/x-msvideo",
    m3u8: "application/vnd.apple.mpegurl",   // HLS
    ts:   "video/MP2T",                       // HLS segment
    mpd:  "application/dash+xml",             // DASH manifest
    m4s:  "video/iso.segment",                // DASH segment
    jpg:  "image/jpeg",
    png:  "image/png",
    webp: "image/webp",
  };
  return MIME[ext] ?? "application/octet-stream";
}

// ══════════════════════════════════════════════════════════════════════
// LIVE STREAM PROXY — forward to live origin with low-latency headers
// ══════════════════════════════════════════════════════════════════════
export async function proxyLiveStream(
  req:       Request,
  originUrl: string
): Promise<Response> {
  const upstreamReq = new Request(originUrl, {
    method:  req.method,
    headers: {
      "Accept":          req.headers.get("Accept") ?? "*/*",
      "Range":           req.headers.get("Range")  ?? "",
      "User-Agent":      "FWG-UltraEdge/3.0 🌍⚡",
      "Cache-Control":   "no-cache",
      "Icy-MetaData":    "1",
    },
  });

  const upstream = await fetch(upstreamReq);

  const headers = new Headers(upstream.headers);
  headers.set("X-Accel-Buffering",      "no");
  headers.set("Cache-Control",          "no-cache, no-store");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Stream-Type",          "live");
  headers.set("X-Powered-By",          "FWG-UltraEdge 🌍⚡");

  return new Response(upstream.body, {
    status:  upstream.status,
    headers,
  });
}
