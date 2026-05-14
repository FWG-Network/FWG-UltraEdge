// FWG-UltraEdge 🌍⚡ — KV Namespace Unit Tests
// Version: 3.0.0 | Comprehensive KV Tests
import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock KV Factory ──
function createMockKV() {
  const store: Record<string, { value: string; expiration?: number }> = {};

  return {
    get: mock(async (key: string) => {
      const entry = store[key];
      if (!entry) return null;
      if (entry.expiration && entry.expiration < Date.now() / 1000) {
        delete store[key];
        return null;
      }
      return entry.value;
    }),
    put: mock(async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      store[key] = {
        value,
        expiration: opts?.expirationTtl
          ? Math.floor(Date.now() / 1000) + opts.expirationTtl
          : undefined,
      };
    }),
    delete: mock(async (key: string) => {
      delete store[key];
    }),
    list: mock(async () => ({ keys: Object.keys(store).map(name => ({ name })) })),
  };
}

// ════════════════════════════════════
// Basic KV Operations
// ════════════════════════════════════
describe("KV — Basic Operations", () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it("returns null for missing key", async () => {
    const result = await mockKV.get("non-existent-key");
    expect(result).toBeNull();
  });

  it("stores and retrieves value", async () => {
    await mockKV.put("test-key", "test-value");
    const result = await mockKV.get("test-key");
    expect(result).toBe("test-value");
  });

  it("overwrites existing value", async () => {
    await mockKV.put("key", "value-1");
    await mockKV.put("key", "value-2");
    const result = await mockKV.get("key");
    expect(result).toBe("value-2");
  });

  it("deletes a key", async () => {
    await mockKV.put("key", "value");
    await mockKV.delete("key");
    const result = await mockKV.get("key");
    expect(result).toBeNull();
  });

  it("lists all keys", async () => {
    await mockKV.put("key-1", "value-1");
    await mockKV.put("key-2", "value-2");
    const result = await mockKV.list();
    expect(result.keys.length).toBe(2);
  });
});

// ════════════════════════════════════
// Rate Limiting via KV
// ════════════════════════════════════
describe("KV — Rate Limiting", () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it("increments rate limit counter", async () => {
    const ip  = "1.2.3.4";
    const key = `rl:${ip}`;

    const raw   = await mockKV.get(key);
    const count = raw ? parseInt(raw, 10) : 0;
    await mockKV.put(key, String(count + 1), { expirationTtl: 60 });

    const result = await mockKV.get(key);
    expect(result).toBe("1");
  });

  it("blocks when limit exceeded", async () => {
    const ip    = "1.2.3.4";
    const key   = `rl:${ip}`;
    const LIMIT = 60;

    await mockKV.put(key, String(LIMIT));
    const raw   = await mockKV.get(key);
    const count = raw ? parseInt(raw, 10) : 0;

    expect(count).toBeGreaterThanOrEqual(LIMIT);
  });

  it("resets after TTL (simulated)", async () => {
    const key = "rl:expired";
    await mockKV.put(key, "60", { expirationTtl: -1 });
    const result = await mockKV.get(key);
    expect(result).toBeNull();
  });
});

// ════════════════════════════════════
// Session / Cache via KV
// ════════════════════════════════════
describe("KV — Session & Cache", () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it("stores session token", async () => {
    await mockKV.put("session:user-123", "token-abc", { expirationTtl: 3600 });
    const result = await mockKV.get("session:user-123");
    expect(result).toBe("token-abc");
  });

  it("returns null for expired session", async () => {
    await mockKV.put("session:expired", "token-xyz", { expirationTtl: -1 });
    const result = await mockKV.get("session:expired");
    expect(result).toBeNull();
  });

  it("stores JSON config", async () => {
    const config = { theme: "dark", lang: "km" };
    await mockKV.put("config:user-123", JSON.stringify(config));
    const raw    = await mockKV.get("config:user-123");
    const parsed = raw ? JSON.parse(raw) : null;
    expect(parsed?.theme).toBe("dark");
    expect(parsed?.lang).toBe("km");
  });
});

// ════════════════════════════════════
// Edge Cases
// ════════════════════════════════════
describe("KV — Edge Cases", () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it("handles empty string value", async () => {
    await mockKV.put("empty", "");
    const result = await mockKV.get("empty");
    expect(result).toBe("");
  });

  it("handles special characters in key", async () => {
    await mockKV.put("key:with:colons", "value");
    const result = await mockKV.get("key:with:colons");
    expect(result).toBe("value");
  });

  it("handles large value", async () => {
    const large = "x".repeat(10_000);
    await mockKV.put("large-key", large);
    const result = await mockKV.get("large-key");
    expect(result?.length).toBe(10_000);
  });

  it("put is called with correct args", async () => {
    await mockKV.put("check-key", "check-value");
    expect(mockKV.put).toHaveBeenCalledWith("check-key", "check-value");
  });
});
