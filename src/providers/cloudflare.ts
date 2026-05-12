// FWG-UltraEdge 🌍⚡ — Cloudflare Provider
// Version: 3.0.0 | Analytics + Cache Purge + R2 + KV

import type { Env } from "../types/env";

// ── CF Account Info ──
export async function getAccountInfo(env: Env): Promise<Response> {
  try {
    const id = env.SMART_ROUTER.idFromName("global");
    const stub = env.SMART_ROUTER.get(id);
    const stats = await stub.fetch(new Request("https://do/stats"));
    const data = await stats.json();
    return Response.json({
      ok: true,
      app: env.APP_NAME ?? "FWG-UltraEdge",
      version: env.APP_VERSION ?? "3.0.0",
      environment: env.ENVIRONMENT ?? "production",
      runtime: "Cloudflare Workers 🌍⚡",
      smart_router: data,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Internal Error",
        message: err instanceof Error ? err.message : "CF provider failed",
      },
      { status: 500 }
    );
  }
}

// ── R2 Object Info ──
export async function getR2ObjectInfo(env: Env, key: string): Promise<Response> {
  try {
    if (!key) {
      return Response.json({ error: "Bad Request", message: "Key is required" }, { status: 400 });
    }

    const obj = await env.ULTRA_EDGE_VIDEOS.head(key);

    if (!obj) {
      return Response.json(
        { error: "Not Found", message: `Object "${key}" not found` },
        { status: 404 }
      );
    }

    return Response.json({
      ok: true,
      key: obj.key,
      size: obj.size,
      etag: obj.etag,
      uploaded: obj.uploaded,
      httpMetadata: obj.httpMetadata,
      customMetadata: obj.customMetadata,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Internal Error",
        message: err instanceof Error ? err.message : "R2 head failed",
      },
      { status: 500 }
    );
  }
}

// ── R2 Delete Object ──
export async function deleteR2Object(env: Env, key: string): Promise<Response> {
  try {
    if (!key) {
      return Response.json({ error: "Bad Request", message: "Key is required" }, { status: 400 });
    }

    await env.ULTRA_EDGE_VIDEOS.delete(key);

    return Response.json({
      ok: true,
      key,
      message: `Object "${key}" deleted`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Internal Error",
        message: err instanceof Error ? err.message : "R2 delete failed",
      },
      { status: 500 }
    );
  }
}

// ── R2 List Objects ──
export async function listR2Objects(req: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(req.url);
    const prefix = url.searchParams.get("prefix") ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 1000);
    const cursor = url.searchParams.get("cursor") ?? undefined;

    const result = await env.ULTRA_EDGE_VIDEOS.list({
      prefix,
      limit,
      cursor,
    });

    return Response.json({
      ok: true,
      objects: result.objects.map((o) => ({
        key: o.key,
        size: o.size,
        etag: o.etag,
        uploaded: o.uploaded,
        httpMetadata: o.httpMetadata,
      })),
      truncated: result.truncated,
      cursor: "cursor" in result ? (result.cursor ?? null) : null,
      count: result.objects.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Internal Error",
        message: err instanceof Error ? err.message : "R2 list failed",
      },
      { status: 500 }
    );
  }
}

// ── Cache Purge via KV tag ──
export async function purgeCache(env: Env, keys: string[]): Promise<Response> {
  try {
    if (!keys.length) {
      return Response.json(
        { error: "Bad Request", message: "Keys array is required" },
        { status: 400 }
      );
    }

    await Promise.all(keys.map((k) => env.ULTRA_EDGE_KV.delete(k)));

    return Response.json({
      ok: true,
      purged: keys,
      count: keys.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Internal Error",
        message: err instanceof Error ? err.message : "Cache purge failed",
      },
      { status: 500 }
    );
  }
}
