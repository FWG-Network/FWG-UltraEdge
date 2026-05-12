// FWG-UltraEdge 🌍⚡ — Worker Entry Point
// Version: 3.0.0 | Cloudflare Workers Runtime
/// <reference types="@cloudflare/workers-types" />

import type { Env } from "./types/env";
import { router } from "./router/index";
import { SmartRouter } from "./durable/SmartRouter";

export { SmartRouter };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID, CF-Ray",
  "Access-Control-Expose-Headers": "X-Powered-By, X-Environment, X-Response-Time",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      const url = new URL(req.url);
      const start = Date.now();

      ctx.waitUntil(
        (async () => {
          try {
            const id = env.SMART_ROUTER.idFromName("global");
            const stub = env.SMART_ROUTER.get(id);
            await stub.fetch(
              new Request("https://do/record", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  path: url.pathname,
                  latency: Date.now() - start,
                }),
              })
            );
          } catch {
            // silent
          }
        })()
      );

      const response = await router.fetch(req, env, ctx);
      const headers = new Headers(response.headers);

      for (const [k, v] of Object.entries(corsHeaders)) {
        headers.set(k, v);
      }
      headers.set("X-Powered-By", "FWG-UltraEdge 🌍⚡");
      headers.set("X-Environment", env.ENVIRONMENT ?? "unknown");
      headers.set("X-App-Version", env.APP_VERSION ?? "3.0.0");
      headers.set("X-Response-Time", `${Date.now() - start}ms`);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal Server Error";
      return Response.json(
        {
          error: "Internal Server Error",
          message,
          app: "FWG-UltraEdge 🌍⚡",
          timestamp: new Date().toISOString(),
        },
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "X-Powered-By": "FWG-UltraEdge 🌍⚡",
          },
        }
      );
    }
  },

  // ── Fix: use ScheduledController (not ScheduledEvent) ──
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const id = env.SMART_ROUTER.idFromName("global");
          const stub = env.SMART_ROUTER.get(id);
          await stub.fetch(new Request("https://do/reset"));
        } catch {
          // silent
        }
      })()
    );
  },
} satisfies ExportedHandler<Env>;
