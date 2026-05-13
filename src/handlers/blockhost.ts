const BLOCKED_HOSTS = [
  "doubleclick.net",
  "googlesyndication.com",
  "adservice.google.com"
];

const BLOCKED_UA = ["curl", "bot", "spider", "crawler"];

const securityHeaders = {
  "content-security-policy": "frame-ancestors *",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer-when-downgrade"
};

function applyHeaders(resp) {
  const h = new Headers(resp.headers);
  Object.entries(securityHeaders).forEach(([k, v]) => h.set(k, v));

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: h
  });
}

export default {
  async fetch(request, env, ctx) {

    const url = new URL(request.url);
    const hostname = url.hostname;

    // 🟣 PAC FILE (FIXED FORMAT)
    if (url.pathname === "/proxy.pac") {
      return new Response(`
function FindProxyForURL(url, host) {

  // Streaming domains
  if (
    shExpMatch(host, "*.youtube.com") ||
    shExpMatch(host, "*.googlevideo.com") ||
    shExpMatch(host, "*.ytimg.com")
  ) {
    return "DIRECT"; // replace with real proxy if available
  }

  return "DIRECT";
}
      `, {
        headers: {
          "content-type": "application/x-ns-proxy-autoconfig"
        }
      });
    }

    // 🚫 BLOCK ADS (only direct hits)
    if (BLOCKED_HOSTS.some(d => hostname.includes(d))) {
      return new Response("Blocked", { status: 403 });
    }

    // 🚫 BLOCK BOTS
    const ua = (request.headers.get("user-agent") || "").toLowerCase();
    if (BLOCKED_UA.some(b => ua.includes(b))) {
      return new Response("Bot blocked", { status: 403 });
    }

    // ⚡ BYPASS HEAVY DOMAINS
    if (
      hostname.includes("youtube.com") ||
      hostname.includes("googlevideo.com") ||
      hostname.includes("ytimg.com")
    ) {
      return fetch(request);
    }

    // ⚡ CACHE (SAFE)
    if (request.method === "GET") {
      const cache = caches.default;
      let response = await cache.match(request);

      if (!response) {
        response = await fetch(request, {
          cf: {
            cacheTtl: 3600,
            cacheEverything: false // safer
          }
        });

        response = applyHeaders(response);
        ctx.waitUntil(cache.put(request, response.clone()));
      } else {
        response = applyHeaders(response);
      }

      return response;
    }

    // 🔁 fallback
    const response = await fetch(request);
    return applyHeaders(response);
  }
};
