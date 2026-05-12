// ══════════════════════════════════════════════════════════════════════
// FWG-UltraEdge 🌍⚡ — src/middleware/edgeCache.ts
// Ultra Edge Caching: CF Cache API + KV Tiered + Stale-While-Revalidate
// Strategy: CF Edge Cache → KV fallback → Origin
// Latest: Cloudflare Cache API v2 + Cache Tags + Surrogate Keys
// ══════════════════════════════════════════════════════════════════════

import type { Env } from "../types/env";

// ── Cache TTL tiers (seconds) ─────────────────────────────────────────
export const CACHE_TTL = {
  HEALTH:  10,
  API:     60,
  VIDEO:   31_536_000,   // 1 year — immutable content
  STATIC:  86_400,       // 1 day
  DEFAULT: 30,
} as const;

export type CacheTag = "health" | "api" | "video" | "static";

// ── Smart cache key: strip tracking noise params ──────────────────────
export function buildCacheKey(req: Request): Request {
  const url = new URL(req.url);
  const NOISE = ["utm_source","utm_medium","utm_campaign","utm_term",
                 "utm_content","fbclid","gclid","_ga","ref","source"];
  NOISE.forEach(p => url.searchParams.delete(p));
  if (url.pathname !== "/" && url.pathname.endsWith("/"))
    url.pathname = url.pathname.slice(0, -1);
  return new Request(url.toString(), { method: req.method, headers: req.headers });
}

// ── Resolve cache policy per route ────────────────────────────────────
export function resolveCachePolicy(pathname: string): {
  ttl: number; tag: CacheTag; immutable: boolean;
} {
  if (pathname === "/health")              return { ttl: CACHE_TTL.HEALTH,  tag: "health", immutable: false };
  if (pathname.startsWith("/api/video"))   return { ttl: CACHE_TTL.VIDEO,   tag: "video",  immutable: true  };
  if (pathname.startsWith("/api/"))        return { ttl: CACHE_TTL.API,     tag: "api",    immutable: false };
  return                                          { ttl: CACHE_TTL.DEFAULT, tag: "static", immutable: false };
}

// ── Attach cache headers ──────────────────────────────────────────────
export function applyCacheHeaders(
  res: Response, ttl: number, immutable: boolean,
  tag: CacheTag, hit: "HIT" | "MISS" | "STALE"
): Response {
  const headers = new Headers(res.headers);
  const cc = immutable
    ? `public, max-age=${ttl}, immutable`
    : `public, max-age=${ttl}, stale-while-revalidate=${Math.floor(ttl * 0.5)}, stale-if-error=86400`;

  headers.set("Cache-Control",                 cc);
  headers.set("CDN-Cache-Control",             cc);
  headers.set("Cloudflare-CDN-Cache-Control",  cc);
  headers.set("Surrogate-Control",             `max-age=${ttl}`);
  headers.set("Surrogate-Key",                 `fwg-${tag}`);
  headers.set("Cache-Tag",                     `fwg-${tag}`);
  headers.set("X-Cache",                       hit);
  headers.set("X-Cache-TTL",                   String(ttl));
  headers.set("Vary",                          "Accept-Encoding, Accept");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// ══════════════════════════════════════════════════════════════════════
// MAIN: withEdgeCache
// Flow: CF Cache → KV fallback → origin → populate both layers
// ══════════════════════════════════════════════════════════════════════
export async function withEdgeCache(
  req: Request, env: Env, ctx: ExecutionContext,
  next: (req: Request) => Promise<Response>
): Promise<Response> {
  if (req.method !== "GET") return next(req);

  const cacheKey             = buildCacheKey(req);
  const url                  = new URL(cacheKey.url);
  const { ttl, tag, immutable } = resolveCachePolicy(url.pathname);
  const cache                = caches.default;

  // Layer 1: CF Edge Cache
  const cfCached = await cache.match(cacheKey);
  if (cfCached) return applyCacheHeaders(cfCached, ttl, immutable, tag, "HIT");

  // Layer 2: KV fallback (cross-region resilience)
  const kvKey = `cache:${url.pathname}${url.search}`;
  const kvRaw = await env.KV.get(kvKey, "arrayBuffer").catch(() => null);
  if (kvRaw) {
    const stale = applyCacheHeaders(
      new Response(kvRaw, { headers: { "Content-Type": "application/json" } }),
      ttl, immutable, tag, "STALE"
    );
    ctx.waitUntil(
      next(req).then(fresh => cache.put(cacheKey,
        applyCacheHeaders(fresh.clone(), ttl, immutable, tag, "MISS").clone()
      ))
    );
    return stale;
  }

  // Layer 3: Origin → populate cache
  const origin = await next(req);
  if (origin.status === 200) {
    const toCache = applyCacheHeaders(origin.clone(), ttl, immutable, tag, "MISS");
    ctx.waitUntil(Promise.all([
      cache.put(cacheKey, toCache.clone()),
      url.pathname.startsWith("/api/video") ? Promise.resolve()
        : origin.clone().arrayBuffer()
            .then(buf => env.KV.put(kvKey, buf, { expirationTtl: ttl }))
            .catch(() => {}),
    ]));
    return toCache;
  }
  return origin;
}
