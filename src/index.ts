/// <reference types="@cloudflare/workers-types" />
// ══════════════════════════════════════════════════════════════════════
// FWG-UltraEdge 🌍⚡ — src/index.ts
// Cloudflare Worker Entry Point
// Runtime: Bun + Wrangler | SLSA Level 3 | Smart Router (DO)
// ══════════════════════════════════════════════════════════════════════

import { Router } from "itty-router";

// ── Environment bindings (defined in wrangler.toml) ──────────────────
export interface Env {
  // KV Namespace
  KV: KVNamespace;

  // R2 Bucket
  R2: R2Bucket;

  // Durable Object
  SMART_ROUTER: DurableObjectNamespace;

  // Vars (non-secret)
  ENVIRONMENT:    string;
  APP_NAME:       string;
  WORKER_VERSION: string;
  CONFIG_API_URL: string;
  VIDEO_ORIGIN:   string;

  // Secrets (set via wrangler secret put)
  HEALTH_CHECK_TOKEN: string;
  SENTRY_DSN:         string;
  SLACK_WEBHOOK_URL:  string;
}

// ── Router setup ─────────────────────────────────────────────────────
const router = Router();

// ════════════════════════════════════════════════════════════════════
// ROUTE: GET /health
// Used by: Job 8, 9, 10 Health Checks in deploy.yml
// Returns: 200 OK + build metadata JSON
// ════════════════════════════════════════════════════════════════════
router.get("/health", async (req: Request, env: Env): Promise<Response> => {
  // ── Bearer token validation (HEALTH_CHECK_TOKEN) ──────────────────
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();

  if (env.HEALTH_CHECK_TOKEN && token !== env.HEALTH_CHECK_TOKEN) {
    return Response.json(
      { status: "unauthorized", message: "Invalid token" },
      { status: 401 }
    );
  }

  // ── Health response ───────────────────────────────────────────────
  return Response.json(
    {
      status:      "ok",
      app:         env.APP_NAME       ?? "FWG-UltraEdge",
      version:     env.WORKER_VERSION ?? "3.0.0",
      environment: env.ENVIRONMENT    ?? "unknown",
      timestamp:   new Date().toISOString(),
      runtime:     "Cloudflare Workers 🌍⚡",
    },
    {
      status:  200,
      headers: {
        "Content-Type":  "application/json",
        "Cache-Control": "no-store",
        "X-App":         "FWG-UltraEdge",
      },
    }
  );
});

// ════════════════════════════════════════════════════════════════════
// ROUTE: GET /api/config
// Returns public configuration (non-secret vars)
// ════════════════════════════════════════════════════════════════════
router.get("/api/config", async (_req: Request, env: Env): Promise<Response> => {
  return Response.json(
    {
      app:          env.APP_NAME,
      version:      env.WORKER_VERSION,
      environment:  env.ENVIRONMENT,
      videoOrigin:  env.VIDEO_ORIGIN,
      configApiUrl: env.CONFIG_API_URL,
    },
    { status: 200 }
  );
});

// ════════════════════════════════════════════════════════════════════
// ROUTE: GET /api/kv/:key
// Read a value from KV namespace
// ════════════════════════════════════════════════════════════════════
router.get("/api/kv/:key", async (req: Request, env: Env): Promise<Response> => {
  const { key } = (req as Request & { params: Record<string, string> }).params;

  if (!key) {
    return Response.json({ error: "Key is required" }, { status: 400 });
  }

  const value = await env.KV.get(key);

  if (value === null) {
    return Response.json({ error: "Key not found" }, { status: 404 });
  }

  return Response.json({ key, value }, { status: 200 });
});

// ════════════════════════════════════════════════════════════════════
// ROUTE: GET /api/video/:filename
// Stream video from R2 bucket
// ════════════════════════════════════════════════════════════════════
router.get("/api/video/:filename", async (req: Request, env: Env): Promise<Response> => {
  const { filename } = (req as Request & { params: Record<string, string> }).params;

  if (!filename) {
    return Response.json({ error: "Filename is required" }, { status: 400 });
  }

  const object = await env.R2.get(filename);

  if (!object) {
    return Response.json({ error: "Video not found" }, { status: 404 });
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type":  object.httpMetadata?.contentType ?? "video/mp4",
      "Cache-Control": "public, max-age=31536000",
      "X-App":         "FWG-UltraEdge 🌍⚡",
    },
  });
});

// ════════════════════════════════════════════════════════════════════
// ROUTE: ALL /router/*
// Forward to SmartRouter Durable Object
// ════════════════════════════════════════════════════════════════════
router.all("/router/*", async (req: Request, env: Env): Promise<Response> => {
  const id    = env.SMART_ROUTER.idFromName("global");
  const stub  = env.SMART_ROUTER.get(id);
  return stub.fetch(req);
});

// ════════════════════════════════════════════════════════════════════
// ROUTE: 404 catch-all
// ════════════════════════════════════════════════════════════════════
router.all("*", (): Response => {
  return Response.json(
    {
      error:   "Not Found",
      message: "FWG-UltraEdge 🌍⚡ — Route not found",
    },
    { status: 404 }
  );
});

// ════════════════════════════════════════════════════════════════════
// DURABLE OBJECT: SmartRouter
// Referenced in wrangler.toml → SMART_ROUTER binding
// ════════════════════════════════════════════════════════════════════
export class SmartRouter {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(req: Request): Promise<Response> {
    const url    = new URL(req.url);
    const visits = ((await this.state.storage.get<number>("visits")) ?? 0) + 1;

    await this.state.storage.put("visits", visits);

    return Response.json(
      {
        path:    url.pathname,
        visits,
        message: "FWG-UltraEdge SmartRouter 🌍⚡",
      },
      { status: 200 }
    );
  }
}

// ════════════════════════════════════════════════════════════════════
// WORKER ENTRY POINT
// FWG-UltraEdge 🌍⚡ — fetch handler (required by Cloudflare Workers)
// ════════════════════════════════════════════════════════════════════
export default {
  async fetch(
    req:     Request,
    env:     Env,
    ctx:     ExecutionContext
  ): Promise<Response> {
    // ── CORS headers ──────────────────────────────────────────────
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── Route request ─────────────────────────────────────────────
    const response = await router.fetch(req, env, ctx);

    // ── Attach CORS + branding headers ────────────────────────────
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      headers.set(k, v);
    }
    headers.set("X-Powered-By", "FWG-UltraEdge 🌍⚡");
    headers.set("X-Environment", env.ENVIRONMENT ?? "unknown");

    return new Response(response.body, {
      status:     response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;