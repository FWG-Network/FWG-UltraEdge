// ══════════════════════════════════════════════════════════════════════
// FWG-UltraEdge 🌍⚡ — src/router/index.ts
// Central Router: itty-router + all handlers + middleware chain
// Routes: health, config, kv, video (VOD+Live+List), router DO
// ══════════════════════════════════════════════════════════════════════

import { Router } from "itty-router";
import type { Env } from "../types/env";
import { healthHandler }                        from "../handlers/health";
import { videoHandler, liveStreamHandler, videoListHandler } from "../handlers/video";
import { kvHandler }                            from "../handlers/kv";
import { getAccountInfo }                       from "../providers/cloudflare";

export const router = Router();

// ── Health ────────────────────────────────────────────────────────────
router.get("/health", (req: Request, env: Env) =>
  healthHandler(req, env)
);

// ── Config ────────────────────────────────────────────────────────────
router.get("/api/config", (_req: Request, env: Env) =>
  Response.json(getAccountInfo(env), { status: 200 })
);

// ── KV ───────────────────────────────────────────────────────────────
router.get("/api/kv/:key",
  (req: Request & { params: Record<string, string> }, env: Env) =>
    kvHandler(req.params.key, env)
);

// ── Video: list all ───────────────────────────────────────────────────
router.get("/api/video", (_req: Request, env: Env) =>
  videoListHandler(env)
);

// ── Video: VOD stream from R2 ─────────────────────────────────────────
router.get("/api/video/:filename",
  (req: Request & { params: Record<string, string> }, env: Env) =>
    videoHandler(req, env, req.params.filename)
);

// ── Live stream proxy ─────────────────────────────────────────────────
router.get("/api/live/:path",
  (req: Request & { params: Record<string, string> }, env: Env) =>
    liveStreamHandler(req, env, req.params.path)
);

// ── SmartRouter DO ────────────────────────────────────────────────────
router.all("/router/*", (req: Request, env: Env) => {
  const id   = env.SMART_ROUTER.idFromName("global");
  const stub = env.SMART_ROUTER.get(id);
  return stub.fetch(req);
});

// ── 404 catch-all ────────────────────────────────────────────────────
router.all("*", () =>
  Response.json(
    { error: "Not Found", message: "FWG-UltraEdge 🌍⚡ — Route not found" },
    { status: 404 }
  )
);
