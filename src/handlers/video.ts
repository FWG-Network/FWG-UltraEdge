// FWG-UltraEdge 🌍⚡ — src/handlers/video.ts
// 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
// Fixes:
//   [FIX-7] Path traversal → decode + strict sanitize
//   [FIX-8] SSRF liveStream → VIDEO_ORIGIN allowlist

import type { Env } from "../types/env";
import {
  streamR2Video,
  detectMimeType,
  proxyLiveStream,
} from "../middleware/streaming";

// ── [FIX-8] Allowed VIDEO_ORIGIN values ──
const ALLOWED_VIDEO_ORIGINS = new Set([
  "https://cdn.fwg.network",
  "https://stream.fwg.network",
  // បន្ថែម origins ត្រឹមត្រូវនៅទីនេះ
]);

// ── [FIX-7] Strict filename sanitizer ──
function sanitizeFilename(raw: string): string | null {
  // Step 1: URL decode — catch encoded traversal like "..%2F"
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  // Step 2: Strip ALL traversal patterns
  const sanitized = decoded
    .replace(/\.\./g, "")           // Remove ".."
    .replace(/[^a-zA-Z0-9._\-]/g, "") // Allow only safe chars
    .replace(/^\/+/, "")            // Remove leading slashes
    .trim();

  // Step 3: Must have valid extension
  const validExt = /\.(mp4|webm|mkv|avi|mov|m3u8|ts|jpg|png|pdf)$/i;
  if (!validExt.test(sanitized)) return null;

  // Step 4: Non-empty after sanitize
  if (!sanitized) return null;

  return sanitized;
}

// ── Video handler ──
export async function videoHandler(
  req: Request,
  env: Env,
  filename: string
): Promise<Response> {
  if (!filename) {
    return Response.json(
      { error: "Bad Request" },
      { status: 400 }
    );
  }

  // [FIX-7] Strict sanitize
  const safe = sanitizeFilename(filename);
  if (!safe) {
    return Response.json(
      { error: "Invalid filename" },
      { status: 400 }
    );
  }

  return streamR2Video(req, env, safe);
}

// ── Live stream handler ──
export async function liveStreamHandler(
  req: Request,
  env: Env,
  path: string
): Promise<Response> {
  if (!env.VIDEO_ORIGIN) {
    return Response.json(
      { error: "Not Configured" },
      { status: 503 }
    );
  }

  // [FIX-8] Validate VIDEO_ORIGIN against allowlist
  const origin = env.VIDEO_ORIGIN.replace(/\/$/, "");
  if (!ALLOWED_VIDEO_ORIGINS.has(origin)) {
    return Response.json(
      { error: "Invalid origin" },
      { status: 503 }
    );
  }

  // [FIX-7] Sanitize path too — prevent traversal
  const safePath = path
    .replace(/\.\./g, "")
    .replace(/[^a-zA-Z0-9._\-/]/g, "")
    .replace(/^\/+/, "");

  if (!safePath) {
    return Response.json(
      { error: "Invalid path" },
      { status: 400 }
    );
  }

  return proxyLiveStream(req, `${origin}/${safePath}`);
}

// ── Video list handler ──
export async function videoListHandler(env: Env): Promise<Response> {
  try {
    const listed = await env.ULTRA_EDGE_VIDEOS.list({ limit: 100 });
    const videos = listed.objects.map((o) => ({
      key:         o.key,
      size:        o.size,
      contentType: detectMimeType(o.key),
      uploaded:    o.uploaded,
      etag:        o.etag,
    }));

    return Response.json(
      { count: videos.length, videos },
      {
        status:  200,
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
        },
      }
    );
  } catch {
    // Generic error — no internal details
    return Response.json(
      { error: "Internal Error" },
      { status: 500 }
    );
  }
}
