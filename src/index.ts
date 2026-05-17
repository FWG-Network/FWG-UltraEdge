/**
 * ULTRA ENTERPRISE STREAMING WORKER
 * Production-Grade Edge Streaming Architecture
 * Optimized For:
 * - Video Streaming
 * - Ultra Low Latency
 * - Smooth Seeking
 * - Enterprise CDN Behavior
 * - Business Production Usage
 */

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {

    try {

      const url = new URL(request.url);
      const pathname = url.pathname.toLowerCase();

      // =========================================
      // FILE DETECTION
      // =========================================

      const isVideo =
        pathname.endsWith(".mp4") ||
        pathname.endsWith(".m3u8") ||
        pathname.endsWith(".ts") ||
        pathname.endsWith(".m4s") ||
        pathname.endsWith(".mov") ||
        pathname.endsWith(".webm") ||
        pathname.endsWith(".mkv");

      const isStatic =
        pathname.endsWith(".js") ||
        pathname.endsWith(".css") ||
        pathname.endsWith(".png") ||
        pathname.endsWith(".jpg") ||
        pathname.endsWith(".jpeg") ||
        pathname.endsWith(".gif") ||
        pathname.endsWith(".svg") ||
        pathname.endsWith(".webp") ||
        pathname.endsWith(".woff2");

      // =========================================
      // SHARED HEADERS
      // =========================================

      const reqHeaders = new Headers(request.headers);

      // Connection optimization
      reqHeaders.set("Connection", "keep-alive");

      // Better compression negotiation
      reqHeaders.set(
        "Accept-Encoding",
        "br, gzip"
      );

      // Faster browser prioritization
      reqHeaders.set(
        "Priority",
        "u=1, i"
      );

      // =========================================
      // VIDEO STREAMING ENGINE
      // =========================================

      if (isVideo) {

        // NEVER buffer stream in worker
        // NEVER clone full body
        // NEVER minify video traffic

        const response = await fetch(
          new Request(request, {
            headers: reqHeaders
          }),
          {
            cf: {

              // Ultra streaming optimization
              cacheEverything: false,

              // Reduce edge processing
              apps: false,

              // Disable unnecessary image/video transforms
              polish: "off",
              mirage: false,

              // Smart protocol selection
              httpProtocol: "http3",

              // Origin shield behavior
              cacheTtl: 0
            }
          }
        );

        // Preserve native streaming behavior
        const headers = new Headers(response.headers);

        // Critical for smooth seeking
        headers.set(
          "Accept-Ranges",
          "bytes"
        );

        // Connection reuse
        headers.set(
          "Keep-Alive",
          "timeout=30, max=1000"
        );

        // Streaming hint
        headers.set(
          "X-Streaming-Mode",
          "enterprise-ultra"
        );

        // Better browser buffering logic
        headers.set(
          "Cache-Control",
          "public, no-transform"
        );

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      }

      // =========================================
      // STATIC ASSET ENGINE
      // =========================================

      if (isStatic) {

        const response = await fetch(
          new Request(request, {
            headers: reqHeaders
          }),
          {
            cf: {

              // Aggressive enterprise cache
              cacheEverything: true,

              // 7 days edge cache
              cacheTtl: 604800,

              // Smart compression
              brotli: true,

              // Asset optimization
              minify: {
                javascript: true,
                css: true,
                html: false
              },

              // Image optimization
              polish: "lossless",

              // Faster transport
              httpProtocol: "http3"
            }
          }
        );

        const headers = new Headers(response.headers);

        headers.set(
          "Cache-Control",
          "public, max-age=604800, immutable"
        );

        headers.set(
          "X-Asset-Engine",
          "enterprise-cache"
        );

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      }

      // =========================================
      // HTML / API / NORMAL TRAFFIC
      // =========================================

      const response = await fetch(
        new Request(request, {
          headers: reqHeaders
        }),
        {
          cf: {

            // Dynamic optimization
            cacheEverything: false,

            // Smart compression
            brotli: true,

            // HTML optimization
            minify: {
              html: true,
              css: true,
              javascript: true
            },

            // Faster protocol
            httpProtocol: "http3"
          }
        }
      );

      const headers = new Headers(response.headers);

      headers.set(
        "X-Edge-System",
        "ultra-enterprise"
      );

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });

    } catch (error) {

      return new Response(
        JSON.stringify({
          success: false,
          message: "Ultra Enterprise Edge Failure"
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
