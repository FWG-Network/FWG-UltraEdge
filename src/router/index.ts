// FWG-UltraEdge 🌍⚡ — src/router/index.ts
import { Router } from "itty-router";
import type { Env } from "../types/env";
import { healthHandler } from "../handlers/health";
import { videoHandler, liveStreamHandler, videoListHandler } from "../handlers/video";
import { kvGetHandler } from "../handlers/kv";
import { getAccountInfo } from "../providers/cloudflare";

export const router = Router();

router.get("/health", (req: Request, env: Env) => healthHandler(req, env));

router.get(
  "/api/config",
  (_req: Request, env: Env) =>
    Response.json(getAccountInfo(env), { status: 200 })
);

router.get(
  "/api/kv/:key",
  (req: Request & { params: Record<string, string | undefined> }, env: Env) => {
    const key = req.params.key;

    if (!key) {
      return Response.json({ error: "Bad Request" }, { status: 400 });
    }

    return kvGetHandler(req, env, key);
  }
);

router.get(
  "/api/video",
  (_req: Request, env: Env) => videoListHandler(env)
);

router.get(
  "/api/video/:filename",
  (req: Request & { params: Record<string, string | undefined> }, env: Env) => {
    const filename = req.params.filename;

    if (!filename) {
      return Response.json({ error: "Bad Request" }, { status: 400 });
    }

    return videoHandler(req, env, filename);
  }
);

router.get(
  "/api/live/:path",
  (req: Request & { params: Record<string, string | undefined> }, env: Env) => {
    const path = req.params.path;

    if (!path) {
      return Response.json({ error: "Bad Request" }, { status: 400 });
    }

    return liveStreamHandler(req, env, path);
  }
);

router.all("/router/*", (req: Request, env: Env) => {
  const id = env.SMART_ROUTER.idFromName("global");
  return env.SMART_ROUTER.get(id).fetch(req);
});

router.all(
  "*",
  () =>
    Response.json(
      {
        error: "Not Found",
        message: "FWG-UltraEdge 🌍⚡ — Route not found",
      },
      { status: 404 }
    )
);
