export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);

      // =========================
      // SMART STREAM DETECTION
      // =========================
      const isVideo =
        url.pathname.match(/\.(mp4|mkv|webm|m3u8|ts|mov|avi)$/i);

      // =========================
      // ULTRA EDGE CONFIG
      // =========================
      const cfConfig = {
        cf: {
          cacheEverything: true,

          // LONGER EDGE CACHE
          cacheTtl: isVideo ? 86400 : 3600,

          // Faster stale delivery
          cacheTtlByStatus: {
            "200-299": 86400,
            "404": 60,
            "500-599": 0
          },

          // Brotli + compression
          polish: "off",

          // HTTP optimization
          httpProtocol: "http2",

          // Prioritize speed
          mirage: false,

          // Minify only web assets
          minify: isVideo
            ? undefined
            : {
                javascript: true,
                css: true,
                html: true
              }
        }
      };

      // =========================
      // STREAM OPTIMIZED HEADERS
      // =========================
      const headers = new Headers(request.headers);

      headers.set("Connection", "keep-alive");

      // Important for movie/video seek speed
      if (isVideo) {
        headers.set("Accept-Ranges", "bytes");
      }

      // =========================
      // FETCH ORIGIN
      // =========================
      const originResponse = await fetch(
        new Request(request, {
          headers
        }),
        cfConfig
      );

      // =========================
      // RESPONSE HEADERS
      // =========================
      const responseHeaders = new Headers(originResponse.headers);

      // Edge cache status
      responseHeaders.set(
        "Cache-Control",
        isVideo
          ? "public, max-age=86400, immutable"
          : "public, max-age=3600"
      );

      // Better streaming
      responseHeaders.set("Accept-Ranges", "bytes");

      // Faster browser connection reuse
      responseHeaders.set(
        "Keep-Alive",
        "timeout=20, max=1000"
      );

      // Optional debug
      responseHeaders.set("X-Ultra-Speed", "GOD-MODE");

      // =========================
      // RETURN FAST RESPONSE
      // =========================
      return new Response(originResponse.body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: responseHeaders
      });

    } catch (err) {

      return new Response(
        JSON.stringify({
          error: "Ultra Worker Failure"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
};
