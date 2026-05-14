function FindProxyForURL(url, host) {

    // 🚫 BLOCK ADS & TRACKING
    if (
        shExpMatch(host, "*.doubleclick.net") ||
        shExpMatch(host, "*.googleadservices.com") ||
        shExpMatch(host, "*.googlesyndication.com") ||
        shExpMatch(host, "*.adnxs.com") ||
        shExpMatch(host, "*.advertising.com") ||
        shExpMatch(host, "*.adroll.com") ||
        shExpMatch(host, "*.outbrain.com") ||
        shExpMatch(host, "*.taboola.com") ||
        shExpMatch(host, "*.criteo.com") ||
        shExpMatch(host, "*.moatads.com") ||
        shExpMatch(host, "*.pubmatic.com") ||
        shExpMatch(host, "*.rubiconproject.com") ||
        shExpMatch(host, "*.scorecardresearch.com") ||
        shExpMatch(host, "*.quantserve.com") ||
        shExpMatch(host, "*.adsafeprotected.com") ||
        shExpMatch(host, "*.amazon-adsystem.com") ||
        shExpMatch(host, "*.ads.yahoo.com") ||
        shExpMatch(host, "*.ads.twitter.com") ||
        shExpMatch(host, "*.ads.facebook.com") ||
        shExpMatch(host, "*.tiktokv.com") ||
        shExpMatch(host, "*.byteoversea.com")
    ) {
        return "PROXY 0.0.0.0:0";
    }

    // 🦠 BLOCK MALWARE & PHISHING
    if (
        shExpMatch(host, "*.malware.com") ||
        shExpMatch(host, "*.phishing.com") ||
        shExpMatch(host, "*.virus.com") ||
        shExpMatch(host, "*.trojan.com") ||
        shExpMatch(host, "*.spyware.com") ||
        shExpMatch(host, "*.ransomware.com") ||
        shExpMatch(host, "*.exploit.in") ||
        shExpMatch(host, "*.fakebank*") ||
        shExpMatch(host, "*.cryptostealer*")
    ) {
        return "PROXY 0.0.0.0:0";
    }

    // ✅ YOUTUBE — DIRECT (អត់ Block)
    if (
        shExpMatch(host, "*.youtube.com") ||
        shExpMatch(host, "*.googlevideo.com") ||
        shExpMatch(host, "*.ytimg.com") ||
        shExpMatch(host, "studio.youtube.com") ||
        shExpMatch(host, "youtu.be")
    ) {
        return "DIRECT";
    }

    // 🎯 DEFAULT
    return "PROXY 104.16.132.229:443; " +
           "PROXY 104.16.133.229:443; " +
           "PROXY 172.64.145.121:443; " +
           "PROXY 104.19.237.150:443; " +
           "PROXY sg-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
           "PROXY jp-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
           "PROXY us-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
           "DIRECT";
}
