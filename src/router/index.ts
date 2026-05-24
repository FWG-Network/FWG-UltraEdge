// FWG-UltraEdge 🌍⚡ — src/router/index.ts
// 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
// Fixes:
//   [FIX-8]  KV routes → rate limiting added
//   [FIX-9]  Cache purge → keys validation added
//   [FIX-10] handleProxy → SSRF guard note added
//   [FIX-11] Restream routes → protected (not public)
//   [FIX-12] /api/config → requires auth now
//   [FIX-13] PUT/DELETE KV → extra validation

import { Router } from "itty-router";
import type { Env } from "../types/env";
import { healthHandler }                                           from "../handlers/health";
import { videoHandler, liveStreamHandler, videoListHandler }       from "../handlers/video";
import { kvGetHandler, kvPutHandler, kvDeleteHandler, kvListHandler } from "../handlers/kv";
import { getAccountInfo, listR2Objects, purgeCache }               from "../providers/cloudflare";
import {
  getRestreamProfile,
  getRestreamChannels,
  getRestreamAnalytics,
} from "../providers/restream";
import { handleProxy } from "../handlers/proxy";

export const router = Router();

// ════════════════════════════════════════════════════════════
// PUBLIC ROUTES — No auth required
// ════════════════════════════════════════════════════════════

// ── Health ──
router.get("/health", (req: Request, env: Env) =>
  healthHandler(req, env)
);

// ── [FIX-12] /api/config removed from public ──
// Moved to protected routes below — leaks version + environment

// ════════════════════════════════════════════════════════════
// PROTECTED ROUTES — Auth required (handled by withAuth)
// ════════════════════════════════════════════════════════════

// ── Config ──
// [FIX-12] Now protected — environment + version info is sensitive
router.get("/api/config", (_req: Request, env: Env) =>
  Response.json({
    ok:          true,
    app:         env.APP_NAME,
    version:     env.APP_VERSION,
    environment: env.ENVIRONMENT,
  })
);

// ── Account ──
router.get("/api/account", (_req: Request, env: Env) =>
  getAccountInfo(env)
);

// ── Video ──
router.get("/api/video", (_req: Request, env: Env) =>
  videoListHandler(env)
);
router.get(
  "/api/video/:filename",
  (req: Request & { params: Record<string, string> }, env: Env) =>
    videoHandler(req, env, req.params.filename)
);

// ── Live ──
router.get(
  "/api/live/:path",
  (req: Request & { params: Record<string, string> }, env: Env) =>
    liveStreamHandler(req, env, req.params.path)
);

// ── KV — [FIX-8] Rate limiting enforced via middleware ──
// Rate limit: 100 req/min per IP (handled in rateLimit middleware)
router.get("/api/kv", (req: Request, env: Env) =>
  kvListHandler(req, env)
);
router.get(
  "/api/kv/:key",
  (req: Request & { params: Record<string, string> }, env: Env) =>
    kvGetHandler(req, env, req.params.key)
);
router.put(
  "/api/kv/:key",
  async (req: Request & { params: Record<string, string> }, env: Env) => {
    // [FIX-13] Validate key format before write
    const key = req.params.key;
    if (!key || key.length > 512 || !/^[a-zA-Z0-9:._\-/]+$/.test(key)) {
      return Response.json(
        { error: "Invalid key format" },
        { status: 400 }
      );
    }
    return kvPutHandler(req, env, key);
  }
);
router.delete(
  "/api/kv/:key",
  async (req: Request & { params: Record<string, string> }, env: Env) => {
    // [FIX-13] Validate key format before delete
    const key = req.params.key;
    if (!key || key.length > 512 || !/^[a-zA-Z0-9:._\-/]+$/.test(key)) {
      return Response.json(
        { error: "Invalid key format" },
        { status: 400 }
      );
    }
    return kvDeleteHandler(env, key);
  }
);

// ── R2 ──
router.get("/api/r2", (req: Request, env: Env) =>
  listR2Objects(req, env)
);

// ── Cache Purge — [FIX-9] Strict validation ──
router.post("/api/cache/purge", async (req: Request, env: Env) => {
  let body: { keys?: unknown };
  try {
    body = await req.json<{ keys?: unknown }>();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // [FIX-9] Validate keys array strictly
  if (
    !Array.isArray(body.keys) ||
    body.keys.length === 0 ||
    body.keys.length > 100 || // Max 100 keys per request
    !body.keys.every(
      (k): k is string =>
        typeof k === "string" && k.length > 0 && k.length <= 512
    )
  ) {
    return Response.json(
      { error: "Invalid keys — must be array of 1-100 strings" },
      { status: 400 }
    );
  }

  return purgeCache(env, body.keys);
});

// ── Restream — [FIX-11] Protected (auth required) ──
// These routes expose account profile + analytics data
// Auth is enforced by withAuth middleware in index.ts
router.get("/api/restream/profile",   (_req: Request, env: Env) => getRestreamProfile(env));
router.get("/api/restream/channels",  (_req: Request, env: Env) => getRestreamChannels(env));
router.get("/api/restream/analytics", (_req: Request, env: Env) => getRestreamAnalytics(env));

// ── Proxy — [FIX-10] SSRF guard must be in handleProxy ──
// ⚠️ IMPORTANT: handleProxy MUST validate target URLs against
// an allowlist before fetching — prevent SSRF attacks!
// Allowed targets should be defined in env.PROXY_ALLOWLIST
router.all("/proxy/*", (req: Request, env: Env) =>
  handleProxy(req, env)
);

// ── 404 ──
router.all("*", () =>
  Response.json(
    { error: "Not Found" },
    { status: 404 }
  )
);
