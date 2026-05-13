// src/handlers/proxy.ts

const PAC_SCRIPT = `function FindProxyForURL(url, host) {
  var proxy = "PROXY 1.1.1.1:443";

  if (
    // Cloudflare
    shExpMatch(host, "*.cloudflare.com") ||
    shExpMatch(host, "*.cloudflareinsights.com") ||
    shExpMatch(host, "*.workers.dev") ||

    // AWS CDN
    shExpMatch(host, "*.cloudfront.net") ||
    shExpMatch(host, "*.amazonaws.com") ||

    // Fastly
    shExpMatch(host, "*.fastly.net") ||
    shExpMatch(host, "*.fastlylabs.com") ||

    // jsDelivr / unpkg
    shExpMatch(host, "*.jsdelivr.net") ||
    shExpMatch(host, "*.unpkg.com") ||

    // Google Fonts & CDN
    shExpMatch(host, "fonts.googleapis.com") ||
    shExpMatch(host, "fonts.gstatic.com") ||
    shExpMatch(host, "*.gstatic.com") ||
    shExpMatch(host, "ajax.googleapis.com") ||

    // Government & Education
    shExpMatch(host, "*.gov.*") ||
    shExpMatch(host, "*.edu.*") ||

    // Local network
    isInNet(myIpAddress(), "10.0.0.0", "255.0.0.0") ||
    isInNet(myIpAddress(), "172.16.0.0", "255.240.0.0") ||
    isInNet(myIpAddress(), "192.168.0.0", "255.255.0.0") ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return "DIRECT";
  }

  return proxy;
}`;

export async function handleProxy(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Security: block non-GET methods
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Only serve on /proxy.pac or /wpad.dat
  if (url.pathname !== "/proxy.pac" && url.pathname !== "/wpad.dat") {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(PAC_SCRIPT, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ns-proxy-autoconfig",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
