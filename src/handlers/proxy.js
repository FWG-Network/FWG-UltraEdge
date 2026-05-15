// FWG-UltraEdge 🌍⚡ — Proxy Handler
// Version: 3.0.0 | Cloudflare Workers Runtime

export function handleProxy(request, env, ctx) {

    const url  = new URL(request.url);
    const host = url.hostname;

    // ✅ 1. LOCAL NETWORK — DIRECT
    if (
        shExpMatch(host, "*.local")          ||
        shExpMatch(host, "localhost")        ||
        shExpMatch(host, "127.0.0.1")        ||
        shExpMatch(host, "192.168.*.*")      ||
        shExpMatch(host, "10.*.*.*")
    ) {
        return new Response("DIRECT", { status: 200 });
    }

    // ✅ 2. CDN & STATIC ASSETS — DIRECT
    if (
        shExpMatch(host, "*.cloudflare.com") ||
        shExpMatch(host, "*.cloudfront.net") ||
        shExpMatch(host, "*.fastly.net")     ||
        shExpMatch(host, "*.jsdelivr.net")   ||
        shExpMatch(host, "*.unpkg.com")      ||
        shExpMatch(host, "*.gstatic.com")    ||
        shExpMatch(host, "fonts.googleapis.com") ||
        shExpMatch(host, "fonts.gstatic.com")
    ) {
        return new Response("DIRECT", { status: 200 });
    }

    // ✅ 3. GOVERNMENT & EDUCATION — DIRECT
    if (
        shExpMatch(host, "*.gov.*")  ||
        shExpMatch(host, "*.gov.kh") ||
        shExpMatch(host, "*.edu.*")  ||
        shExpMatch(host, "*.edu.kh")
    ) {
        return new Response("DIRECT", { status: 200 });
    }

    // ✅ 4. PROXY FALLBACK
    return new Response(
        "PROXY 104.16.132.229:443; " +
        "PROXY 104.16.133.229:443; " +
        "PROXY 172.64.145.121:443;  " +
        "PROXY sg-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
        "PROXY jp-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
        "PROXY us-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
        "DIRECT",
        {
            status: 200,
            headers: {
                "Content-Type":                "application/x-ns-proxy-autoconfig",
                "Cache-Control":               "public, max-age=300",
                "Access-Control-Allow-Origin": "*",
            },
        }
    );
}
