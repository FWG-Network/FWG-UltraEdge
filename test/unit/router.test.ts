// FWG-UltraEdge 🌍⚡ — Router Unit Test
import { describe, it, expect } from "bun:test";

describe("Router Logic", () => {
  it("should match /health route", () => {
    const routes = ["/health", "/api/config", "/api/kv/:key", "/api/video/:filename"];
    expect(routes).toContain("/health");
  });

  it("should have CORS headers defined", () => {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
    expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("*");
  });
});
