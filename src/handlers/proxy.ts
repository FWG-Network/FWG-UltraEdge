// ប្រកាសឱ្យ TypeScript ស្គាល់ Function របស់ PAC Script ដើម្បីកុំឱ្យមាន Error ពេល Compile
declare function shExpMatch(str: string, shexp: string): boolean;
declare function isInNet(ip: string, net: string, mask: string): boolean;
declare function myIpAddress(): string;

const PAC_SCRIPT = `function FindProxyForURL(url, host) {
  var proxy = "PROXY proxy.fasterwgserverkh.cloudflareaccess.com/:443";

  if (
    // --- បន្ថែមសម្រាប់ល្បឿនវីដេអូ (YouTube & Google Video) ---
    shExpMatch(host, "*.googlevideo.com") ||
    shExpMatch(host, "*.youtube.com") ||
    shExpMatch(host, "*.ytimg.com") ||
    shExpMatch(host, "youtube.com") ||

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

    // Local network (Bypass Proxy សម្រាប់បណ្តាញក្នុងស្រុក)
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

/**
 * សំយោគការប្រើប្រាស់ Response និង Security Check
 */
export async function handleProxy(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // ១. ពិនិត្យ Security: អនុញ្ញាតតែ GET Method
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ២. ពិនិត្យ Path: បម្រើតែលើ /proxy.pac ឬ /wpad.dat (ដូចក្នុង Screenshot_2026-05-13-23-08-50-99.jpg)
  if (url.pathname !== "/proxy.pac" && url.pathname !== "/wpad.dat") {
    return new Response("Not Found", { status: 404 });
  }

  // ៣. បញ្ចេញ PAC Script ជាមួយ Headers ត្រឹមត្រូវ
  return new Response(PAC_SCRIPT, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ns-proxy-autoconfig",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
