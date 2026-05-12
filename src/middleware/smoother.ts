// ══════════════════════════════════════════════════════════════════════
// FWG-UltraEdge 🌍⚡ — src/middleware/smoother.ts
// Smoother: Request Coalescing + Circuit Breaker + Smart Retry + Jitter
// + Graceful Degradation + Timeout Guard + AbortController
// Latest: AbortController + Promise.race timeout + structured errors
// ══════════════════════════════════════════════════════════════════════

import type { Env } from "../types/env";

// ── In-flight request coalescing ──────────────────────────────────────
const IN_FLIGHT = new Map<string, Promise<Response>>();

export async function withCoalescing(
  key:     string,
  fetcher: () => Promise<Response>
): Promise<Response> {
  if (IN_FLIGHT.has(key)) {
    const shared = await IN_FLIGHT.get(key)!;
    return shared.clone();
  }
  const promise = fetcher().finally(() => IN_FLIGHT.delete(key));
  IN_FLIGHT.set(key, promise);
  const res = await promise;
  return res.clone();
}

// ── Circuit Breaker ───────────────────────────────────────────────────
interface CircuitState {
  failures:    number;
  lastFailure: number;
  state:       "CLOSED" | "OPEN" | "HALF_OPEN";
}

const CIRCUIT = new Map<string, CircuitState>();
const CB = { threshold: 5, timeout: 30_000 } as const;

function getCircuit(svc: string): CircuitState {
  return CIRCUIT.get(svc) ?? { failures: 0, lastFailure: 0, state: "CLOSED" };
}

export function recordSuccess(svc: string): void {
  CIRCUIT.set(svc, { failures: 0, lastFailure: 0, state: "CLOSED" });
}

export function recordFailure(svc: string): void {
  const s = getCircuit(svc);
  const failures = s.failures + 1;
  CIRCUIT.set(svc, {
    failures,
    lastFailure: Date.now(),
    state: failures >= CB.threshold ? "OPEN" : s.state,
  });
}

export function isOpen(svc: string): boolean {
  const s = getCircuit(svc);
  if (s.state === "CLOSED") return false;
  if (s.state === "OPEN" && Date.now() - s.lastFailure > CB.timeout) {
    CIRCUIT.set(svc, { ...s, state: "HALF_OPEN" });
    return false;
  }
  return s.state === "OPEN";
}

// ── Exponential backoff with 30% jitter ──────────────────────────────
export function backoff(attempt: number, base = 100, cap = 3_000): number {
  const exp    = Math.min(cap, base * 2 ** attempt);
  const jitter = Math.random() * exp * 0.3;
  return Math.floor(exp + jitter);
}

// ── Timeout wrapper ───────────────────────────────────────────────────
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms`)), ms)),
  ]);
}

// ── Retry with circuit breaker + timeout ─────────────────────────────
export async function withRetry<T>(
  fn:       () => Promise<T>,
  retries   = 3,
  svc       = "default",
  timeoutMs = 10_000
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    if (isOpen(svc)) throw new Error(`Circuit OPEN: ${svc}`);
    try {
      const result = await withTimeout(fn(), timeoutMs);
      recordSuccess(svc);
      return result;
    } catch (err) {
      lastErr = err;
      recordFailure(svc);
      if (i < retries) await new Promise(r => setTimeout(r, backoff(i)));
    }
  }
  throw lastErr;
}

// ── Graceful degradation ──────────────────────────────────────────────
export function degradedResponse(pathname: string, env: Env): Response {
  const base = {
    app:         env.APP_NAME    ?? "FWG-UltraEdge",
    environment: env.ENVIRONMENT ?? "unknown",
    timestamp:   new Date().toISOString(),
  };
  const fallbacks: Record<string, object> = {
    "/health":     { ...base, status: "degraded", message: "Temporarily degraded 🌍⚡" },
    "/api/config": { ...base, degraded: true },
  };
  return Response.json(
    fallbacks[pathname] ?? { error: "Service Unavailable", message: "FWG-UltraEdge 🌍⚡", retry: true },
    { status: 503, headers: { "Retry-After": "10", "X-Degraded": "1", "Cache-Control": "no-store" } }
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN: withSmoother
// ══════════════════════════════════════════════════════════════════════
export async function withSmoother(
  req:  Request,
  env:  Env,
  next: (req: Request) => Promise<Response>,
  svc  = "worker"
): Promise<Response> {
  const url = new URL(req.url);
  const key = `${req.method}:${url.pathname}${url.search}`;
  try {
    if (req.method === "GET") {
      return await withCoalescing(key, () => withRetry(() => next(req), 2, svc, 15_000));
    }
    return await withRetry(() => next(req), 1, svc, 10_000);
  } catch {
    return degradedResponse(url.pathname, env);
  }
}
