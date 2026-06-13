// FWG-UltraEdge 🌍⚡ — KV Handler
// Version: 3.0.0 | CRUD + TTL + Metadata
// 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
// Fixes:
//   [FIX-3] Error message leak → generic message
//   [FIX-4] Key in header → removed
//   [FIX-5] TTL validation → min 60s, max 30days
//   [FIX-6] List limit → max 100

import type { Env } from "../types/env";

const MAX_VALUE_SIZE = 25 * 1024 * 1024; // 25MB
const DEFAULT_TTL    = 86400;             // 24h
const MIN_TTL        = 60;               // 1min
const MAX_TTL        = 2592000;          // 30days
const MAX_LIST_LIMIT = 100;              // [FIX-6]

// ── GET /api/kv/:key ──
export async function kvGetHandler(
  req: Request,
  env: Env,
  key: string
): Promise<Response> {
  try {
    if (!key) {
      return Response.json(
        { error: "Bad Request" },
        { status: 400 }
      );
    }

    const { value, metadata } = await env.ULTRA_EDGE_KV.getWithMetadata(
      key,
      "text"
    );

    if (value === null) {
      return Response.json(
        { error: "Not Found" },
        { status: 404 }
      );
    }

    return Response.json(
      {
        ok:        true,
        value,
        metadata:  metadata ?? {},
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
          // [FIX-4] X-KV-Key header removed — leaks key names
        },
      }
    );
  } catch {
    // [FIX-3] Generic error — no internal message exposed
    return Response.json(
      { error: "Internal Error" },
      { status: 500 }
    );
  }
}

// ── PUT /api/kv/:key ──
export async function kvPutHandler(
  req: Request,
  env: Env,
  key: string
): Promise<Response> {
  try {
    if (!key) {
      return Response.json(
        { error: "Bad Request" },
        { status: 400 }
      );
    }

    const body = await req.text();

    if (!body) {
      return Response.json(
        { error: "Bad Request" },
        { status: 400 }
      );
    }

    if (body.length > MAX_VALUE_SIZE) {
      return Response.json(
        { error: "Payload Too Large" },
        { status: 413 }
      );
    }

    // [FIX-5] TTL validation — min 60s, max 30days
    const url    = new URL(req.url);
    const rawTtl = parseInt(url.searchParams.get("ttl") ?? String(DEFAULT_TTL));
    const ttl    = isNaN(rawTtl) || rawTtl < MIN_TTL || rawTtl > MAX_TTL
      ? DEFAULT_TTL
      : rawTtl;

    const metadata = {
      createdAt:   new Date().toISOString(),
      size:        body.length,
      contentType: req.headers.get("Content-Type") ?? "text/plain",
    };

    await env.ULTRA_EDGE_KV.put(key, body, {
      expirationTtl: ttl,
      metadata,
    });

    return Response.json(
      {
        ok:        true,
        size:      body.length,
        ttl,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch {
    // [FIX-3] Generic error
    return Response.json(
      { error: "Internal Error" },
      { status: 500 }
    );
  }
}

// ── DELETE /api/kv/:key ──
export async function kvDeleteHandler(
  env: Env,
  key: string
): Promise<Response> {
  try {
    if (!key) {
      return Response.json(
        { error: "Bad Request" },
        { status: 400 }
      );
    }

    await env.ULTRA_EDGE_KV.delete(key);

    return Response.json({
      ok:        true,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // [FIX-3] Generic error
    return Response.json(
      { error: "Internal Error" },
      { status: 500 }
    );
  }
}

// ── GET /api/kv (list) ──
export async function kvListHandler(
  req: Request,
  env: Env
): Promise<Response> {
  try {
    const url    = new URL(req.url);
    const prefix = url.searchParams.get("prefix") ?? "";

    // [FIX-6] Max 100 — prevent expensive large list
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "100");
    const limit    = isNaN(rawLimit) || rawLimit < 1
      ? 100
      : Math.min(rawLimit, MAX_LIST_LIMIT);

    const cursorParam = url.searchParams.get("cursor");
    const result = await env.ULTRA_EDGE_KV.list({
      prefix,
      limit,
      ...(cursorParam ? { cursor: cursorParam } : {}),
    });

    return Response.json({
      ok:            true,
      keys:          result.keys,
      list_complete: result.list_complete,
      cursor:        "cursor" in result ? (result.cursor ?? null) : null,
      count:         result.keys.length,
      timestamp:     new Date().toISOString(),
    });
  } catch {
    // [FIX-3] Generic error
    return Response.json(
      { error: "Internal Error" },
      { status: 500 }
    );
  }
}
