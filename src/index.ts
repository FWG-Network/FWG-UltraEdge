export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Cache config
    const cacheControl = 'public, max-age=31536000, immutable';
    
    // Handle video requests
    if (url.pathname.match(/\.(mp4|webm|m3u8|ts)$/)) {
      const response = await fetch(request, {
        cf: {
          cacheEverything: true,
          cacheTtl: 86400,
          polish: 'off',
        }
      });

      const headers = new Headers(response.headers);
      headers.set('Cache-Control', cacheControl);
      headers.set('Accept-Ranges', 'bytes');
      
      return new Response(response.body, {
        status: response.status,
        headers
      });
    }

    // Default
    return fetch(request, {
      cf: {
        cacheEverything: true,
        cacheTtl: 3600,
      }
    });
  }
} satisfies ExportedHandler;
