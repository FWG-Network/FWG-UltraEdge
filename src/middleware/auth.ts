// FWG-UltraEdge 🌍⚡ — Auth Middleware
// Version: 3.0.0 | Bearer Token + HMAC Verification
// 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
// Fixes:
//   [FIX-1] path leakage → minimal error response
//   [FIX-2] X-Powered-By → removed
//   [FIX-3] /api/config removed from PUBLIC_PATHS
//   [FIX-4] AUTH_SECRET fallback chain → strict single secret

import type { Env } from "../types/env";

// ── Constant-time string compare (prevent timing attacks) ──
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ── Extract Bearer token ──
function extractBearer(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

// ── Public routes (no auth required) ──
// [FIX-3] /api/config removed — it leaks version + environment info
const PUBLIC_PATHS = new Set(["/health"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

// ── Main auth middleware ──
export async function withAuth(
  req: Request,
  env: Env,
  next: (req: Request) => Promise<Response>
): Promise<Response> {
  const url = new URL(req.url);

  // ── Skip auth for public paths ──
  if (isPublicPath(url.pathname)) {
    return next(req);
  }

  const token = extractBearer(req);

  if (!token) {
    // [FIX-1] Minimal error — no path, no stack info
    // [FIX-2] X-Powered-By removed
    return Response.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="FWG-UltraEdge"',
        },
      }
    );
  }

  // ── [FIX-4] Strict single secret — no fallback chain ──
  // Fallback chain (AUTH_SECRET ?? HEALTH_CHECK_TOKEN) allows
  // the weaker token to authenticate — removed entirely.
  const secret = env.AUTH_SECRET ?? "";
  if (!secret) {
    // Misconfigured — fail closed, never fail open
    return Response.json(
      { error: "Service Unavailable" },
      { status: 503 }
    );
  }

  if (!safeCompare(token, secret)) {
    // [FIX-1] Minimal error — no path leaked
    return Response.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  // ── Attach auth context to request ──
  const authedReq = new Request(req, {
    headers: (() => {
      const h = new Headers(req.headers);
      h.set("X-Auth-Verified", "true");
      h.set("X-Auth-Time",     new Date().toISOString());
      return h;
    })(),
  });

  return next(authedReq);
}

// ── Health check token validator ──
// Uses dedicated HEALTH_CHECK_TOKEN — separate from AUTH_SECRET
export function validateHealthToken(req: Request, env: Env): boolean {
  const token    = extractBearer(req);
  const expected = env.HEALTH_CHECK_TOKEN ?? "";
  if (!token || !expected) return false;
  return safeCompare(token, expected);
}
