// FWG-UltraEdge 🌍⚡ — CORS Middleware
// Version: 3.0.0 | Advanced Origin Control

import type { Env } from "../types/env";

const DEFAULT_ALLOWED = [
  "https://fwg.network",
  "https://www.fwg.network",
  "https://admin.fwg.network",
];

function getAllowedOrigins(env: Env): string[] {
  try {
    if (env.ALLOWED_ORIGINS) {
      return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
    }
  } catch {
    // fallback
  }
  return DEFAULT_ALLOWED;
}

function isAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin) || allowed.includes("*") || origin.endsWith(".fwg.network");
}

export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = getAllowedOrigins(env);
  const allowedOrigin = isAllowed(origin, allowed) ? (origin ?? "*") : (allowed[0] ?? "*");

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID, CF-Ray",
    "Access-Control-Expose-Headers": "X-Powered-By, X-Environment, X-Response-Time, CF-Ray",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function withCors(req: Request, env: Env, next: () => Promise<Response>): Promise<Response> {
  // ── Preflight ──
  if (req.method === "OPTIONS") {
    return Promise.resolve(
      new Response(null, {
        status: 204,
        headers: corsHeaders(req, env),
      })
    );
  }

  return next().then((res) => {
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders(req, env))) {
      headers.set(k, v);
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  });
}
