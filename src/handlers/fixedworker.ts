export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ១. សម្រាប់រាល់ Request (រួមទាំង YouTube) ឱ្យវាដំណើរការតាម Worker
    if (request.method === "GET") {
      const cache = caches.default;
      let resp = await cache.match(request);

      if (!resp) {
        resp = await fetch(request);

        //  មិន Cache លើទំព័រ HTML (ដូចជា Login/Admin) ដើម្បីសុវត្ថិភាព
        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("text/html")) {
          return resp;
        }

        // បង្ខំឱ្យ Cache (Force Cache) រយៈពេល ៣០ នាទី (១៨០០ វិនាទី)
        // ជួយឱ្យការបើក App និង វេបសាយផ្សេងៗលឿនដូចហោះ
        const headers = new Headers(resp.headers);
        headers.set("Cache-Control", "public, max-age=1800");

        resp = new Response(resp.body, {
          status: resp.status,
          statusText: resp.statusText,
          headers
        });

        // រក្សាទុកក្នុង Cache សម្រាប់ប្រើលើកក្រោយ
        ctx.waitUntil(cache.put(request, resp.clone()));
      }
      return resp;
    }

    //  បើមិនមែន GET (ដូចជាការ Post វីដេអូ) ឱ្យ fetch ធម្មតា
    return fetch(request);
  }
};
