const PAC_SCRIPT = `function FindProxyForURL(url, host) {
  var proxy = "PROXY 1.1.1.1:443";

  if (
  // --- បន្ថែម
    
    // Cloudflare
    shExpMatch(host, "*.cloudflare.com") ||
    shExpMatch(host, "*.cloudflareinsights.com") ||
    
    // AWS CDN
    shExpMatch(host, "*.cloudfront.net") ||
    shExpMatch(host, "*.amazonaws.com") ||

    // Fastly
    shExpMatch(host, "*.fastly.net") ||
    shExpMatch(host, "*.fastlylabs.com") ||

    // jsDelivr / unpkg
    shExpMatch(host, "*.jsdelivr.net") ||
    shExpMatch(host, "*.unpkg.com") ||

    // Google Fonts & CDN
    shExpMatch(host, "fonts.googleapis.com") ||
    shExpMatch(host, "fonts.gstatic.com") ||
    shExpMatch(host, "*.gstatic.com") ||
    shExpMatch(host, "ajax.googleapis.com") ||

    // Government & Education
    shExpMatch(host, "*.gov.*") ||
    shExpMatch(host, "*.edu.*") ||

    // Local network (Bypass Proxy សម្រាប់បណ្តាញក្នុងស្រុក)
    isInNet(myIpAddress(), "10.0.0.0", "255.0.0.0") ||
    isInNet(myIpAddress(), "172.16.0.0", "255.240.0.0") ||
    isInNet(myIpAddress(), "192.168.0.0", "255.255.0.0") ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return "DIRECT";
  }

  return proxy;
}`;
