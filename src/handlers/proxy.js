// src/handlers/proxy.d.ts
export function handleProxy(...args: any[]): any;
  // ១. ត្រូវតែប្រកាសប្រាប់វាថា proxy ជាអក្សរ (String)
  var proxy = "PROXY 1.1.1.1:443";

  // ២. លក្ខខណ្ឌសម្រាប់រត់ត្រង់
  if (
    shExpMatch(host, "*.cloudflare.com") ||
    shExpMatch(host, "*.cloudfront.net") ||
    shExpMatch(host, "*.fastly.net") ||
    shExpMatch(host, "*.jsdelivr.net") ||
    shExpMatch(host, "*.unpkg.com") ||
    shExpMatch(host, "fonts.googleapis.com") ||
    shExpMatch(host, "fonts.gstatic.com") ||
    shExpMatch(host, "*.gstatic.com") ||
    shExpMatch(host, "*.gov.*") ||
    shExpMatch(host, "*.edu.*")
  ) {
    return "DIRECT";
  }

  // ៣. ចុងក្រោយត្រូវបញ្ជូនតម្លៃ proxy ជាអក្សរដែលយើងកំណត់ខាងលើ
  return proxy;
}
