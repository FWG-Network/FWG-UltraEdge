// FWG-UltraEdge 🌍⚡ — src/handlers/proxy.d.ts
// 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
// Fixes:
//   [FIX-1] env: any → env: Env (strict type)
//   [FIX-2] return type → Promise<Response> only
//   [FIX-3] ctx → optional (not used in implementation)

import type { Env } from "../types/env";

export declare function handleProxy(
  request: Request,
  env: Env,
  ctx?: ExecutionContext
): Promise<Response>;
