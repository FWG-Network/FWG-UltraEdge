export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 🚫 Block bad bots / suspicious spam requests
    const userAgent = request.headers.get("user-agent") || "";

    if (
      userAgent.includes("curl") ||
      userAgent.includes("wget") ||
      userAgent.includes("python")
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    // ⚡ ULTRA EDGE CONFIG
    const cfConfig = {
      cf: {
        // 🚀 Smart caching
        cacheEverything: true,
        cacheTtl: 86400, // 24h edge cache
        cacheTtlByStatus: {
          "200-299": 86400,
          "404": 60,
          "500-599": 0
        },

        // 🚀 Compression + optimization
        polish: "lossless" as const, // image optimize
        mirage: true,       // mobile image loading
        minify: {
          javascript: true,
          css: true,
          html: true
        },

        // 🚀 Priority routing
        priority: "weight=256;exclusive=1",

        // 🚀 HTTP/3 + QUIC optimization
        scrapeShield: false,

        // 🚀 Faster TCP handling
        tcpKeepAlive: true
      }
    };

    try {
      // ⚡ Origin fetch
      const originResponse = await fetch(request, cfConfig);

      // 🔥 Clone headers safely
      const headers = new Headers(originResponse.headers);

      // 🚀 Security + performance headers
      headers.set("X-Frame-Options", "SAMEORIGIN");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

      // 🚀 Streaming optimization
      headers.set("Accept-Ranges", "bytes");

      // 🚀 Browser cache
      headers.set(
        "Cache-Control",
        "public, max-age=86400, stale-while-revalidate=3600"
      );

      // 🚀 Low latency hints
      headers.set("Connection", "keep-alive");

      // 🚀 Prevent unnecessary transforms
      headers.set("CDN-Cache-Control", "max-age=86400");

      return new Response(originResponse.body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers
      });

    } catch (err) {
      return new Response("Service Unavailable", {
        status: 503,
        headers: {
          "Content-Type": "text/plain",
          "Retry-After": "30"
        }
      });
    }
