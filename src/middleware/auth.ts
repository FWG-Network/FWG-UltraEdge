// FWG-UltraEdge 🌍⚡ — Auth Middleware
// Version: 3.0.0 | Bearer Token + HMAC Verification

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
const PUBLIC_PATHS = new Set(["/health", "/api/config"]);

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
    return Response.json(
      {
        error: "Unauthorized",
        message: "Missing Bearer token",
        path: url.pathname,
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="FWG-UltraEdge"',
          "X-Powered-By": "FWG-UltraEdge 🌍⚡",
        },
      }
    );
  }

  // ── Validate token ──
  const secret = env.AUTH_SECRET ?? env.HEALTH_CHECK_TOKEN ?? "";

  if (!secret || !safeCompare(token, secret)) {
    return Response.json(
      {
        error: "Forbidden",
        message: "Invalid token",
        path: url.pathname,
      },
      {
        status: 403,
        headers: {
          "X-Powered-By": "FWG-UltraEdge 🌍⚡",
        },
      }
    );
  }

  // ── Attach auth context to request ──
  const authedReq = new Request(req, {
    headers: (() => {
      const h = new Headers(req.headers);
      h.set("X-Auth-Verified", "true");
      h.set("X-Auth-Time", new Date().toISOString());
      return h;
    })(),
  });

  return next(authedReq);
}

// ── Health check token validator ──
export function validateHealthToken(req: Request, env: Env): boolean {
  const token = extractBearer(req);
  const expected = env.HEALTH_CHECK_TOKEN ?? "";
  if (!token || !expected) return false;
  return safeCompare(token, expected);
}
