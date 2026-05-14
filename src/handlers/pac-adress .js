// index.ts (ជំនាន់ Edge Caching ជាមួយ Logic បញ្ហា 500)
export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const cache = caches.default;
    
    // ១. កំណត់ Cache Key
    const cacheKey = new Request(url.toString(), request);

    // ២. ព្យាយាមស្វែងរកក្នុង Cache (Edge Caching Logic)
    let response = await cache.match(cacheKey);

    if (!response) {
      console.log(`Cache miss for: ${url.pathname}`);
      
      try {
        // ទីនេះជាកន្លែងដែលបងធ្លាប់ជួប Status 500 បើ Fetch ទៅ Origin មានបញ្ហា
        response = await fetch(request);

        // ៣. បង្កើត Response ថ្មីដើម្បីដាក់ Cache Headers
        response = new Response(response.body, response);
        
        // កំណត់ឱ្យ Caching រយៈពេល ១ ម៉ោង (នេះជាកន្លែងដែលបងធ្លាប់ចង់បាន)
        response.headers.append("Cache-Control", "s-maxage=3600");

        // រក្សាទុកក្នុង Edge Cache
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      } catch (err) {
        // នេះជាកន្លែងដែលវាលោត Status 500 ពេលមាន Error
        return new Response("Edge Worker Internal Error", { status: 500 });
      }
    } else {
      console.log(`Cache hit for: ${url.pathname}`);
    }

    return response;
  },
};
