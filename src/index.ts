/// <reference types="@cloudflare/workers-types" />

// ═══════════════════════════════════════════════════════════════════════════════
// ultra-edge-deploy — Cloudflare Worker  v2.1.0
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Env ──────────────────────────────────────────────────────────────────────

export interface Env {
  VIDEO_ORIGIN:       string;
  SMART_ROUTER:       DurableObjectNamespace;
  CLICKHOUSE_INGEST:  string;
  CLICKHOUSE_URL:     string;
  CLICKHOUSE_USER:    string;
  CLICKHOUSE_PASS:    string;
  SENTRY_DSN:         string;
  KV:                 KVNamespace;
  R2:                 R2Bucket;
  CIRCUIT:            DurableObjectNamespace;
  CONFIG_API_URL:     string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockReason = "blocked_host" | "blocked_ua" | "rate_limited" | "ok";

interface MetricsPayload {
  url:          string;
  method:       string;
  status:       number;
  latency:      number;
  cached?:      boolean;
  contentType?: string;
  userAgent?:   string;
  reason?:      BlockReason;
  ip?:          string;
  timestamp:    number;
  origin?:      string;
  country?:     string;
  colo?:        string;
}

interface ClickHousePayload {
  latency: number;
  status:  number;
  region?: string;
  route?:  string;
  colo?:   string;
}

// ─── PAC File ─────────────────────────────────────────────────────────────────

const PAC = `
function FindProxyForURL(url, host) {
  if (
    isPlainHostName(host) ||
    shExpMatch(host, "*.local") ||
    isInNet(dnsResolve(host), "127.0.0.1", "255.0.0.0") ||
    isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0") ||
    isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0")
  ) { return "DIRECT"; }

  if (
    shExpMatch(host, "*.khfullhd.co")         ||
    shExpMatch(host, "*.onstream.cam")        ||
    shExpMatch(host, "*.filmxy.vip")          ||
    shExpMatch(host, "*.khdiamond.net")       ||
    shExpMatch(host, "*wildrift*")            ||
    shExpMatch(host, "*.steam.com")           ||
    shExpMatch(host, "*.steampowered.com")    ||
    shExpMatch(host, "*.leagueoflegends.com") ||
    shExpMatch(host, "*.counter-strike.net")  ||
    shExpMatch(host, "*.mobilelegends.com")
  ) { return "DIRECT"; }

  if (
    shExpMatch(host, "*.youtube.com")     ||
    shExpMatch(host, "*.googlevideo.com") ||
    shExpMatch(host, "*.ytimg.com")       ||
    shExpMatch(host, "*.ggpht.com")       ||
    shExpMatch(host, "youtu.be")
  ) { return "PROXY fasterwgserverkh.cloudflareaccess.com:443"; }

  return "DIRECT";
}
`;

// ─── Config ───────────────────────────────────────────────────────────────────

const WORKER_VERSION = "2.1.0";

const BLOCKED_HOSTS_SET = new Set([
  "doubleclick.net", "googlesyndication.com",
  "adservice.google.com", "googletagmanager.com",
  "adnxs.com", "moatads.com",
]);

// ✅ FIX v2.1.0: "curl" and "wget" removed from production block list.
//
// REASON: The CI/CD health check (GitHub Actions) uses curl to probe the
// worker. Blocking "curl" caused HTTP 403 on every deployment verification.
//
// SECURITY NOTE: Root `/` and all content routes are still protected by:
//   1) isBlockedHost()   — ad/tracker domain blocking
//   2) checkRateLimit()  — 60 req/min per IP
//   3) /health endpoint  — always bypasses all guards (intentional)
//
// Automated scanners / scrapers are better handled at the Cloudflare WAF
// or Bot Management layer rather than UA string matching, which is trivially
// bypassed by any real attacker anyway.
const BLOCKED_UA_SET = new Set([
  "python", "scrapy",
  "httpclient", "bot", "spider", "crawler", "scan",
]);

// ✅ Trusted CI User-Agents — always bypass UA block
const CI_UA_PREFIXES = [
  "github-actions",
  "obs-browsersource",
  "github-actions-healthcheck",
  "github-actions-benchmark",
];

const RATE_LIMIT       = 60;
const RATE_WINDOW_SEC  = 60;

// ─── Security Headers ─────────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  "x-frame-options":              "SAMEORIGIN",
  "x-content-type-options":       "nosniff",
  "x-xss-protection":             "1; mode=block",
  "referrer-policy":              "strict-origin-when-cross-origin",
  "strict-transport-security":    "max-age=31536000; includeSubDomains; preload",
  "permissions-policy":           "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "access-control-allow-origin":  "*",
};

function applySecurityHeaders(
  resp:  Response,
  extra?: Record<string, string>,
): Response {
  const h = new Headers(resp.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  if (extra) for (const [k, v] of Object.entries(extra))   h.set(k, v);
  return new Response(resp.body, {
    status: resp.status, statusText: resp.statusText, headers: h,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isBlockedHost(hostname: string): boolean {
  const parts = hostname.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (BLOCKED_HOSTS_SET.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

/**
 * Returns true if the User-Agent should be blocked.
 *
 * ✅ CI/CD agents (GitHub Actions, OBS sim) are always allowed via
 *    CI_UA_PREFIXES — they must NOT be blocked or deploys will always 403.
 */
function isBlockedUA(ua: string): boolean {
  const lower = ua.toLowerCase();

  // Allow trusted CI/CD agents explicitly
  for (const prefix of CI_UA_PREFIXES) {
    if (lower.startsWith(prefix)) return false;
  }

  // Block known scrapers / bots
  for (const keyword of BLOCKED_UA_SET) {
    if (lower.includes(keyword)) return true;
  }

  return false;
}

async function checkRateLimit(kv: KVNamespace, ip: string): Promise<boolean> {
  const key   = `rl:${ip}`;
  const raw   = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= RATE_LIMIT) return true;
  await kv.put(key, String(count + 1), { expirationTtl: RATE_WINDOW_SEC });
  return false;
}

// ─── ClickHouse Logger ────────────────────────────────────────────────────────

async function sendToClickHouse(env: Env, data: ClickHousePayload): Promise<void> {
  if (!env.CLICKHOUSE_URL) return;
  const query = `INSERT INTO edge_logs (timestamp,latency,status,region,route,colo) FORMAT JSONEachRow`;
  try {
    await fetch(env.CLICKHOUSE_URL, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${env.CLICKHOUSE_USER}:${env.CLICKHOUSE_PASS}`),
        "Content-Type":  "application/json",
      },
      body: query + "\n" + JSON.stringify({
        timestamp: new Date().toISOString(),
        latency:   data.latency,
        status:    data.status,
        region:    data.region  ?? "",
        route:     data.route   ?? "",
        colo:      data.colo    ?? "",
      }),
    });
  } catch (e) {
    console.error("[ClickHouse] error:", e);
  }
}

// ─── Sentry Error Reporter ────────────────────────────────────────────────────

async function sendToSentry(env: Env, error: Error): Promise<void> {
  if (!env.SENTRY_DSN) return;
  try {
    await fetch(env.SENTRY_DSN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:   error.message,
        stack:     error.stack,
        timestamp: Date.now(),
      }),
    });
  } catch (e) {
    console.error("[Sentry] error:", e);
  }
}

// ─── Metrics Logger ───────────────────────────────────────────────────────────

function sendMetrics(env: Env, ctx: ExecutionContext, data: MetricsPayload): void {
  ctx.waitUntil(logMetrics(env, data));
}

async function logMetrics(env: Env, data: MetricsPayload): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (env.SMART_ROUTER) {
    tasks.push((async () => {
      try {
        const id   = env.SMART_ROUTER.idFromName("global");
        const stub = env.SMART_ROUTER.get(id);
        await stub.fetch("https://internal/log", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(data),
        });
      } catch (e) { console.error("[SmartRouter] error:", e); }
    })());
  }

  if (env.CLICKHOUSE_URL) {
    tasks.push(sendToClickHouse(env, {
      latency: data.latency,
      status:  data.status,
      colo:    data.colo,
    }));
  }

  await Promise.allSettled(tasks);
}

// ─── Prometheus Metrics Endpoint ──────────────────────────────────────────────

async function prometheusMetrics(env: Env): Promise<Response> {
  try {
    const id   = env.SMART_ROUTER.idFromName("global");
    const stub = env.SMART_ROUTER.get(id);
    const res  = await stub.fetch("https://internal/?limit=1000");
    const json = await res.json() as { total: number; logs: any[] };

    const total      = json.total ?? 0;
    const logs       = json.logs  ?? [];
    const errors     = logs.filter((l: any) => l.status >= 500).length;
    const avgLatency = logs.length
      ? logs.reduce((a: number, b: any) => a + (b.latency ?? 0), 0) / logs.length
      : 0;

    return new Response(
      `# HELP requests_total Total requests
# TYPE requests_total counter
requests_total ${total}

# HELP errors_total Total 5xx errors
# TYPE errors_total counter
errors_total ${errors}

# HELP avg_latency_ms Average latency in ms
# TYPE avg_latency_ms gauge
avg_latency_ms ${avgLatency.toFixed(2)}
`.trim(),
      { headers: { "Content-Type": "text/plain; version=0.0.4" } }
    );
  } catch (_err) {
    return new Response("metrics unavailable", { status: 503 });
  }
}

// ─── Smart Routing ────────────────────────────────────────────────────────────

interface Origin {
  name: string;
  url:  string;
}

interface OriginResult {
  ok:        boolean;
  status?:   number;
  latency:   number;
  origin:    string;
  response?: Response;
}

function smartRoute(request: Request, env: Env): Origin[] {
  const cf      = (request as any).cf ?? {};
  const country = cf.country ?? "unknown";

  const routes: Origin[] = [
    { name: "primary-us", url: env.VIDEO_ORIGIN },
    { name: "asia-edge",  url: "https://asia-origin.example.com" },
    { name: "eu-edge",    url: "https://eu-origin.example.com" },
  ];

  if (country === "KH" || country === "TH") return [routes[1], routes[0]];
  if (country === "US")                      return [routes[0], routes[1]];
  return routes;
}

async function raceOrigins(
  origins: Origin[],
  timeout = 2000,
): Promise<OriginResult | null> {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeout);

  try {
    const requests = origins.map(async (origin): Promise<OriginResult> => {
      const start = Date.now();
      try {
        const res     = await fetch(origin.url, { signal: controller.signal });
        const latency = Date.now() - start;
        return { ok: res.ok, status: res.status, latency, origin: origin.name, response: res };
      } catch (_err) {
        return { ok: false, latency: Infinity, origin: origin.name };
      }
    });

    const results = await Promise.all(requests);
    clearTimeout(timer);

    // Pick fastest healthy origin
    return results
      .filter(r => r.ok)
      .sort((a, b) => a.latency - b.latency)[0] ?? null;

  } catch (_err) {
    return null;
  }
}

// ─── Core Handler ─────────────────────────────────────────────────────────────

async function handleRequest(
  request: Request,
  env:     Env,
  ctx:     ExecutionContext,
): Promise<Response> {
  const start    = Date.now();
  const url      = new URL(request.url);
  const hostname = url.hostname;
  const ip       = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
  const ua       = request.headers.get("user-agent") ?? "";
  const cf       = (request as any).cf ?? {};

  const metric = (status: number, reason: BlockReason, cached = false) =>
    sendMetrics(env, ctx, {
      url: request.url, method: request.method,
      status, latency: Date.now() - start,
      cached, reason, ip, userAgent: ua,
      country: cf.country, colo: cf.colo,
      timestamp: Date.now(),
    });

  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // ── /health ─────────────────────────────────────────────────────────────────
  // ✅ This endpoint INTENTIONALLY bypasses all security checks.
  // It is used by CI/CD pipelines, uptime monitors, and load balancers.
  // Must always return HTTP 200 to confirm the worker is alive.
  if (url.pathname === "/health") {
    return Response.json({
      status:    "ok",
      timestamp: Date.now(),
      version:   WORKER_VERSION,
      colo:      cf.colo ?? "unknown",
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache",
        "X-Worker-Version": WORKER_VERSION,
      },
    });
  }

  // ── /metrics (Prometheus) ───────────────────────────────────────────────────
  if (url.pathname === "/metrics") {
    return prometheusMetrics(env);
  }

  // ── /pac ────────────────────────────────────────────────────────────────────
  if (url.pathname === "/pac") {
    return new Response(PAC, {
      headers: {
        "Content-Type":              "application/x-ns-proxy-autoconfig",
        "Cache-Control":             "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options":    "nosniff",
      },
    });
  }

  // ── Security Layer ──────────────────────────────────────────────────────────

  // 1) Block ad/tracker domains
  if (isBlockedHost(hostname)) {
    metric(403, "blocked_host");
    return new Response("Blocked", { status: 403 });
  }

  // 2) Block malicious bots (CI agents are explicitly allowed)
  if (isBlockedUA(ua)) {
    metric(403, "blocked_ua");
    return new Response("Bot blocked", { status: 403 });
  }

  // 3) Rate limiting
  if (await checkRateLimit(env.KV, ip)) {
    metric(429, "rate_limited");
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(RATE_WINDOW_SEC) },
    });
  }

  // ── GET — Cache + Proxy ─────────────────────────────────────────────────────
  if (request.method === "GET") {
    const cache    = (caches as any).default as Cache;
    const cacheKey = new Request(request.url, request);

    const cached = await cache.match(cacheKey);
    if (cached) {
      metric(cached.status, "ok", true);
      return applySecurityHeaders(cached, { "X-Cache-Status": "HIT" });
    }

    let origin: Response;
    try {
      origin = await fetch(request, {
        cf: {
          cacheTtl:       1800,
          cacheEverything: true,
          minify: { javascript: true, css: true, html: true },
        },
      });
    } catch (_err) {
      return new Response("Upstream Error", { status: 502 });
    }

    if (!origin.ok && origin.status !== 206) {
      return new Response("Upstream Error", { status: 502 });
    }

    const contentType = origin.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      metric(origin.status, "ok", false);
      return applySecurityHeaders(origin, { "X-Cache-Status": "MISS" });
    }

    const isVideo = contentType.includes("video") ||
      /\.(mp4|webm|m3u8|ts|mkv|avi)$/i.test(url.pathname);
    const maxAge  = isVideo ? 31_536_000 : 1_800;

    const resp = applySecurityHeaders(origin, {
      "Cache-Control":  `public, max-age=${maxAge}`,
      "X-Cache-Status": "MISS",
    });

    ctx.waitUntil(
      Promise.allSettled([
        cache.put(cacheKey, resp.clone()),
        logMetrics(env, {
          url: request.url, method: request.method,
          status: resp.status, latency: Date.now() - start,
          cached: false, contentType, reason: "ok",
          ip, userAgent: ua, colo: cf.colo, timestamp: Date.now(),
        }),
      ])
    );

    return resp;
  }

  // ── POST / PUT / DELETE passthrough ─────────────────────────────────────────
  try {
    const fallback = await fetch(request);
    const resp     = applySecurityHeaders(fallback);
    metric(resp.status, "ok", false);
    return resp;
  } catch (_err) {
    return new Response("Internal Server Error", { status: 500 });
  }
}

// ─── Durable Objects ──────────────────────────────────────────────────────────

export class CircuitBreaker implements DurableObject {
  private st: DurableObjectState;

  static FAILURE_THRESHOLD = 5;
  static RECOVERY_TIMEOUT  = 30_000;
  static HALF_OPEN_PROBES  = 2;

  constructor(state: DurableObjectState) { this.st = state; }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/status")         return Response.json(await this.getState());
    if (pathname === "/record-failure") return Response.json(await this.recordFailure());
    if (pathname === "/record-success") return Response.json(await this.recordSuccess());
    if (pathname === "/open") {
      await this.st.storage.put("state", "OPEN");
      return Response.json({ state: "OPEN" });
    }
    if (pathname === "/close") return Response.json(await this.resetState());

    return new Response("Not Found", { status: 404 });
  }

  private async getState() {
    const [state, failures, lastFailure, successes] = await Promise.all([
      this.st.storage.get<string>("state"),
      this.st.storage.get<number>("failures"),
      this.st.storage.get<number>("lastFailure"),
      this.st.storage.get<number>("successes"),
    ]);
    return {
      state:       state       ?? "CLOSED",
      failures:    failures    ?? 0,
      lastFailure: lastFailure ?? 0,
      successes:   successes   ?? 0,
    };
  }

  private async resetState() {
    await Promise.all([
      this.st.storage.put("state",       "CLOSED"),
      this.st.storage.put("failures",    0),
      this.st.storage.put("successes",   0),
      this.st.storage.put("lastFailure", 0),
    ]);
    return this.getState();
  }

  private async recordFailure() {
    const s   = await this.getState();
    const now = Date.now();

    if (s.state === "OPEN") {
      if (now - s.lastFailure > CircuitBreaker.RECOVERY_TIMEOUT) {
        await this.st.storage.put("state",     "HALF_OPEN");
        await this.st.storage.put("successes", 0);
      }
      return this.getState();
    }

    const failures = s.failures + 1;
    await this.st.storage.put("failures",    failures);
    await this.st.storage.put("lastFailure", now);
    if (failures >= CircuitBreaker.FAILURE_THRESHOLD) {
      await this.st.storage.put("state", "OPEN");
    }
    return this.getState();
  }

  private async recordSuccess() {
    const s = await this.getState();
    if (s.state === "HALF_OPEN") {
      const successes = s.successes + 1;
      await this.st.storage.put("successes", successes);
      if (successes >= CircuitBreaker.HALF_OPEN_PROBES) return this.resetState();
    } else if (s.state === "CLOSED") {
      await this.st.storage.put("failures", 0);
    }
    return this.getState();
  }
}

export class SmartRouter implements DurableObject {
  private state: DurableObjectState;
  private logs: any[] = [];

  constructor(state: DurableObjectState) { this.state = state; }

  async fetch(request: Request): Promise<Response> {
    if (this.logs.length === 0) {
      this.logs = (await this.state.storage.get<any[]>("logs")) ?? [];
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin":  "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE",
        },
      });
    }

    if (request.method === "POST") {
      let data: unknown;
      try {
          data = await request.json();
        } catch (_err) {
          // silent
        }

      this.logs.push(data);
      if (this.logs.length > 1000) this.logs.shift();
      await this.state.storage.put("logs", this.logs);
      return Response.json({ ok: true });
    }

    // GET — return logs
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const logs = this.logs.slice(-limit);
    return Response.json({ total: this.logs.length, logs });
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await handleRequest(request, env, ctx);
    } catch (err) {
      if (err instanceof Error) await sendToSentry(env, err);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
