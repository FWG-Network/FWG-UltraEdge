function FindProxyForURL(url, host) {

    // 🟢 1. LOCAL NETWORK
    if (
        isPlainHostName(host) ||
        isInNet(dnsResolve(host), "127.0.0.1", "255.0.0.0") ||
        isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0") ||
        isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0")
    ) {
        return "DIRECT";
    }

    // 🎥 2. HIGH BANDWIDTH VIDEO
    if (
        shExpMatch(host, "*.youtube.com")     ||
        shExpMatch(host, "*.googlevideo.com") ||
        shExpMatch(host, "*.ytimg.com")       ||
        shExpMatch(host, "studio.youtube.com")||
        shExpMatch(host, "youtu.be")          ||
        shExpMatch(host, "*.twitch.tv")       ||
        shExpMatch(host, "*.twitchcdn.net")   ||
        shExpMatch(host, "*.netflix.com")     ||
        shExpMatch(host, "*.nflxvideo.net")   ||
        shExpMatch(host, "*.facebook.com")    ||
        shExpMatch(host, "*.fbcdn.net")       ||
        shExpMatch(host, "*.tiktok.com")      ||
        shExpMatch(host, "*.amemv.com")       ||
        shExpMatch(host, "*.douyin.com")      ||
        shExpMatch(host, "*.akamaihd.net")    ||
        shExpMatch(host, "*.fastly.net")      ||
        shExpMatch(host, "*.cloudfront.net")  ||
        shExpMatch(host, "*.edgecastcdn.net")
    ) {
        return "DIRECT";
    }

    // 🎮 3. GAMING
    if (
        shExpMatch(host, "*.riotgames.com")    ||
        shExpMatch(host, "*.pubgmobile.com")   ||
        shExpMatch(host, "*wildrift*")         ||
        shExpMatch(host, "*.mobilelegends.com")||
        shExpMatch(host, "*.garena.com")
    ) {
        return "DIRECT";
    }

    // ⚡ 4. ESSENTIAL APPS
    if (
        shExpMatch(host, "*.google.com")    ||
        shExpMatch(host, "*.gstatic.com")   ||
        shExpMatch(host, "*.cloudflare.com")||
        shExpMatch(host, "*.apple.com")     ||
        shExpMatch(host, "*.icloud.com")
    ) {
        return "DIRECT";
    }

    // 🌐 DEFAULT — Proxy Fallback
    return "PROXY 104.19.237.150:443; "  +
           "PROXY 104.16.132.229:443:443; "  +
           "PROXY 172.64.145.121:443; "  +
           "PROXY 162.159.36.1:443; "    +
           "PROXY 104.19.237.150:443; "  +
           "PROXY sg-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
           "PROXY jp-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
           "PROXY us-proxy.fasterwgserverkh.cloudflareaccess.com:8080;"
}
