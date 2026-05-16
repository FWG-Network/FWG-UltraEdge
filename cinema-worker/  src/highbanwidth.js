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
    // 🌐 2. CDN — DIRECT (Fast & Low Latency)
    // =========================
    if (
        dnsDomainIs(host, ".cloudflare.com")    ||
        dnsDomainIs(host, ".cloudflareinsights.com") ||
        dnsDomainIs(host, ".jsdelivr.net")      ||
        dnsDomainIs(host, ".unpkg.com")         ||
        dnsDomainIs(host, ".bootstrapcdn.com")  ||
        dnsDomainIs(host, ".fonts.googleapis.com") ||
        dnsDomainIs(host, ".fonts.gstatic.com") ||
        dnsDomainIs(host, ".gstatic.com")       ||
        dnsDomainIs(host, ".googleusercontent.com") ||
        dnsDomainIs(host, ".amazonaws.com")     ||
        dnsDomainIs(host, ".azureedge.net")     ||
        dnsDomainIs(host, ".msecnd.net")        ||
        dnsDomainIs(host, ".vo.msecnd.net")
    ) {
        return "DIRECT";
    }

    // =========================
    // 🎥 3. ULTRA VIDEO STREAMING — CINEMATIC MODE
    // =========================
    var isCinematicHost = (
        // YouTube
        dnsDomainIs(host, ".youtube.com")      ||
        dnsDomainIs(host, ".googlevideo.com")  ||
        dnsDomainIs(host, ".ytimg.com")        ||
        shExpMatch(host,  "youtu.be")          ||
        shExpMatch(host,  "studio.youtube.com")||

        // Netflix
        dnsDomainIs(host, ".netflix.com")      ||
        dnsDomainIs(host, ".nflxvideo.net")    ||
        dnsDomainIs(host, ".nflximg.net")      ||
        dnsDomainIs(host, ".nflxext.com")      ||

        // Twitch
        dnsDomainIs(host, ".twitch.tv")        ||
        dnsDomainIs(host, ".twitchcdn.net")    ||

        // TikTok
        dnsDomainIs(host, ".tiktok.com")       ||
        dnsDomainIs(host, ".ibyteimg.com")     ||
        dnsDomainIs(host, ".amemv.com")        ||

        // Facebook / Instagram
        dnsDomainIs(host, ".facebook.com")     ||
        dnsDomainIs(host, ".fbcdn.net")        ||
        dnsDomainIs(host, ".instagram.com")    ||
        dnsDomainIs(host, ".cdninstagram.com") ||

        // Video CDN
        dnsDomainIs(host, ".akamaihd.net")     ||
        dnsDomainIs(host, ".fastly.net")       ||
        dnsDomainIs(host, ".cloudfront.net")   ||
        dnsDomainIs(host, ".edgecastcdn.net")  ||
        dnsDomainIs(host, ".llnwd.net")        ||
        dnsDomainIs(host, ".cachefly.net")
    );

    if (isCinematicHost) {
        return (
            "HTTPS sg-proxy.fasterwgserverkh.cloudflareaccess.com:443; " +
            "HTTPS jp-proxy.fasterwgserverkh.cloudflareaccess.com:443; " +
            "PROXY 104.19.237.150:443; " +
            "PROXY 172.64.145.121:443; " +
            "DIRECT"
        );
    }

    // =========================
    // 🎮 4. LOW LATENCY GAMING — DIRECT
    // =========================
    if (
        dnsDomainIs(host, ".riotgames.com")       ||
        dnsDomainIs(host, ".leagueoflegends.com")  ||
        dnsDomainIs(host, ".playvalorant.com")     ||
        dnsDomainIs(host, ".pubgmobile.com")       ||
        dnsDomainIs(host, ".steamcontent.com")     ||
        dnsDomainIs(host, ".steampowered.com")     ||
        dnsDomainIs(host, ".epicgames.com")        ||
        dnsDomainIs(host, ".mobilelegends.com")    ||
        dnsDomainIs(host, ".garena.com")
    ) {
        return "DIRECT";
    }

    // =========================
    // ☁️ 5. CORE INTERNET SERVICES — DIRECT
    // =========================
    if (
        dnsDomainIs(host, ".google.com")         ||
        dnsDomainIs(host, ".gstatic.com")        ||
        dnsDomainIs(host, ".apple.com")          ||
        dnsDomainIs(host, ".icloud.com")         ||
        dnsDomainIs(host, ".microsoft.com")      ||
        dnsDomainIs(host, ".windowsupdate.com")
    ) {
        return "DIRECT";
    }

    // =========================
    // 🚀 6. SMART PROXY ROUTING ENGINE
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
