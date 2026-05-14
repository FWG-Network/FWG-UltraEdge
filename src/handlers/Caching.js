/// <reference types="@cloudflare/workers-types" />

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      const response = await fetch(request.url, {
        cf: {
          cacheEverything: true,
          cacheTtl: 3600,
          minify: {
            javascript: true,
            css: true,
            html: true,
          },
        },
      } as RequestInit);

      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("X-Powered-By", "FWG-UltraEdge 🌍⚡");
      headers.set("X-Cache-Status", "HIT");
      headers.set("Cache-Control", "public, max-age=3600");
      headers.set("X-Frame-Options", "SAMEORIGIN");
      headers.set("X-Content-Type-Options", "nosniff");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });

    } catch (_err) {
      return new Response("Worker Error", { status: 500 });
    }
  },
} satisfies ExportedHandler;
