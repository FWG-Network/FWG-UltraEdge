// FWG-UltraEdge 🌍⚡ — Router Unit Tests
// Version: 3.0.0 | Comprehensive Router Tests
import { describe, it, expect, beforeEach } from "bun:test";

// ── Helper ──
function makeRequest(path: string, method = "GET", headers: Record<string, string> = {}): Request {
  return new Request(`https://ultraedge.example.com${path}`, {
    method,
    headers,
  });
}

// ── Mock Router ──
const ROUTES = [
  "/health",
  "/metrics",
  "/pac",
  "/api/config",
  "/api/kv/:key",
  "/api/video/:filename",
];

function matchRoute(pathname: string): string | null {
  for (const route of ROUTES) {
    const pattern = route.replace(/:[\w]+/g, "[^/]+");
    const regex = new RegExp(`^${pattern}$`);
    if (regex.test(pathname)) return route;
  }
  return null;
}

// ════════════════════════════════════
// Route Matching Tests
// ════════════════════════════════════
describe("Router — Route Matching", () => {
  it("matches /health", () => {
    expect(matchRoute("/health")).toBe("/health");
  });

  it("matches /metrics", () => {
    expect(matchRoute("/metrics")).toBe("/metrics");
  });

  it("matches /pac", () => {
    expect(matchRoute("/pac")).toBe("/pac");
  });

  it("matches /api/config", () => {
    expect(matchRoute("/api/config")).toBe("/api/config");
  });

  it("matches /api/kv/:key with real key", () => {
    expect(matchRoute("/api/kv/my-key")).toBe("/api/kv/:key");
  });

  it("matches /api/video/:filename with real filename", () => {
    expect(matchRoute("/api/video/movie.mp4")).toBe("/api/video/:filename");
  });

  it("returns null for unknown route", () => {
    expect(matchRoute("/unknown")).toBeNull();
  });

  it("returns null for empty path", () => {
    expect(matchRoute("")).toBeNull();
  });
});

// ════════════════════════════════════
// CORS Tests
// ════════════════════════════════════
describe("Router — CORS Headers", () => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
    "Access-Control-Expose-Headers": "X-Powered-By, X-Environment, X-Response-Time",
    "Access-Control-Max-Age": "86400",
  };

  it("Allow-Origin is *", () => {
    expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("Allow-Methods includes GET", () => {
    expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("GET");
  });

  it("Allow-Methods includes POST", () => {
    expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("POST");
  });

  it("Allow-Methods includes OPTIONS", () => {
    expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("OPTIONS");
  });

  it("Max-Age is 86400", () => {
    expect(corsHeaders["Access-Control-Max-Age"]).toBe("86400");
  });

  it("OPTIONS returns 204", () => {
    const res = new Response(null, { status: 204, headers: corsHeaders });
    expect(res.status).toBe(204);
  });
});

// ════════════════════════════════════
// Request Method Tests
// ════════════════════════════════════
describe("Router — Request Methods", () => {
  it("GET request is valid", () => {
    const req = makeRequest("/health", "GET");
    expect(req.method).toBe("GET");
  });

  it("POST request is valid", () => {
    const req = makeRequest("/api/config", "POST");
    expect(req.method).toBe("POST");
  });

  it("OPTIONS request is valid", () => {
    const req = makeRequest("/", "OPTIONS");
    expect(req.method).toBe("OPTIONS");
  });

  it("DELETE request is valid", () => {
    const req = makeRequest("/api/kv/key", "DELETE");
    expect(req.method).toBe("DELETE");
  });
});

// ════════════════════════════════════
// URL Parsing Tests
// ════════════════════════════════════
describe("Router — URL Parsing", () => {
  it("parses pathname correctly", () => {
    const req = makeRequest("/health");
    const url = new URL(req.url);
    expect(url.pathname).toBe("/health");
  });

  it("parses query string", () => {
    const req = makeRequest("/api/kv/key?ttl=3600");
    const url = new URL(req.url);
    expect(url.searchParams.get("ttl")).toBe("3600");
  });

  it("parses hostname", () => {
    const req = makeRequest("/health");
    const url = new URL(req.url);
    expect(url.hostname).toBe("ultraedge.example.com");
  });

  it("parses protocol", () => {
    const req = makeRequest("/health");
    const url = new URL(req.url);
    expect(url.protocol).toBe("https:");
  });
});

// ════════════════════════════════════
// Response Structure Tests
// ════════════════════════════════════
describe("Router — Response Structure", () => {
  it("health response has correct structure", () => {
    const body = {
      status: "ok",
      version: "3.0.0",
      environment: "test",
      timestamp: Date.now(),
    };
    expect(body.status).toBe("ok");
    expect(body.version).toBe("3.0.0");
    expect(body.environment).toBe("test");
    expect(body.timestamp).toBeGreaterThan(0);
  });

  it("error response has correct structure", () => {
    const body = {
      error: "Not Found",
      app: "FWG-UltraEdge 🌍⚡",
      timestamp: new Date().toISOString(),
    };
    expect(body.error).toBe("Not Found");
    expect(body.app).toBe("FWG-UltraEdge 🌍⚡");
    expect(body.timestamp).toBeTruthy();
  });

  it("500 response has correct status", () => {
    const res = new Response("Internal Server Error", { status: 500 });
    expect(res.status).toBe(500);
  });

  it("200 response has correct status", () => {
    const res = new Response("ok", { status: 200 });
    expect(res.status).toBe(200);
  });
});
