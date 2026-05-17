export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);

      // =========================
      // FILE TYPE DETECTION
      // =========================
      const pathname = url.pathname.toLowerCase();

      const isStaticAsset =
        pathname.endsWith(".js") ||
        pathname.endsWith(".css") ||
        pathname.endsWith(".png") ||
        pathname.endsWith(".jpg") ||
        pathname.endsWith(".jpeg") ||
        pathname.endsWith(".gif") ||
        pathname.endsWith(".svg") ||
        pathname.endsWith(".webp");

      const isVideo =
        pathname.endsWith(".mp4") ||
        pathname.endsWith(".m3u8") ||
        pathname.endsWith(".ts") ||
        pathname.endsWith(".webm") ||
        pathname.endsWith(".mov");

      // =========================
      // VIDEO STREAM MODE
      // =========================
      if (isVideo) {

        // IMPORTANT:
        // DO NOT TOUCH STREAM
        // PASS DIRECTLY
        const response = await fetch(request, {
          cf: {
            cacheEverything: false,

            // Keep edge hot
            cacheTtl: 0,

            // HTTP optimizations
            polish: "off",
            mirage: false
          }
        });

        return response;
      }

      // =========================
      // STATIC ASSET MODE
      // =========================
      if (isStaticAsset) {

        const response = await fetch(request, {
          cf: {
            cacheEverything: true,
            cacheTtl: 86400,

            minify: {
              javascript: true,
              css: true,
              html: false
            },

            brotli: true,
            polish: "lossless"
          }
        });

        const headers = new Headers(response.headers);

        headers.set(
          "Cache-Control",
          "public, max-age=86400, immutable"
        );

        return new Response(response.body, {
          status: response.status,
          headers
        });
      }

      // =========================
      // HTML / NORMAL TRAFFIC
      // =========================
      const response = await fetch(request, {
        cf: {
          cacheEverything: false,

          minify: {
            html: true,
            css: true,
            javascript: true
          },

          brotli: true
        }
      });

      return response;

    } catch (err) {

      return new Response(
        "Edge Failure",
        { status: 500 }
      );
    }
  }
};
