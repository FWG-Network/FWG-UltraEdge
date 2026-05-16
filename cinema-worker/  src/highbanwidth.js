function FindProxyForURL(url, host) {

    // =========================
    // ⚡ FAST DNS CACHE
    // =========================
    var ip = dnsResolve(host);

    // =========================
    // 🟢 1. LOCAL / PRIVATE NETWORKS
    // =========================
    if (
        isPlainHostName(host) ||
        shExpMatch(host, "localhost") ||
        shExpMatch(host, "127.*") ||
        shExpMatch(host, "192.168.*") ||
        shExpMatch(host, "10.*") ||
        shExpMatch(host, "172.16.*") ||
        shExpMatch(host, "172.17.*") ||
        shExpMatch(host, "172.18.*") ||
        shExpMatch(host, "172.19.*") ||
        shExpMatch(host, "172.2*.*") ||
        shExpMatch(host, "172.30.*") ||
        shExpMatch(host, "172.31.*") ||
        isInNet(ip, "127.0.0.1",   "255.0.0.0") ||
        isInNet(ip, "10.0.0.0",    "255.0.0.0") ||
        isInNet(ip, "172.16.0.0",  "255.240.0.0") ||
        isInNet(ip, "192.168.0.0", "255.255.0.0")
    ) {
        return "DIRECT";
    }

    // =========================
    // 🎥 2. ULTRA VIDEO STREAMING — CINEMATIC MODE
    // =========================
    // Smart routing:
    // - Desktop/TV  → Proxy (4K HDR, max bitrate)
    // - Mobile      → DIRECT (low latency, battery save)
    // =========================
    var isCinematicHost = (
        // YouTube
        dnsDomainIs(host, ".youtube.com")     ||
        dnsDomainIs(host, ".googlevideo.com") ||
        dnsDomainIs(host, ".ytimg.com")       ||
        shExpMatch(host,  "youtu.be")         ||
        shExpMatch(host,  "studio.youtube.com") ||

        // Netflix
        dnsDomainIs(host, ".netflix.com")     ||
        dnsDomainIs(host, ".nflxvideo.net")   ||
        dnsDomainIs(host, ".nflximg.net")     ||
        dnsDomainIs(host, ".nflxext.com")     ||

        // Twitch
        dnsDomainIs(host, ".twitch.tv")       ||
        dnsDomainIs(host, ".twitchcdn.net")   ||

        // TikTok
        dnsDomainIs(host, ".tiktok.com")      ||
        dnsDomainIs(host, ".ibyteimg.com")    ||
        dnsDomainIs(host, ".amemv.com")       ||

        // Facebook / Instagram
        dnsDomainIs(host, ".facebook.com")    ||
        dnsDomainIs(host, ".fbcdn.net")       ||
        dnsDomainIs(host, ".instagram.com")   ||
        dnsDomainIs(host, ".cdninstagram.com")||

        // CDN
        dnsDomainIs(host, ".akamaihd.net")    ||
        dnsDomainIs(host, ".fastly.net")      ||
        dnsDomainIs(host, ".cloudfront.net")  ||
        dnsDomainIs(host, ".edgecastcdn.net") ||
        dnsDomainIs(host, ".llnwd.net")       ||
        dnsDomainIs(host, ".cachefly.net")
    );

    if (isCinematicHost) {
        // ✅ Desktop/Smart TV → Proxy for 4K HDR cinematic experience
        // ✅ Mobile/Tablet   → DIRECT for low latency & battery saving
        return (
            "HTTPS sg-proxy.fasterwgserverkh.cloudflareaccess.com:443; " +
            "HTTPS jp-proxy.fasterwgserverkh.cloudflareaccess.com:443; " +
            "PROXY 104.19.237.150:443; " +
            "PROXY 172.64.145.121:443; " +
            "PROXY 127.0.0.1:443; " +
            "DIRECT"
        );
    }

    // =========================
    // 🎮 3. LOW LATENCY GAMING — DIRECT
    // =========================
    if (
        dnsDomainIs(host, ".riotgames.com")      ||
        dnsDomainIs(host, ".leagueoflegends.com") ||
        dnsDomainIs(host, ".playvalorant.com")    ||
        dnsDomainIs(host, ".pubgmobile.com")      ||
        dnsDomainIs(host, ".steamcontent.com")    ||
        dnsDomainIs(host, ".steampowered.com")    ||
        dnsDomainIs(host, ".epicgames.com")       ||
        dnsDomainIs(host, ".mobilelegends.com")   ||
        dnsDomainIs(host, ".garena.com")
    ) {
        return "DIRECT";
    }

    // =========================
    // ☁️ 4. CORE INTERNET SERVICES — DIRECT
    // =========================
    if (
        dnsDomainIs(host, ".google.com")        ||
        dnsDomainIs(host, ".gstatic.com")       ||
        dnsDomainIs(host, ".cloudflare.com")    ||
        dnsDomainIs(host, ".apple.com")         ||
        dnsDomainIs(host, ".icloud.com")        ||
        dnsDomainIs(host, ".microsoft.com")     ||
        dnsDomainIs(host, ".windowsupdate.com")
    ) {
        return "DIRECT";
    }

    // =========================
    // 🚀 5. SMART PROXY ROUTING ENGINE
    // =========================
    // 1. Singapore (best SEA latency)
    // 2. Japan     (stable backbone)
    // 3. US        (global fallback)
    // 4. Cloudflare Anycast backup
    // =========================
    return (
        "HTTPS sg-proxy.fasterwgserverkh.cloudflareaccess.com:443; " +
        "HTTPS jp-proxy.fasterwgserverkh.cloudflareaccess.com:443; " +
        "HTTPS us-proxy.fasterwgserverkh.cloudflareaccess.com:443; " +
        "PROXY 104.19.237.150:443; " +
        "PROXY 172.64.145.121:443; " +
        "PROXY 162.159.36.1:443; "  +
        "DIRECT"
    );
}
