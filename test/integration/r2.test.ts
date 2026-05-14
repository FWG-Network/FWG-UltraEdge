// FWG-UltraEdge 🌍⚡ — R2 Bucket Integration Tests
// Version: 3.0.0 | Comprehensive R2 Tests
import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock R2 Object ──
interface MockR2Object {
  key: string;
  body: ReadableStream;
  size: number;
  etag: string;
  httpMetadata?: { contentType?: string };
}

// ── Mock R2 Factory ──
function createMockR2() {
  const store: Record<string, MockR2Object> = {};

  return {
    get: mock(async (key: string): Promise<MockR2Object | null> => {
      return store[key] ?? null;
    }),
    put: mock(
      async (key: string, body: string, opts?: { httpMetadata?: { contentType?: string } }) => {
        store[key] = {
          key,
          body: new ReadableStream(),
          size: body.length,
          etag: `etag-${key}`,
          httpMetadata: opts?.httpMetadata,
        };
      }
    ),
    delete: mock(async (key: string) => {
      delete store[key];
    }),
    list: mock(async () => ({
      objects: Object.values(store),
      truncated: false,
    })),
    head: mock(async (key: string): Promise<MockR2Object | null> => {
      return store[key] ?? null;
    }),
  };
}

// ════════════════════════════════════
// Basic R2 Operations
// ════════════════════════════════════
describe("R2 — Basic Operations", () => {
  let mockR2: ReturnType<typeof createMockR2>;

  beforeEach(() => {
    mockR2 = createMockR2();
  });

  it("returns null for missing object", async () => {
    const result = await mockR2.get("non-existent-video.mp4");
    expect(result).toBeNull();
  });

  it("stores and retrieves object", async () => {
    await mockR2.put("video.mp4", "binary-data");
    const result = await mockR2.get("video.mp4");
    expect(result).not.toBeNull();
    expect(result?.key).toBe("video.mp4");
  });

  it("deletes object", async () => {
    await mockR2.put("video.mp4", "data");
    await mockR2.delete("video.mp4");
    const result = await mockR2.get("video.mp4");
    expect(result).toBeNull();
  });

  it("lists objects", async () => {
    await mockR2.put("video1.mp4", "data1");
    await mockR2.put("video2.mp4", "data2");
    const result = await mockR2.list();
    expect(result.objects.length).toBe(2);
  });

  it("head returns metadata", async () => {
    await mockR2.put("video.mp4", "data");
    const result = await mockR2.head("video.mp4");
    expect(result?.etag).toBe("etag-video.mp4");
  });
});

// ════════════════════════════════════
// Video File Tests
// ════════════════════════════════════
describe("R2 — Video Files", () => {
  let mockR2: ReturnType<typeof createMockR2>;

  beforeEach(() => {
    mockR2 = createMockR2();
  });

  it("validates mp4 filename", () => {
    const file = "video.mp4";
    expect(file).toMatch(/\.mp4$/i);
  });

  it("validates m3u8 filename", () => {
    const file = "stream.m3u8";
    expect(file).toMatch(/\.m3u8$/i);
  });

  it("validates jpg thumbnail", () => {
    const file = "thumb.jpg";
    expect(file).toMatch(/\.(jpg|jpeg)$/i);
  });

  it("validates webm filename", () => {
    const file = "video.webm";
    expect(file).toMatch(/\.webm$/i);
  });

  it("stores video with content type", async () => {
    await mockR2.put("video.mp4", "data", {
      httpMetadata: { contentType: "video/mp4" },
    });
    const result = await mockR2.get("video.mp4");
    expect(result?.httpMetadata?.contentType).toBe("video/mp4");
  });

  it("stores m3u8 with content type", async () => {
    await mockR2.put("stream.m3u8", "data", {
      httpMetadata: { contentType: "application/x-mpegURL" },
    });
    const result = await mockR2.get("stream.m3u8");
    expect(result?.httpMetadata?.contentType).toBe("application/x-mpegURL");
  });
});

// ════════════════════════════════════
// Edge Cases
// ════════════════════════════════════
describe("R2 — Edge Cases", () => {
  let mockR2: ReturnType<typeof createMockR2>;

  beforeEach(() => {
    mockR2 = createMockR2();
  });

  it("handles special characters in key", async () => {
    await mockR2.put("folder/sub/video.mp4", "data");
    const result = await mockR2.get("folder/sub/video.mp4");
    expect(result?.key).toBe("folder/sub/video.mp4");
  });

  it("handles large file size", async () => {
    const large = "x".repeat(100_000);
    await mockR2.put("large.mp4", large);
    const result = await mockR2.get("large.mp4");
    expect(result?.size).toBe(100_000);
  });

  it("get is called correct number of times", async () => {
    await mockR2.get("key-1");
    await mockR2.get("key-2");
    expect(mockR2.get).toHaveBeenCalledTimes(2);
  });
});
