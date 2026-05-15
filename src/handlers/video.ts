// FWG-UltraEdge 🌍⚡ — Video Handler
// Version: 3.0.0 | Cloudflare Workers Runtime
/// <reference types="@cloudflare/workers-types" />

import type { Env } from "../types/env";
import { streamR2Video, detectMimeType, proxyLiveStream } from "../middleware/streaming";

const VIDEO_CACHE_HEADERS = {
  "Cache-Control":               "public, max-age=31536000, stale-while-revalidate=86400",
  "Access-Control-Allow-Origin": "*",
  "X-Powered-By":                "FWG-UltraEdge 🌍⚡",
};

const LIST_CACHE_HEADERS = {
  "Cache-Control":               "public, max-age=60, stale-while-revalidate=30",
  "Access-Control-Allow-Origin": "*",
  "X-Powered-By":                "FWG-UltraEdge 🌍⚡",
};

// ── Video Stream Handler ──
export async function videoHandler(
  req:      Request,
  env:      Env,
  filename: string,
): Promise<Response> {
  if (!filename) {
    return Response.json(
      { error: "Bad Request", message: "Filename required", app: "FWG-UltraEdge 🌍⚡" },
      { status: 400 }
    );
  }

  // Sanitize filename — prevent path traversal
  const safe = filename
    .replace(/\.\.\//g, "")
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9._\-\/]/g, "");

  if (!safe) {
    return Response.json(
      { error: "Bad Request", message: "Invalid filename", app: "FWG-UltraEdge 🌍⚡" },
      { status: 400 }
    );
  }

  try {
    return await streamR2Video(req, env, safe);
  } catch {
    return Response.json(
      { error: "Internal Error", message: "Failed to stream video", app: "FWG-UltraEdge 🌍⚡" },
      { status: 500 }
    );
  }
}

// ── Live Stream Handler ──
export async function liveStreamHandler(
  req:  Request,
  env:  Env,
  path: string,
): Promise<Response> {
  if (!env.VIDEO_ORIGIN) {
    return Response.json(
      { error: "Not Configured", message: "VIDEO_ORIGIN not set", app: "FWG-UltraEdge 🌍⚡" },
      { status: 503 }
    );
  }

  if (!path) {
    return Response.json(
      { error: "Bad Request", message: "Stream path required", app: "FWG-UltraEdge 🌍⚡" },
      { status: 400 }
    );
  }

  // Sanitize path
  const safePath = path.replace(/\.\.\//g, "").replace(/^\/+/, "");
  const origin   = env.VIDEO_ORIGIN.replace(/\/$/, "");

  try {
    return await proxyLiveStream(req, `${origin}/${safePath}`);
  } catch {
    return Response.json(
      { error: "Stream Error", message: "Failed to proxy live stream", app: "FWG-UltraEdge 🌍⚡" },
      { status: 502 }
    );
  }
}

// ── Video List Handler ──
export async function videoListHandler(env: Env): Promise<Response> {
  try {
    const listed = await env.ULTRA_EDGE_VIDEOS.list({ limit: 100 });

    const videos = listed.objects.map((o) => ({
      key:         o.key,
      size:        o.size,
      contentType: detectMimeType(o.key),
      uploaded:    o.uploaded,
      etag:        o.etag,
      url:         `${env.VIDEO_ORIGIN ?? ""}/${o.key}`,
    }));

    return Response.json(
      {
        ok:        true,
        count:     videos.length,
        videos,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: LIST_CACHE_HEADERS }
    );
  } catch {
    return Response.json(
      { error: "Internal Error", message: "Failed to list videos", app: "FWG-UltraEdge 🌍⚡" },
      { status: 500 }
    );
  }
}
