// FWG-UltraEdge 🌍⚡ — Health Handler
// Version: 3.0.0 | Cloudflare Workers Runtime
// 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
// Fixes:
//   [FIX-1] Timing attack → safeCompare
//   [FIX-2] Info leakage → minimal response

/// <reference types="@cloudflare/workers-types" />

import type { Env } from "../types/env";

// ── Constant-time compare (prevent timing attacks) ──
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function healthHandler(
  req: Request,
  env: Env
): Promise<Response> {
  const auth  = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();

  // [FIX-1] safeCompare — prevent timing attack
  if (env.HEALTH_CHECK_TOKEN && !safeCompare(token, env.HEALTH_CHECK_TOKEN)) {
    return Response.json(
      { status: "unauthorized" },
      { status: 401 }
    );
  }

  // [FIX-2] Minimal response — no version/environment/runtime leak
  return Response.json(
    {
      status:    "ok",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
