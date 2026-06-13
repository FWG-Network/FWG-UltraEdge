// FWG-UltraEdge 🌍⚡ — Rate Limit Middleware
// Version: 3.0.0 | Sliding Window + KV Backend

import type { Env } from "../types/env";

interface RateLimitRecord {
  count: number;
  window: number;
}

// ── Get client IP ──
function getClientIP(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ??
    req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// ── Build KV key ──
function buildKey(ip: string, pathname: string): string {
  const route = pathname.split("/").slice(0, 3).join("/");
  return `ratelimit:${ip}:${route}`;
}

export async function withRateLimit(
  req: Request,
  env: Env,
  next: (req: Request) => Promise<Response>
): Promise<Response> {
  const url = new URL(req.url);

  // ── Skip rate limit for health ──
  if (url.pathname === "/health") return next(req);

  const max = parseInt(env.RATE_LIMIT_MAX ?? "100");
  const window = parseInt(env.RATE_LIMIT_WINDOW ?? "60");
  const ip = getClientIP(req);
  const key = buildKey(ip, url.pathname);
  const now = Math.floor(Date.now() / 1000);

  try {
    // ── Read current record ──
    const raw = await env.ULTRA_EDGE_KV.get<RateLimitRecord>(key, "json");

    const record: RateLimitRecord = raw ?? {
      count: 0,
      window: now + window,
    };

    // ── Reset if window expired ──
    if (now > record.window) {
      record.count = 0;
      record.window = now + window;
    }

    record.count++;

    const remaining = Math.max(0, max - record.count);
    const reset = record.window;

    // ── Persist ──
    await env.ULTRA_EDGE_KV.put(key, JSON.stringify(record), {
      expirationTtl: window + 10,
    });

    // ── Rate limit exceeded ──
    if (record.count > max) {
      return Response.json(
        {
          error: "Too Many Requests",
          message: `Rate limit exceeded. Max ${max} requests per ${window}s.`,
          retry_after: reset - now,
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(reset),
            "Retry-After": String(reset - now),
            "X-Powered-By": "FWG-UltraEdge 🌍⚡",
          },
        }
      );
    }

    // ── Pass through with headers ──
    const res = await next(req);
    const headers = new Headers(res.headers);
    headers.set("X-RateLimit-Limit", String(max));
    headers.set("X-RateLimit-Remaining", String(remaining));
    headers.set("X-RateLimit-Reset", String(reset));

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  } catch {
    // ── KV failure → fail open ──
    return next(req);
  }
}
