// FWG-UltraEdge 🌍⚡ — src/middleware/smoother.ts
// Smoother: Coalescing + Circuit Breaker + Retry + Timeout + Degradation
import type { Env } from "../types/env";

const IN_FLIGHT = new Map<string, Promise<Response>>();

export async function withCoalescing(key: string, fetcher: () => Promise<Response>): Promise<Response> {
  if (IN_FLIGHT.has(key)) { const s = await IN_FLIGHT.get(key)!; return s.clone(); }
  const p = fetcher().finally(() => IN_FLIGHT.delete(key));
  IN_FLIGHT.set(key, p);
  return (await p).clone();
}

interface CircuitState { failures: number; lastFailure: number; state: "CLOSED"|"OPEN"|"HALF_OPEN"; }
const CIRCUIT = new Map<string, CircuitState>();
const CB = { threshold: 5, timeout: 30_000 } as const;
const getC = (s: string): CircuitState => CIRCUIT.get(s) ?? { failures: 0, lastFailure: 0, state: "CLOSED" };

export function recordSuccess(s: string): void { CIRCUIT.set(s, { failures: 0, lastFailure: 0, state: "CLOSED" }); }
export function recordFailure(s: string): void {
  const c = getC(s); const f = c.failures + 1;
  CIRCUIT.set(s, { failures: f, lastFailure: Date.now(), state: f >= CB.threshold ? "OPEN" : c.state });
}
export function isOpen(s: string): boolean {
  const c = getC(s);
  if (c.state === "CLOSED") return false;
  if (c.state === "OPEN" && Date.now() - c.lastFailure > CB.timeout) { CIRCUIT.set(s, { ...c, state: "HALF_OPEN" }); return false; }
  return c.state === "OPEN";
}

export function backoff(i: number, base=100, cap=3_000): number {
  const e = Math.min(cap, base * 2**i); return Math.floor(e + Math.random()*e*0.3);
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error(`Timeout ${ms}ms`)), ms))]);
}

export async function withRetry<T>(fn: () => Promise<T>, retries=3, svc="default", ms=10_000): Promise<T> {
  let last: unknown;
  for (let i=0; i<=retries; i++) {
    if (isOpen(svc)) throw new Error(`Circuit OPEN: ${svc}`);
    try { const r = await withTimeout(fn(), ms); recordSuccess(svc); return r; }
    catch(e) { last=e; recordFailure(svc); if (i<retries) await new Promise(r=>setTimeout(r,backoff(i))); }
  }
  throw last;
}

export function degradedResponse(pathname: string, env: Env): Response {
  const base = { app: env.APP_NAME??"FWG-UltraEdge", environment: env.ENVIRONMENT??"unknown", timestamp: new Date().toISOString() };
  const fb: Record<string,object> = {
    "/health": { ...base, status: "degraded", message: "Temporarily degraded 🌍⚡" },
    "/api/config": { ...base, degraded: true },
  };
  return Response.json(fb[pathname] ?? { error: "Service Unavailable", message: "FWG-UltraEdge 🌍⚡", retry: true },
    { status: 503, headers: { "Retry-After": "10", "X-Degraded": "1", "Cache-Control": "no-store" } });
}

export async function withSmoother(req: Request, env: Env, next: (req: Request) => Promise<Response>, svc="worker"): Promise<Response> {
  const url = new URL(req.url);
  const key = `${req.method}:${url.pathname}${url.search}`;
  try {
    if (req.method === "GET") return await withCoalescing(key, () => withRetry(() => next(req), 2, svc, 15_000));
    return await withRetry(() => next(req), 1, svc, 10_000);
  } catch { return degradedResponse(url.pathname, env); }
}
