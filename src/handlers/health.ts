// FWG-UltraEdge 🌍⚡ — Health Handler
import type { Env } from "../types/env";

export async function healthHandler(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();

  if (env.HEALTH_CHECK_TOKEN && token !== env.HEALTH_CHECK_TOKEN) {
    return Response.json({ status: "unauthorized" }, { status: 401 });
  }

  return Response.json(
    {
      status: "ok",
      app: env.APP_NAME ?? "FWG-UltraEdge",
      version: env.WORKER_VERSION ?? "3.0.0",
      environment: env.ENVIRONMENT ?? "unknown",
      timestamp: new Date().toISOString(),
      runtime: "Cloudflare Workers 🌍⚡",
    },
    { status: 200 }
  );
}
