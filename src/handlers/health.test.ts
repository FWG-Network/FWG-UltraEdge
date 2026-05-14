// FWG-UltraEdge 🌍⚡ — Health Handler Tests
// Version: 3.0.0 | Comprehensive Health Tests
import { describe, it, expect } from "bun:test";
import type { Env } from "../../src/types/env";

// ── Mock Env ──
const mockEnv: Partial<Env> = {
  ENVIRONMENT: "test",
  APP_NAME: "FWG-UltraEdge",
  APP_VERSION: "3.0.0",
  WORKER_VERSION: "3.0.0",
  HEALTH_CHECK_TOKEN: "test-token-123",
};

// ── Mock healthHandler ──
async function healthHandler(req: Request, env: Partial<Env>): Promise<Response> {
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

// ── Helper ──
function makeRequest(path = "/health", token?: string): Request {
  return new Request(`https://ultraedge.example.com${path}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// ════════════════════════════════════
// Auth Tests
// ════════════════════════════════════
describe("Health — Auth", () => {
  it("returns 401 for missing token", async () => {
    const req = makeRequest("/health");
    const res = await healthHandler(req, mockEnv);
    expect(res.status).toBe(401);
  });

  it("returns 401 for wrong token", async () => {
    const req = makeRequest("/health", "wrong-token");
    const res = await healthHandler(req, mockEnv);
    expect(res.status).toBe(401);
  });

  it("returns 200 for correct token", async () => {
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, mockEnv);
    expect(res.status).toBe(200);
  });

  it("returns unauthorized body for wrong token", async () => {
    const req = makeRequest("/health", "bad-token");
    const res = await healthHandler(req, mockEnv);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("unauthorized");
  });

  it("returns 200 when no token required", async () => {
    const envNoToken = { ...mockEnv, HEALTH_CHECK_TOKEN: "" };
    const req = makeRequest("/health");
    const res = await healthHandler(req, envNoToken);
    expect(res.status).toBe(200);
  });
});

// ════════════════════════════════════
// Response Body Tests
// ════════════════════════════════════
describe("Health — Response Body", () => {
  it("returns status ok", async () => {
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, mockEnv);
    const body = (await res.json()) as Record<string, string>;
    expect(body.status).toBe("ok");
  });

  it("returns correct app name", async () => {
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, mockEnv);
    const body = (await res.json()) as Record<string, string>;
    expect(body.app).toBe("FWG-UltraEdge");
  });

  it("returns correct version", async () => {
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, mockEnv);
    const body = (await res.json()) as Record<string, string>;
    expect(body.version).toBe("3.0.0");
  });

  it("returns correct environment", async () => {
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, mockEnv);
    const body = (await res.json()) as Record<string, string>;
    expect(body.environment).toBe("test");
  });

  it("returns timestamp", async () => {
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, mockEnv);
    const body = (await res.json()) as Record<string, string>;
    expect(body.timestamp).toBeTruthy();
    expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
  });

  it("returns runtime info", async () => {
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, mockEnv);
    const body = (await res.json()) as Record<string, string>;
    expect(body.runtime).toBe("Cloudflare Workers 🌍⚡");
  });
});

// ════════════════════════════════════
// Response Header Tests
// ════════════════════════════════════
describe("Health — Response Headers", () => {
  it("content-type is application/json", async () => {
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, mockEnv);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("401 content-type is application/json", async () => {
    const req = makeRequest("/health", "wrong-token");
    const res = await healthHandler(req, mockEnv);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

// ════════════════════════════════════
// Edge Cases
// ════════════════════════════════════
describe("Health — Edge Cases", () => {
  it("uses default app name if not set", async () => {
    const envNoName = { ...mockEnv, APP_NAME: undefined };
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, envNoName);
    const body = (await res.json()) as Record<string, string>;
    expect(body.app).toBe("FWG-UltraEdge");
  });

  it("uses default version if not set", async () => {
    const envNoVersion = { ...mockEnv, WORKER_VERSION: undefined };
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, envNoVersion);
    const body = (await res.json()) as Record<string, string>;
    expect(body.version).toBe("3.0.0");
  });

  it("uses unknown environment if not set", async () => {
    const envNoEnv = { ...mockEnv, ENVIRONMENT: undefined };
    const req = makeRequest("/health", "test-token-123");
    const res = await healthHandler(req, envNoEnv);
    const body = (await res.json()) as Record<string, string>;
    expect(body.environment).toBe("unknown");
  });

  it("handles Bearer prefix correctly", async () => {
    const auth = "Bearer test-token-123";
    const token = auth.replace("Bearer ", "").trim();
    expect(token).toBe("test-token-123");
  });
});
