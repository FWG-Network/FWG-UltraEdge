function FindProxyForURL(url, host) {

    // =========================
    // ⚡ FAST DNS CACHE
    // =========================
    var ip = dnsResolve(host);
// CDN Optimized
    if (
    // === CDN Providers ===
    dnsDomainIs(host, ".cloudflare.com") ||
    dnsDomainIs(host, ".cloudfront.net") ||
    dnsDomainIs(host, ".fastly.net") ||
    dnsDomainIs(host, ".akamaiedge.net") ||
    dnsDomainIs(host, ".akamai.net") ||
    dnsDomainIs(host, ".edgesuite.net") ||
    dnsDomainIs(host, ".azureedge.net") ||
    dnsDomainIs(host, ".azurefd.net") ||

    // === JS/CSS Libraries ===
    dnsDomainIs(host, ".unpkg.com") ||
    dnsDomainIs(host, ".cdn.jsdelivr.net") ||
    dnsDomainIs(host, ".bootstrapcdn.com") ||

    // === Google ===
    dnsDomainIs(host, ".googleapis.com") ||
    dnsDomainIs(host, ".fonts.googleapis.com") ||
    dnsDomainIs(host, ".gstatic.com") ||
    dnsDomainIs(host, ".ggpht.com") ||

    // === AWS ===
    dnsDomainIs(host, ".amazonaws.com") ||

    // === CacheFly ===
    dnsDomainIs(host, ".cachefly.net") ||

    // === Government / Education (Global) ===
    shExpMatch(host, "*.gov.*") ||
    shExpMatch(host, "*.edu.*")
) {
    return "DIRECT";
}
