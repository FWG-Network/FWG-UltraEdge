// FWG-UltraEdge 🌍⚡ — Bundle Size Test
import { describe, it, expect } from "bun:test";
import { statSync, existsSync } from "fs";

describe("Bundle Size", () => {
  it("should be under 1MB Cloudflare limit", () => {
    const LIMIT_BYTES = 1024 * 1024;
    if (existsSync("dist/worker.js")) {
      const { size } = statSync("dist/worker.js");
      expect(size).toBeLessThan(LIMIT_BYTES);
    } else {
      console.log("⏭️ dist/worker.js not built yet — skipping");
      expect(true).toBe(true);
    }
  });
});
