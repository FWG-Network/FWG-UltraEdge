// FWG-UltraEdge 🌍⚡ — KV Namespace Mock Test
import { describe, it, expect, mock } from "bun:test";

describe("KV Namespace", () => {
  it("should return null for missing key", async () => {
    const mockKV = {
      get: mock(async (_key: string) => null),
      put: mock(async () => {}),
    };
    const result = await mockKV.get("non-existent-key");
    expect(result).toBeNull();
  });

  it("should store and retrieve value", async () => {
    const store: Record<string, string> = {};
    const mockKV = {
      get: mock(async (key: string) => store[key] ?? null),
      put: mock(async (key: string, value: string) => {
        store[key] = value;
      }),
    };
    await mockKV.put("test-key", "test-value");
    const result = await mockKV.get("test-key");
    expect(result).toBe("test-value");
  });
});
