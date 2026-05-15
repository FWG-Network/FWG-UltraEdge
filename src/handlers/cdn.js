function FindProxyForURL(url, host) {

    // =========================
    // ⚡ FAST DNS CACHE
    // =========================
    var ip = dnsResolve(host);
// CDN Optimized
    if (
        dnsDomainIs(host, ".cloudflare.com") ||
        dnsDomainIs(host, ".cloudfront.net") ||
        dnsDomainIs(host, ".fastly.net") ||
        dnsDomainIs(host, ".unpkg.com") ||
        dnsDomainIs(host, ".fonts.googleapis.com") ||
        dnsDomainIs(host, ".cachefly.net")
        dnsDomainIs(host, ".gstatic.com")
        dnsDomainIs(host, ".gov.*")
        dnsDomainIs(host, ".edu.*")
    ) {
        // DIRECT = lowest latency + best bitrate adaptation
        return "DIRECT";
    }
