// FWG-UltraEdge 🌍⚡ — src/middleware/edgeCache.ts
import type { Env } from "../types/env";

export const CACHE_TTL = {
  HEALTH: 10,
  API: 60,
  VIDEO: 31_536_000,
  STATIC: 86_400,
  DEFAULT: 30,
} as const;

export type CacheTag = "health" | "api" | "video" | "static";

export function buildCacheKey(req: Request): Request {
  const url = new URL(req.url);
  ["utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid", "_ga", "ref"].forEach((p) =>
    url.searchParams.delete(p)
  );
  if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return new Request(url.toString(), { method: req.method, headers: req.headers });
}

export function resolveCachePolicy(pathname: string): {
  ttl: number;
  tag: CacheTag;
  immutable: boolean;
} {
  if (pathname === "/health") return { ttl: CACHE_TTL.HEALTH, tag: "health", immutable: false };
  if (pathname.startsWith("/api/video"))
    return { ttl: CACHE_TTL.VIDEO, tag: "video", immutable: true };
  if (pathname.startsWith("/api/")) return { ttl: CACHE_TTL.API, tag: "api", immutable: false };
  return { ttl: CACHE_TTL.DEFAULT, tag: "static", immutable: false };
}

export function applyCacheHeaders(
  res: Response,
  ttl: number,
  immutable: boolean,
  tag: CacheTag,
  hit: "HIT" | "MISS" | "STALE"
): Response {
  const headers = new Headers(res.headers);
  const cc = immutable
    ? `public, max-age=${ttl}, immutable`
    : `public, max-age=${ttl}, stale-while-revalidate=${Math.floor(ttl * 0.5)}, stale-if-error=86400`;
  headers.set("Cache-Control", cc);
  headers.set("CDN-Cache-Control", cc);
  headers.set("Cloudflare-CDN-Cache-Control", cc);
  headers.set("Surrogate-Key", `fwg-${tag}`);
  headers.set("Cache-Tag", `fwg-${tag}`);
  headers.set("X-Cache", hit);
  headers.set("X-Cache-TTL", String(ttl));
  headers.set("Vary", "Accept-Encoding, Accept");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function withEdgeCache(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  next: (req: Request) => Promise<Response>
): Promise<Response> {
  if (req.method !== "GET") return next(req);
  const cacheKey = buildCacheKey(req);
  const url = new URL(cacheKey.url);
  const { ttl, tag, immutable } = resolveCachePolicy(url.pathname);
  const cache = caches.default;

  const cfCached = await cache.match(cacheKey);
  if (cfCached) return applyCacheHeaders(cfCached, ttl, immutable, tag, "HIT");

  const kvKey = `cache:${url.pathname}${url.search}`;
  const kvRaw = await env.ULTRA_EDGE_KV.get(kvKey, "arrayBuffer").catch(() => null);
  if (kvRaw) {
    const stale = applyCacheHeaders(
      new Response(kvRaw, { headers: { "Content-Type": "application/json" } }),
      ttl,
      immutable,
      tag,
      "STALE"
    );
    ctx.waitUntil(
      next(req).then((fresh) =>
        cache.put(cacheKey, applyCacheHeaders(fresh.clone(), ttl, immutable, tag, "MISS").clone())
      )
    );
    return stale;
  }

  const origin = await next(req);
  if (origin.status === 200) {
    const toCache = applyCacheHeaders(origin.clone(), ttl, immutable, tag, "MISS");
    ctx.waitUntil(
      Promise.all([
        cache.put(cacheKey, toCache.clone()),
        url.pathname.startsWith("/api/video")
          ? Promise.resolve()
          : origin
              .clone()
              .arrayBuffer()
              .then((buf) => env.ULTRA_EDGE_KV.put(kvKey, buf, { expirationTtl: ttl }))
              .catch(() => {}),
      ])
    );
    return toCache;
  }
  return origin;
}
