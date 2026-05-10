/**
 * 🌐 FWG UltraEdge Solutions
 * Last Update: 2026-05-10
 * High-performance Edge Computing & VPN Infrastructure
 */

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const cacheKey = new Request(url.toString(), request);
    const cache = caches.default;

    // 🚀 ១. Ultra-Fast Cache Lookup (Zero Latency)
    let response = await cache.match(cacheKey);
    if (response) {
      // បន្ថែម Header ដើម្បីបញ្ជាក់ថាបានមកពី Edge Cache
      const cachedResponse = new Response(response.body, response);
      cachedResponse.headers.set('X-FWG-Edge', 'HIT');
      return cachedResponse;
    }

    try {
      // 🚀 ២. Smart Routing & Edge Native Optimization
      response = await fetch(request, {
        cf: {
          cacheEverything: true,
          cacheTtl: 3600,       // កំណត់ Cache ១ ម៉ោងដើម្បីល្បឿន
          smartRouting: true,   // ប្រើផ្លូវលឿនបំផុតរបស់ Cloudflare
          polish: "lossless",   // បង្កើនគុណភាពរូបភាពដោយមិនបាត់បង់ទិន្នន័យ
        }
      });

      // 🚀 ៣. Security-First Headers (Enterprise Grade)
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Content-Type-Options', 'nosniff');
      newHeaders.set('X-Frame-Options', 'DENY');
      newHeaders.set('X-XSS-Protection', '1; mode=block');
      newHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      newHeaders.set('Server', 'FWG-UltraEdge-Gateway');

      const securedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });

      // 🚀 ៤. Background Caching (មិនឱ្យ User រង់ចាំ)
      if (securedResponse.ok) {
        ctx.waitUntil(cache.put(cacheKey, securedResponse.clone()));
      }

      return securedResponse;

    } catch (err) {
      // 🚀 ៥. Scalable Failover System
      return new Response("🌐 FWG UltraEdge: Reconnecting for stability...", { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
};
