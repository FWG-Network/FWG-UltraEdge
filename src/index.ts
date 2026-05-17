export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userAgent = request.headers.get("user-agent") || "";

    // 🚫 Block bad bots
    if (
      userAgent.includes("curl") ||
      userAgent.includes("wget") ||
      userAgent.includes("python")
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    // 🎯 Detect video requests
    const isVideo = /\.(mp4|webm|mkv|avi|mov|m3u8|ts)$/i.test(url.pathname);
    const isHLS = url.pathname.endsWith(".m3u8");
    const isSegment = url.pathname.endsWith(".ts");

    // ⚡ Smart cache config
    const cfConfig = {
      cf: {
        cacheEverything: true,
        cacheTtl: isHLS ? 0 : isVideo ? 86400 : 3600,
        cacheTtlByStatus: {
          "200-299": isHLS ? 0 : 86400,
          "404": 60,
          "500-599": 0
        },
        polish: "lossless" as const,
        mirage: true,
        minify: {
          javascript: !isVideo,
          css: !isVideo,
          html: !isVideo
        },
        scrapeShield: false,
      }
    };

    try {
      // 🚀 Prefetch hint — ដឹងមុនរត់ទៅមុន
      const prefetchHeaders: HeadersInit = {};
      if (isSegment) {
        const nextSegment = url.pathname.replace(
          /(\d+)\.ts$/,
          (_, n) => `${parseInt(n) + 1}.ts`
        );
        prefetchHeaders["Link"] = `<${nextSegment}>; rel=prefetch`;
      }

      const originResponse = await fetch(request, cfConfig);
      const headers = new Headers(originResponse.headers);

      // 🔒 Security headers
      headers.set("X-Frame-Options", "SAMEORIGIN");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

      // 🎬 Video streaming headers
      if (isVideo || isSegment) {
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
        headers.set("CDN-Cache-Control", "max-age=86400");
      }

      // 📺 HLS playlist — no cache
      if (isHLS) {
        headers.set("Cache-Control", "no-cache, no-store");
        headers.set("Content-Type", "application/vnd.apple.mpegurl");
      }

      // 🚀 Prefetch next segment
      if (prefetchHeaders["Link"]) {
        headers.set("Link", prefetchHeaders["Link"]);
      }

      headers.set("Access-Control-Allow-Origin", "*");

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
  }
};
