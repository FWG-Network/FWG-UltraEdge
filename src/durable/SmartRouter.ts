// FWG-UltraEdge 🌍⚡ — SmartRouter Durable Object
// Version: 3.0.0 | Cloudflare Durable Objects

import type { Env } from "../types/env";

interface RouteRecord {
  path: string;
  hits: number;
  lastSeen: string;
  avgLatency: number;
  errors: number;
}

export class SmartRouter {
  private state: DurableObjectState;
  private env: Env;
  private routes: Map<string, RouteRecord> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<RouteRecord[]>("routes");
      if (stored) {
        this.routes = new Map(stored.map((r) => [r.path, r]));
      }
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    switch (url.pathname) {
      case "/record":
        return this.handleRecord(req);
      case "/stats":
        return this.handleStats();
      case "/reset":
        return this.handleReset();
      default:
        return Response.json({ error: "Not Found", path: url.pathname }, { status: 404 });
    }
  }

  // ── Record a route hit ──
  private async handleRecord(req: Request): Promise<Response> {
    try {
      const { path, latency, error } = await req.json<{
        path: string;
        latency: number;
        error?: boolean;
      }>();

      const existing = this.routes.get(path) ?? {
        path,
        hits: 0,
        lastSeen: "",
        avgLatency: 0,
        errors: 0,
      };

      const hits = existing.hits + 1;
      const avgLatency = Math.round((existing.avgLatency * existing.hits + latency) / hits);

      const updated: RouteRecord = {
        path,
        hits,
        lastSeen: new Date().toISOString(),
        avgLatency,
        errors: existing.errors + (error ? 1 : 0),
      };

      this.routes.set(path, updated);
      await this.state.storage.put("routes", Array.from(this.routes.values()));

      return Response.json({ ok: true, record: updated });
    } catch {
      return Response.json({ error: "Invalid payload" }, { status: 400 });
    }
  }

  // ── Get all stats ──
  private handleStats(): Response {
    const data = Array.from(this.routes.values()).sort((a, b) => b.hits - a.hits);
    return Response.json({
      ok: true,
      total_routes: data.length,
      total_hits: data.reduce((s, r) => s + r.hits, 0),
      routes: data,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Reset all stats ──
  private async handleReset(): Promise<Response> {
    this.routes.clear();
    await this.state.storage.delete("routes");
    return Response.json({ ok: true, message: "Stats reset" });
  }
}
