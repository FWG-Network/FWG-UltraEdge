// FWG-UltraEdge 🌍⚡ — KV Handler
// Version: 3.0.0 | CRUD + TTL + Metadata

import type { Env } from "../types/env";

const MAX_VALUE_SIZE = 25 * 1024 * 1024; // 25MB
const DEFAULT_TTL = 86400; // 24h

// ── GET /api/kv/:key ──
export async function kvGetHandler(
  req: Request,
  env: Env,
  key: string
): Promise<Response> {
  try {
    if (!key) {
      return Response.json(
        { error: "Bad Request", message: "Key is required" },
        { status: 400 }
      );
    }

    const { value, metadata } = await env.ULTRA_EDGE_KV.getWithMetadata(
      key,
      "text"
    );

    if (value === null) {
      return Response.json(
        { error: "Not Found", message: `Key "${key}" not found` },
        { status: 404 }
      );
    }

    return Response.json(
      {
        ok: true,
        key,
        value,
        metadata: metadata ?? {},
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-KV-Key": key,
        },
      }
    );
  } catch (err) {
    return Response.json(
      {
        error: "Internal Error",
        message: err instanceof Error ? err.message : "KV get failed",
      },
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
        { error: "Bad Request", message: "Key is required" },
        { status: 400 }
      );
    }

    const body = await req.text();

    if (!body) {
      return Response.json(
        { error: "Bad Request", message: "Value is required" },
        { status: 400 }
      );
    }

    if (body.length > MAX_VALUE_SIZE) {
      return Response.json(
        {
          error: "Payload Too Large",
          message: `Value exceeds ${MAX_VALUE_SIZE / 1024 / 1024}MB limit`,
        },
        { status: 413 }
      );
    }

    const url = new URL(req.url);
    const ttl = parseInt(url.searchParams.get("ttl") ?? String(DEFAULT_TTL));

    const metadata = {
      createdAt: new Date().toISOString(),
      size: body.length,
      contentType: req.headers.get("Content-Type") ?? "text/plain",
    };

    await env.ULTRA_EDGE_KV.put(key, body, {
      expirationTtl: ttl,
      metadata,
    });

    return Response.json(
      {
        ok: true,
        key,
        size: body.length,
        ttl,
        metadata,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    return Response.json(
      {
        error: "Internal Error",
        message: err instanceof Error ? err.message : "KV put failed",
      },
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
        { error: "Bad Request", message: "Key is required" },
        { status: 400 }
      );
    }

    await env.ULTRA_EDGE_KV.delete(key);

    return Response.json({
      ok: true,
      key,
      message: `Key "${key}" deleted`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Internal Error",
        message: err instanceof Error ? err.message : "KV delete failed",
      },
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
    const url = new URL(req.url);
    const prefix = url.searchParams.get("prefix") ?? "";
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "100"),
      1000
    );
    const cursor = url.searchParams.get("cursor") ?? undefined;

    const result = await env.ULTRA_EDGE_KV.list({
      prefix,
      limit,
      cursor,
    });

    return Response.json({
      ok: true,
      keys: result.keys,
      list_complete: result.list_complete,
      cursor: "cursor" in result ? result.cursor ?? null : null,
      count: result.keys.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Internal Error",
        message: err instanceof Error ? err.message : "KV list failed",
      },
      { status: 500 }
    );
  }
}
