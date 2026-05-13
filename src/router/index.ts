// FWG-UltraEdge 🌍⚡ — src/router/index.ts
import { Router } from "itty-router";
import type { Env } from "../types/env";
import { healthHandler } from "../handlers/health";
import { handleProxy } from "../handlers/proxy"; // line import
import { videoHandler, liveStreamHandler, videoListHandler } from "../handlers/video";
import { kvGetHandler, kvPutHandler, kvDeleteHandler, kvListHandler } from "../handlers/kv";
import { getAccountInfo, listR2Objects, purgeCache } from "../providers/cloudflare";
import {
  getRestreamProfile,
  getRestreamChannels,
  getRestreamAnalytics,
} from "../providers/restream";
import { handleProxy } from "../handlers/proxy"; // ← បន្ថែម

export const router = Router();

// ── Health ──
router.get("/health", (req: Request, env: Env) => healthHandler(req, env));

// ── Config ──
router.get("/api/config", (_req: Request, env: Env) =>
  Response.json({
    ok: true,
    app: env.APP_NAME,
    version: env.APP_VERSION,
    environment: env.ENVIRONMENT,
  })
);

// ── Proxy PAC ── ← បន្ថែម
router.get("/proxy.pac", (req: Request) => handleProxy(req));
router.get("/wpad.dat", (req: Request) => handleProxy(req));

// ── Account ──
router.get("/api/account", (_req: Request, env: Env) => getAccountInfo(env));

// ── Video ──
router.get("/api/video", (_req: Request, env: Env) => videoListHandler(env));
router.get("/api/video/:filename", (req: Request & { params: Record<string, string> }, env: Env) =>
  videoHandler(req, env, req.params.filename)
);

// ── Live ──
router.get("/api/live/:path", (req: Request & { params: Record<string, string> }, env: Env) =>
  liveStreamHandler(req, env, req.params.path)
);

// ── KV ──
router.get("/api/kv", (req: Request, env: Env) => kvListHandler(req, env));
router.get("/api/kv/:key", (req: Request & { params: Record<string, string> }, env: Env) =>
  kvGetHandler(req, env, req.params.key)
);
router.put("/api/kv/:key", (req: Request & { params: Record<string, string> }, env: Env) =>
  kvPutHandler(req, env, req.params.key)
);
router.delete("/api/kv/:key", (req: Request & { params: Record<string, string> }, env: Env) =>
  kvDeleteHandler(env, req.params.key)
);

// ── R2 ──
router.get("/api/r2", (req: Request, env: Env) => listR2Objects(req, env));
router.post("/api/cache/purge", async (req: Request, env: Env) => {
  const { keys } = await req.json<{ keys: string[] }>();
  return purgeCache(env, keys);
});

// ── Restream ──
router.get("/api/restream/profile", (_req: Request, env: Env) => getRestreamProfile(env));
router.get("/api/restream/channels", (_req: Request, env: Env) => getRestreamChannels(env));
router.get("/api/restream/analytics", (_req: Request, env: Env) => getRestreamAnalytics(env));

// ── 404 ──
router.all("*", () =>
  Response.json(
    { error: "Not Found", message: "FWG-UltraEdge 🌍⚡ — Route not found" },
    { status: 404 }
  )
);
