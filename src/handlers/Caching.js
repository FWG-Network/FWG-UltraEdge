export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ១. កំណត់ Logic សម្រាប់ Edge Caching បែបងាយ (Smooth & Fast)
    const cf = {
      cf: {
        cacheEverything: true,      // Caching គ្រប់យ៉ាងដើម្បីឱ្យដើរ Smooth
        cacheTtl: 3600,             // រក្សាក្នុង Edge រយៈពេល ១ ម៉ោង
        minify: { javascript: true, css: true, html: true } // បង្រួមកូដឱ្យស្រាល
      }
    };

    // ២. Fetch ទៅកាន់ Origin (វេបសាយមេ) ដោយប្រើ Logic ខាងលើ
    try {
      const response = await fetch(request.url, cf);
      
      // បង្កើត Response ថ្មីដើម្បីកុំឱ្យជាប់បញ្ហា Header ពី Host ចាស់
      return new Response(response.body, response);
      
    } catch (e) {
      // បើមានបញ្ហា (ដូចជា Status 500) ឱ្យវាប្រាប់យើងខ្លីៗ
      return new Response("Worker Error", { status: 500 });
    }
  }
};
