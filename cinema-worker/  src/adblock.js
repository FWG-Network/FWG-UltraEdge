function FindProxyForURL(url, host) {

    // ✅ LOCAL NETWORK — DIRECT
    if (
        isPlainHostName(host) ||
        isInNet(dnsResolve(host), "127.0.0.1", "255.0.0.0") ||
        isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0") ||
        isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0")
    ) {
        return "DIRECT";
    }

    // ✅ YOUTUBE — មិន block សោះ
    if (
        shExpMatch(host, "*.youtube.com")     ||
        shExpMatch(host, "*.googlevideo.com") ||
        shExpMatch(host, "*.ytimg.com")       ||
        shExpMatch(host, "*.ggpht.com")       ||
        shExpMatch(host, "studio.youtube.com") ||
        shExpMatch(host, "youtu.be")
    ) {
        return "DIRECT";
    }

    // 🚫 BLOCK — Popup & Redirect Spam
    if (
        shExpMatch(host, "*.pop-up.*")             ||
        shExpMatch(host, "*.popads.*")             ||
        shExpMatch(host, "*.popcash.*")            ||
        shExpMatch(host, "*.popunder.*")           ||
        shExpMatch(host, "*.clickadu.com")         ||
        shExpMatch(host, "*.propellerads.com")     ||
        shExpMatch(host, "*.adcash.com")           ||
        shExpMatch(host, "*.hilltopads.net")       ||
        shExpMatch(host, "*.trafficjunky.net")     ||
        shExpMatch(host, "*.juicyads.com")         ||
        shExpMatch(host, "*.exoclick.com")         ||
        shExpMatch(host, "*.trafficstars.com")     ||
        shExpMatch(host, "*.plugrush.com")         ||
        shExpMatch(host, "*.adsterra.com")         ||
        shExpMatch(host, "*.pushground.com")       ||
        shExpMatch(host, "*.richpush.co")          ||
        shExpMatch(host, "*.evadav.com")           ||
        shExpMatch(host, "*.bidvertiser.com")      ||
        shExpMatch(host, "*.revcontent.com")       ||
        shExpMatch(host, "*.mgid.com")             ||
        shExpMatch(host, "*.zeropark.com")         ||
        shExpMatch(host, "*.admaven.com")          ||
        shExpMatch(host, "*.ero-advertising.com")  ||
        shExpMatch(host, "*.traffic-media.co")
    ) {
        return "PROXY 0.0.0.0:0";
    }

    // 🚫 BLOCK — Ads Networks
    if (
        shExpMatch(host, "*.doubleclick.net")         ||
        shExpMatch(host, "*.googleadservices.com")    ||
        shExpMatch(host, "*.googlesyndication.com")   ||
        shExpMatch(host, "*.googletagmanager.com")    ||
        shExpMatch(host, "*.adnxs.com")               ||
        shExpMatch(host, "*.moatads.com")             ||
        shExpMatch(host, "*.pubmatic.com")            ||
        shExpMatch(host, "*.rubiconproject.com")      ||
        shExpMatch(host, "*.openx.net")               ||
        shExpMatch(host, "*.criteo.com")              ||
        shExpMatch(host, "*.outbrain.com")            ||
        shExpMatch(host, "*.taboola.com")             ||
        shExpMatch(host, "*.amazon-adsystem.com")     ||
        shExpMatch(host, "*.advertising.com")         ||
        shExpMatch(host, "*.adroll.com")              ||
        shExpMatch(host, "*.quantserve.com")          ||
        shExpMatch(host, "*.scorecardresearch.com")   ||
        shExpMatch(host, "*.adsafeprotected.com")     ||
        shExpMatch(host, "*.ads.yahoo.com")           ||
        shExpMatch(host, "*.ads.twitter.com")         ||
        shExpMatch(host, "*.ads.facebook.com")        ||
        shExpMatch(host, "*.tiktokv.com")             ||
        shExpMatch(host, "*.byteoversea.com")         ||
        shExpMatch(host, "*.smartadserver.com")       ||
        shExpMatch(host, "*.lijit.com")               ||
        shExpMatch(host, "*.sovrn.com")               ||
        shExpMatch(host, "*.sharethrough.com")        ||
        shExpMatch(host, "*.spotxchange.com")         ||
        shExpMatch(host, "*.undertone.com")           ||
        shExpMatch(host, "*.yieldmo.com")             ||
        shExpMatch(host, "*.33across.com")
    ) {
        return "PROXY 0.0.0.0:0";
    }

    // 🚫 BLOCK — Tracking & Fingerprinting
    if (
        shExpMatch(host, "*.hotjar.com")          ||
        shExpMatch(host, "*.mouseflow.com")       ||
        shExpMatch(host, "*.fullstory.com")       ||
        shExpMatch(host, "*.logrocket.com")       ||
        shExpMatch(host, "*.mixpanel.com")        ||
        shExpMatch(host, "*.segment.com")         ||
        shExpMatch(host, "*.amplitude.com")       ||
        shExpMatch(host, "*.heap.io")             ||
        shExpMatch(host, "*.intercom.io")         ||
        shExpMatch(host, "*.klaviyo.com")         ||
        shExpMatch(host, "*.pardot.com")          ||
        shExpMatch(host, "*.marketo.com")         ||
        shExpMatch(host, "*.hubspot.com")
    ) {
        return "PROXY 0.0.0.0:0";
    }

    // 🦠 BLOCK — Malware & Phishing
    if (
        shExpMatch(host, "*.exe-download.*")      ||
        shExpMatch(host, "*.free-virus-scan.*")   ||
        shExpMatch(host, "*.win-prize.*")         ||
        shExpMatch(host, "*.you-won.*")           ||
        shExpMatch(host, "*.congratulations.*")   ||
        shExpMatch(host, "*.update-flash.*")      ||
        shExpMatch(host, "*.fake-update.*")       ||
        shExpMatch(host, "*.cryptostealer.*")     ||
        shExpMatch(host, "*.fakebank.*")          ||
        shExpMatch(host, "*.phishing.*")
    ) {
        return "PROXY 0.0.0.0:0";
    }

    // 🌐 DEFAULT
    return "DIRECT";
}
