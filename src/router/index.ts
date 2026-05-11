// FWG-UltraEdge 🌍⚡ — Router
import { Router } from "itty-router";
import type { Env } from "../types/env";
import { healthHandler } from "../handlers/health";
import { videoHandler } from "../handlers/video";
import { kvHandler } from "../handlers/kv";

export const router = Router();

router.get("/health", (req: Request, env: Env) => healthHandler(req, env));
router.get("/api/kv/:key", (req: Request & { params: Record<string, string> }, env: Env) =>
  kvHandler(req.params.key, env)
);
router.get("/api/video/:filename", (req: Request & { params: Record<string, string> }, env: Env) =>
  videoHandler(req.params.filename, env)
);
router.get("/api/config", (_req: Request, env: Env) =>
  Response.json({
    app: env.APP_NAME,
    version: env.WORKER_VERSION,
    environment: env.ENVIRONMENT,
  })
);
router.all("*", () =>
  Response.json({ error: "Not Found", message: "FWG-UltraEdge 🌍⚡" }, { status: 404 })
);
