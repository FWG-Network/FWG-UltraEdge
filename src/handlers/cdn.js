function FindProxyForURL(url, host) {
    var ip = dnsResolve(host);

    // =========================
    // 🔒 BLOCK - Malware / Tracking
    // =========================
    if (
        dnsDomainIs(host, ".doubleclick.net") ||
        dnsDomainIs(host, ".googlesyndication.com") ||
        dnsDomainIs(host, ".adnxs.com") ||
        dnsDomainIs(host, ".scorecardresearch.com") ||
        dnsDomainIs(host, ".quantserve.com") ||
        dnsDomainIs(host, ".hotjar.com") ||
        dnsDomainIs(host, ".fingerprint.com")
    ) {
        return "PROXY 127.0.0.1:1"; // ← Drop connection
    }

    // =========================
    // ⚡ DIRECT - CDN / Trusted
    // =========================
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
        // === Government / Education ===
        shExpMatch(host, "*.gov.*") ||
        shExpMatch(host, "*.edu.*")
    ) {
        return "DIRECT";
    }
    
    // =========================
    // 🔐 ALL OTHER - Force thru Privacy Proxy
    // =========================
    // Option A: Tor-compatible SOCKS5
    return "SOCKS5 127.0.0.1:9050; SOCKS 127.0.0.1:9050";

    // Option B: បើប្រើ VPN local proxy
    // return "PROXY 127.0.0.1:8080";

    // Option C: Fallback chain
    // return "SOCKS5 127.0.0.1:9050; PROXY 127.0.0.1:8080; DIRECT";
}
