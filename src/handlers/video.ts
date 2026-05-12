// ══════════════════════════════════════════════════════════════════════
// FWG-UltraEdge 🌍⚡ — src/handlers/video.ts
// Video Handler: R2 streaming + range requests + live proxy
// Integrates: streaming.ts adaptive chunking + MIME detection
// ══════════════════════════════════════════════════════════════════════

import type { Env } from "../types/env";
import { streamR2Video, detectMimeType, proxyLiveStream } from "../middleware/streaming";

// ── VOD: Stream video file from R2 ───────────────────────────────────
export async function videoHandler(
  req:      Request,
  env:      Env,
  filename: string
): Promise<Response> {
  if (!filename) {
    return Response.json(
      { error: "Bad Request", message: "Filename is required" },
      { status: 400 }
    );
  }

  // Sanitize: prevent path traversal
  const safe = filename.replace(/\.\.\//g, "").replace(/^\/+/, "");

  return streamR2Video(req, env, safe);
}

// ── LIVE: Proxy live stream from VIDEO_ORIGIN ─────────────────────────
export async function liveStreamHandler(
  req: Request,
  env: Env,
  path: string
): Promise<Response> {
  if (!env.VIDEO_ORIGIN) {
    return Response.json(
      { error: "Not Configured", message: "VIDEO_ORIGIN not set" },
      { status: 503 }
    );
  }

  const originUrl = `${env.VIDEO_ORIGIN.replace(/\/$/, "")}/${path}`;
  return proxyLiveStream(req, originUrl);
}

// ── LIST: Return available videos metadata from R2 ────────────────────
export async function videoListHandler(env: Env): Promise<Response> {
  try {
    const listed = await env.R2.list({ limit: 100 });
    const videos = listed.objects.map(obj => ({
      key:          obj.key,
      size:         obj.size,
      contentType:  detectMimeType(obj.key),
      uploaded:     obj.uploaded,
      etag:         obj.etag,
    }));
    return Response.json(
      { count: videos.length, videos },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=30" },
      }
    );
  } catch {
    return Response.json(
      { error: "Internal Error", message: "Failed to list videos" },
      { status: 500 }
    );
  }
}
