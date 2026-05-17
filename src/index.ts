export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const userAgent = request.headers.get("user-agent") || "";
    if (
      userAgent.includes("curl") ||
      userAgent.includes("wget") ||
      userAgent.includes("python")
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    const cfConfig = {
      cf: {
        cacheEverything: true,
        cacheTtl: 86400,
        cacheTtlByStatus: {
          "200-299": 86400,
          "404": 60,
          "500-599": 0
        },
        polish: "lossless" as const,
        mirage: true,
        minify: {
          javascript: true,
          css: true,
          html: true
        },
        scrapeShield: false,
      }
    };

    try {
      const originResponse = await fetch(request, cfConfig);
      const headers = new Headers(originResponse.headers);

      headers.set("X-Frame-Options", "SAMEORIGIN");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
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
  }  // ← បន្ថែម
};   // ← បន្ថែម
