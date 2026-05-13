// @ts-nocheck
// src/handlers/proxy.d.ts
export function handleProxy(...args: any[]): any;    // 🟢 1. LOCAL NETWORK (រត់ត្រង់ក្នុងស្រុក គ្មាន Delay)
    if (isPlainHostName(host) ||
        isInNet(dnsResolve(host), "127.0.0.1", "255.0.0.0") ||
        isInNet(dnsResolve(host), "192.168.0.0", "255.255.0.0") ||
        isInNet(dnsResolve(host), "10.0.0.0", "255.0.0.0")) {
        return "DIRECT";
    }

    // 🎥 2. HIGH BANDWIDTH VIDEO (រុញទៅអាមេរិក ១០០% សម្រាប់បងធ្វើ Content)
    if (
        shExpMatch(host, "*.youtube.com") ||
        shExpMatch(host, "*.googlevideo.com") ||
        shExpMatch(host, "*.ytimg.com") || // ថែមរូប Thumbnail YouTube
        shExpMatch(host, "studio.youtube.com") || // ថែម YouTube Studio
        shExpMatch(host, "youtu.be") ||

        shExpMatch(host, "*.twitch.tv") ||
        shExpMatch(host, "*.twitchcdn.net") ||

        shExpMatch(host, "*.netflix.com") ||
        shExpMatch(host, "*.nflxvideo.net") ||

        shExpMatch(host, "*.facebook.com") ||
        shExpMatch(host, "*.fbcdn.net") ||

        shExpMatch(host, "*.tiktok.com") ||
        shExpMatch(host, "*.amemv.com") ||
        shExpMatch(host, "*.douyin.com") ||

        shExpMatch(host, "*.akamaihd.net") ||
        shExpMatch(host, "*.fastly.net") ||
        shExpMatch(host, "*.cloudfront.net") ||
        shExpMatch(host, "*.edgecastcdn.net")
    ) {
        return "DIRECT";
   }

  return "PROXY 104.19.237.150:443; PROXY 104.16.132.229:443; PROXY 172.64.145.121:443; PROXY 104.19.237.150:443; PROXY 172.64.36.1:443; 
      // 🌏 Multi-region proxy fallback
         "PROXY sg-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
         "PROXY jp-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
         "PROXY us-proxy.fasterwgserverkh.cloudflareaccess.com:8080; " +
         "DIRECT";
    }
    
    // 🎮 3. GAMING (LOW PING - រត់ត្រង់កុំឱ្យ Lag ពេលបងលេងហ្គេម)
    if (
        shExpMatch(host, "*.riotgames.com") ||
        shExpMatch(host, "*.pubgmobile.com") ||
        shExpMatch(host, "*wildrift*") ||
        shExpMatch(host, "*.mobilelegends.com") || // ថែម MLBB
        shExpMatch(host, "*.garena.com") // ថែម Garena
    ) {
        return "DIRECT";
    }

    // ⚡ 4. ESSENTIAL APPS (FAST ROUTE - រត់ត្រង់សម្រាប់ App សំខាន់ៗ)
    if (
        shExpMatch(host, "*.google.com") ||
        shExpMatch(host, "*.gstatic.com") ||
        shExpMatch(host, "*.cloudflare.com") ||
        shExpMatch(host, "*.apple.com") || // ថែម Apple សម្រាប់ iPhone បង
        shExpMatch(host, "*.icloud.com")
    ) {
        return "DIRECT";
    }
