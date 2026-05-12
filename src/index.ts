/// <reference types="@cloudflare/workers-types" />
// ══════════════════════════════════════════════════════════════════════
// FWG-UltraEdge 🌍⚡ — src/index.ts
// Cloudflare Worker Entry Point
// Runtime: Bun + Wrangler | SLSA Level 3 | Smart Router (DO)
// ══════════════════════════════════════════════════════════════════════

// ── Use centralized router (handlers: health, video, kv) ─────────────
import { router } from "./router/index";

// ── Environment bindings (defined in wrangler.toml) ──────────────────
export interface Env {
  // KV Namespace
  KV: KVNamespace;

  // R2 Bucket
  R2: R2Bucket;

  // Durable Object
  SMART_ROUTER: DurableObjectNamespace;

  // Vars (non-secret)
  ENVIRONMENT: string;
  APP_NAME: string;
  WORKER_VERSION: string;
  CONFIG_API_URL: string;
  VIDEO_ORIGIN: string;

  // Secrets (set via wrangler secret put)
  HEALTH_CHECK_TOKEN: string;
  SENTRY_DSN: string;
  SLACK_WEBHOOK_URL: string;
}

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
    const url = new URL(req.url);
    const visits = ((await this.state.storage.get<number>("visits")) ?? 0) + 1;

    await this.state.storage.put("visits", visits);

    return Response.json(
      {
        path: url.pathname,
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
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ── CORS headers ──────────────────────────────────────────────
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ── Route request via centralized router ──────────────────────
    const response = await router.fetch(req, env, ctx);

    // ── Attach CORS + branding headers ────────────────────────────
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      headers.set(k, v);
    }
    headers.set("X-Powered-By", "FWG-UltraEdge 🌍⚡");
    headers.set("X-Environment", env.ENVIRONMENT ?? "unknown");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
