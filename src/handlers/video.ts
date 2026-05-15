// FWG-UltraEdge 🌍⚡ — src/handlers/video.ts
import type { Env } from "../types/env";
import { streamR2Video, detectMimeType, proxyLiveStream } from "../middleware/streaming";

export async function videoHandler(req: Request, env: Env, filename: string): Promise<Response> {
  if (!filename)
    return Response.json({ error: "Bad Request", message: "Filename required" }, { status: 400 });
  const safe = filename.replace(/\.\.\//g, "").replace(/^\/+/, "");
  return streamR2Video(req, env, safe);
}

export async function liveStreamHandler(req: Request, env: Env, path: string): Promise<Response> {
  if (!env.VIDEO_ORIGIN)
    return Response.json(
      { error: "Not Configured", message: "VIDEO_ORIGIN not set" },
      { status: 503 }
    );
  return proxyLiveStream(req, `${env.VIDEO_ORIGIN.replace(/\/$/, "")}/${path}`);
}

export async function videoListHandler(env: Env): Promise<Response> {
  try {
    const listed = await env.ULTRA_EDGE_VIDEOS.list({ limit: 100 });
    const videos = listed.objects.map((o) => ({
      key: o.key,
      size: o.size,
      contentType: detectMimeType(o.key),
      uploaded: o.uploaded,
      etag: o.etag,
    }));
    return Response.json(
      { count: videos.length, videos },
      { status: 200, headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=30" } }
    );
  } catch (_err) {
    return Response.json(
      { error: "Internal Error", message: "Failed to list videos" },
      { status: 500 }
    );
  }
}
