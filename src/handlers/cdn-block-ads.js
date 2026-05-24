// FWG-UltraEdge 🌍⚡ — PAC File (cdn-block-ads.js)
// 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
// Fixes:
//   [FIX-11] SOCKS5 fallback → DIRECT added
//            prevents traffic leak if SOCKS5 down

function FindProxyForURL(url, host) {
    var ip = dnsResolve(host);

    // =========================
    // 🟢 1. LOCAL / PRIVATE NETWORKS → DIRECT
    // =========================
    if (
        isPlainHostName(host)              ||
        shExpMatch(host, "localhost")      ||
        shExpMatch(host, "127.*")          ||
        shExpMatch(host, "192.168.*")      ||
        shExpMatch(host, "10.*")           ||
        shExpMatch(host, "172.16.*")       ||
        shExpMatch(host, "172.17.*")       ||
        shExpMatch(host, "172.18.*")       ||
        shExpMatch(host, "172.19.*")       ||
        shExpMatch(host, "172.2*.*")       ||
        shExpMatch(host, "172.30.*")       ||
        shExpMatch(host, "172.31.*")       ||
        isInNet(ip, "127.0.0.1",   "255.0.0.0")   ||
        isInNet(ip, "10.0.0.0",    "255.0.0.0")   ||
        isInNet(ip, "172.16.0.0",  "255.240.0.0") ||
        isInNet(ip, "192.168.0.0", "255.255.0.0")
    ) {
        return "DIRECT";
    }

    // =========================
    // 🔒 2. BLOCK - Ads / Tracking / Malware
    // =========================
    if (
        // === Ads Networks ===
        dnsDomainIs(host, ".doubleclick.net")       ||
        dnsDomainIs(host, ".googlesyndication.com") ||
        dnsDomainIs(host, ".googleadservices.com")  ||
        dnsDomainIs(host, ".googletagmanager.com")  ||
        dnsDomainIs(host, ".adnxs.com")             ||
        dnsDomainIs(host, ".moatads.com")           ||
        dnsDomainIs(host, ".pubmatic.com")          ||
        dnsDomainIs(host, ".rubiconproject.com")    ||
        dnsDomainIs(host, ".openx.net")             ||
        dnsDomainIs(host, ".criteo.com")            ||
        dnsDomainIs(host, ".outbrain.com")          ||
        dnsDomainIs(host, ".taboola.com")           ||
        dnsDomainIs(host, ".amazon-adsystem.com")   ||
        dnsDomainIs(host, ".advertising.com")       ||
        dnsDomainIs(host, ".adroll.com")            ||
        dnsDomainIs(host, ".scorecardresearch.com") ||
        dnsDomainIs(host, ".quantserve.com")        ||
        dnsDomainIs(host, ".adsafeprotected.com")   ||
        dnsDomainIs(host, ".smartadserver.com")     ||
        dnsDomainIs(host, ".lijit.com")             ||
        dnsDomainIs(host, ".sovrn.com")             ||
        dnsDomainIs(host, ".sharethrough.com")      ||
        dnsDomainIs(host, ".spotxchange.com")       ||
        dnsDomainIs(host, ".undertone.com")         ||
        dnsDomainIs(host, ".yieldmo.com")           ||
        dnsDomainIs(host, ".33across.com")          ||
        // === Popup & Redirect Spam ===
        dnsDomainIs(host, ".clickadu.com")          ||
        dnsDomainIs(host, ".propellerads.com")      ||
        dnsDomainIs(host, ".adcash.com")            ||
        dnsDomainIs(host, ".hilltopads.net")        ||
        dnsDomainIs(host, ".trafficjunky.net")      ||
        dnsDomainIs(host, ".juicyads.com")          ||
        dnsDomainIs(host, ".exoclick.com")          ||
        dnsDomainIs(host, ".trafficstars.com")      ||
        dnsDomainIs(host, ".plugrush.com")          ||
        dnsDomainIs(host, ".adsterra.com")          ||
        dnsDomainIs(host, ".pushground.com")        ||
        dnsDomainIs(host, ".richpush.co")           ||
        dnsDomainIs(host, ".evadav.com")            ||
        dnsDomainIs(host, ".bidvertiser.com")       ||
        dnsDomainIs(host, ".revcontent.com")        ||
        dnsDomainIs(host, ".mgid.com")              ||
        dnsDomainIs(host, ".zeropark.com")          ||
        dnsDomainIs(host, ".admaven.com")           ||
        dnsDomainIs(host, ".ero-advertising.com")   ||
        dnsDomainIs(host, ".traffic-media.co")      ||
        // === Tracking & Fingerprinting ===
        dnsDomainIs(host, ".hotjar.com")            ||
        dnsDomainIs(host, ".mouseflow.com")         ||
        dnsDomainIs(host, ".fullstory.com")         ||
        dnsDomainIs(host, ".logrocket.com")         ||
        dnsDomainIs(host, ".mixpanel.com")          ||
        dnsDomainIs(host, ".segment.com")           ||
        dnsDomainIs(host, ".amplitude.com")         ||
        dnsDomainIs(host, ".heap.io")               ||
        dnsDomainIs(host, ".intercom.io")           ||
        dnsDomainIs(host, ".klaviyo.com")           ||
        dnsDomainIs(host, ".pardot.com")            ||
        dnsDomainIs(host, ".marketo.com")           ||
        dnsDomainIs(host, ".hubspot.com")           ||
        dnsDomainIs(host, ".fingerprint.com")       ||
        dnsDomainIs(host, ".fingerprintjs.com")     ||
        dnsDomainIs(host, ".clarity.ms")            ||
        dnsDomainIs(host, ".crazyegg.com")          ||
        dnsDomainIs(host, ".inspectlet.com")        ||
        dnsDomainIs(host, ".luckyorange.com")       ||
        dnsDomainIs(host, ".sessioncam.com")        ||
        dnsDomainIs(host, ".smartlook.com")         ||
        // === Social Media Ads ===
        dnsDomainIs(host, ".ads.facebook.com")      ||
        dnsDomainIs(host, ".ads.twitter.com")       ||
        dnsDomainIs(host, ".ads.yahoo.com")         ||
        dnsDomainIs(host, ".tiktokv.com")           ||
        dnsDomainIs(host, ".byteoversea.com")
    ) {
        return "PROXY 127.0.0.1:1"; // Drop connection
    }

    // =========================
    // ⚡ 3. DIRECT - CDN / Trusted
    // =========================
    if (
        // === YouTube ===
        dnsDomainIs(host, ".youtube.com")       ||
        dnsDomainIs(host, ".googlevideo.com")   ||
        dnsDomainIs(host, ".ytimg.com")         ||
        host == "youtu.be"                      ||
        // === CDN Providers ===
        dnsDomainIs(host, ".cloudflare.com")    ||
        dnsDomainIs(host, ".cloudfront.net")    ||
        dnsDomainIs(host, ".fastly.net")        ||
        dnsDomainIs(host, ".akamaiedge.net")    ||
        dnsDomainIs(host, ".akamai.net")        ||
        dnsDomainIs(host, ".edgesuite.net")     ||
        dnsDomainIs(host, ".azureedge.net")     ||
        dnsDomainIs(host, ".azurefd.net")       ||
        // === JS/CSS Libraries ===
        dnsDomainIs(host, ".unpkg.com")         ||
        dnsDomainIs(host, ".cdn.jsdelivr.net")  ||
        dnsDomainIs(host, ".bootstrapcdn.com")  ||
        // === Google ===
        dnsDomainIs(host, ".googleapis.com")    ||
        dnsDomainIs(host, ".gstatic.com")       ||
        dnsDomainIs(host, ".ggpht.com")         ||
        // === AWS ===
        dnsDomainIs(host, ".amazonaws.com")     ||
        // === CacheFly ===
        dnsDomainIs(host, ".cachefly.net")      ||
        // === Government / Education ===
        shExpMatch(host, "*.gov.*")             ||
        shExpMatch(host, "*.edu.*")
    ) {
        return "DIRECT";
    }

    // =========================
    // 🔐 4. ALL OTHER → Privacy Proxy
    // [FIX-11] DIRECT fallback added — prevent traffic leak
    //          if SOCKS5 proxy is down
    // =========================
    return (
        "HTTPS ultraedge-prod.fasterwgseverkh.workers.dev:443; " +
        "HTTPS ultraedge-stg.fasterwgseverkh.workers.dev:443; " +
        "SOCKS5 127.0.0.1:9050; " +
        "DIRECT"
    );
}
