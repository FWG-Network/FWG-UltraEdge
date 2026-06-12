export interface Env {
  // ទាញយក Variables ពី Cloudflare Dashboard ដែលបងបានកំណត់
  BACKEND_URL: string;
  FWG_API_SECRET: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    // ១. អនុញ្ញាតឱ្យ Player នៅលើ Website/App របស់បងអាចទាញវីដេអូបាន (CORS Preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Range, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    
    // ២. បង្កើតតំណភ្ជាប់ទៅកាន់ម៉ាស៊ីនមេ (Backend) របស់បង
    // បើគ្មាន BACKEND_URL ក្នុងប្រព័ន្ធទេ វាមានប្រព័ន្ធការពារកុំឱ្យគាំង
    const targetBaseUrl = env.BACKEND_URL || "https://fallback.fwg.internal";
    const targetUrl = new URL(url.pathname + url.search, targetBaseUrl);

    // ៣. រៀបចំសោសុវត្ថិភាព និងរក្សាទម្រង់ដើមនៃការស្នើសុំ (Range requests for video)
    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set("X-Forwarded-Proto", "https");
    // បញ្ជូនកូដសម្ងាត់ទៅ Backend ដើម្បីបញ្ជាក់ថាមកពី FWG Edge ពិតប្រាកដ
    if (env.FWG_API_SECRET) {
      proxyHeaders.set("Authorization", `Bearer ${env.FWG_API_SECRET}`);
    }

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: proxyHeaders,
      redirect: "follow",
    });

    try {
      // ៤. ទាញទិន្នន័យពី Backend
      const response = await fetch(proxyRequest);

      // ៥. កែច្នៃកញ្ចប់ទិន្នន័យដើម្បីធានាភាពរលូន (1080p+ Smooth Optimization)
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");

      // យុទ្ធសាស្ត្រ Caching សម្រាប់ Live Stream (HLS / DASH)
      const pathname = url.pathname.toLowerCase();
      
      if (pathname.endsWith('.m3u8') || pathname.endsWith('.mpd')) {
        // ហាម Cache ដាច់ខាតចំពោះឯកសារបញ្ជី Live (Playlist)
        responseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (pathname.endsWith('.ts') || pathname.endsWith('.m4s')) {
        // ចាប់ទុកកង់វីដេអូ (Video Chunks) នៅតាម Edge Server រយៈពេលយូរ
        // អ្នកមើលទី២ ទី៣ នឹងទាញចេញពី Cloudflare ផ្ទាល់ មិនរំខានម៉ាស៊ីនបងទេ (No Lag!)
        responseHeaders.set("Cache-Control", "public, max-age=31536000");
      } else {
        // សម្រាប់ Direct MP4 មិនត្រូវកែប្រែទម្រង់ទិន្នន័យទេ (Let it stream naturally)
        responseHeaders.set("Cache-Control", "no-transform");
      }

      // ៦. បោះសាច់វីដេអូត្រឡប់ទៅវិញដោយផ្ទាល់ (Streaming Body)
      // ត្រង់ `response.body` នេះគឺសំខាន់បំផុត វាហូរទិន្នន័យទៅអ្នកមើលដោយមិនចាំបាច់រង់ចាំឱ្យពេញទើបលោត
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });

    } catch (error) {
      return new Response("FWG Edge Error: Gateway Timeout (Backend offline or too slow)", { status: 504 });
    }
  },
};
