// FWG-UltraEdge 🌍⚡ — CORS Middleware
// Version: 3.0.0 | Advanced Origin Control
// 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
// Fixes:
//   [FIX-5] Wildcard fallback "*" removed — null if not allowed
//   [FIX-6] Subdomain wildcard .endsWith() removed — explicit list only
//   [FIX-7] DELETE removed from Allow-Methods
//   [FIX-8] ALLOWED_ORIGINS env var validated strictly

import type { Env } from "../types/env";

// ── Explicit allowed origins ──
// [FIX-6] No more .endsWith(".fwg.network") — explicit list only!
const DEFAULT_ALLOWED = new Set([
  "https://fwg.network",
  "https://www.fwg.network",
  "https://admin.fwg.network",
  "https://ultraedge-prod.fasterwgseverkh.workers.dev",
  "https://ultraedge-stg.fasterwgseverkh.workers.dev",
]);

function getAllowedOrigins(env: Env): Set<string> {
  try {
    if (env.ALLOWED_ORIGINS) {
      const parsed = env.ALLOWED_ORIGINS
        .split(",")
        .map((o) => o.trim())
        // [FIX-5] Reject "*" even if set in env var
        .filter((o) => o.length > 0 && o !== "*");
      return new Set(parsed);
    }
  } catch {
    // fallback to defaults
  }
  return DEFAULT_ALLOWED;
}

// [FIX-6] Strict exact match — no wildcard subdomain
function resolveOrigin(
  origin: string | null,
  allowed: Set<string>
): string | null {
  if (!origin) return null;
  // [FIX-5] Never return "*" — return null if not allowed
  return allowed.has(origin) ? origin : null;
}

export function corsHeaders(
  req: Request,
  env: Env
): Record<string, string> | null {
  const origin  = req.headers.get("Origin");
  const allowed = getAllowedOrigins(env);
  const resolvedOrigin = resolveOrigin(origin, allowed);

  // [FIX-5] If origin not allowed → return null → no CORS headers set
  if (!resolvedOrigin) return null;

  return {
    "Access-Control-Allow-Origin": resolvedOrigin,
    // [FIX-7] DELETE removed — minimal methods only
    "Access-Control-Allow-Methods":  "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":  "Content-Type, Authorization, X-Request-ID, CF-Ray",
    "Access-Control-Expose-Headers": "X-Environment, X-Response-Time, CF-Ray",
    "Access-Control-Max-Age":        "86400",
    "Vary":                          "Origin",
  };
}

export function withCors(
  req: Request,
  env: Env,
  next: () => Promise<Response>
): Promise<Response> {
  const headers = corsHeaders(req, env);

  // ── Preflight ──
  if (req.method === "OPTIONS") {
    // [FIX-5] If origin not allowed → 403, not 204
    if (!headers) {
      return Promise.resolve(
        new Response(null, { status: 403 })
      );
    }
    return Promise.resolve(
      new Response(null, { status: 204, headers })
    );
  }

  return next().then((res) => {
    // [FIX-5] Only add CORS headers if origin is allowed
    if (!headers) return res;

    const newHeaders = new Headers(res.headers);
    for (const [k, v] of Object.entries(headers)) {
      newHeaders.set(k, v);
    }
    return new Response(res.body, {
      status:     res.status,
      statusText: res.statusText,
      headers:    newHeaders,
    });
  });
}
