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
        shExpMatch(host, "*.popads.net") ||        // បិទ Network ពាណិជ្ជកម្មលោត
        shExpMatch(host, "*.popcash.net") ||       // បិទ ប្រព័ន្ធ Redirect លុយ
        shExpMatch(host, "*-spam.*") ||            // បិទ Domain ណាដែលមានពាក្យ spam
        shExpMatch(host, "*.onclick*.com") ||      // បិទ ប្រភេទចុចហើយលោត (On-click)
        shExpMatch(host, "redirect.*")
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
