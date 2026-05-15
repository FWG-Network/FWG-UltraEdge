export function handleProxy(request, env, ctx) {
  // ១. ប្រើ CONST ជំនួស VAR ដើម្បីល្បឿន (Memory Efficiency)
  const proxy =
    "PROXY 1.1.1.1:443; " +
    "PROXY 1.0.0.1:443; " +
    "PROXY 127.0.0.1:443; " +    
    "DIRECT";

  const url = new URL(request.url);
  const host = url.hostname;

  // ២. លក្ខខណ្ឌសម្រាប់រត់ត្រង់ (DIRECT)
  // ប្រើ Array.some ដើម្បីឱ្យកូដខ្លី និងដើរលឿនជាងការប្រើ IF ច្រើនដង
  const directDomains = [
    "*.cloudflare.com",
    "*.cloudfront.net",
    "*.fastly.net",
    "*.jsdelivr.net",
    "*.unpkg.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "*.gstatic.com",
    "*.gov.*",
    "*.edu.*",
  ];

  if (directDomains.some((domain) => shExpMatch(host, domain))) {
    return "DIRECT";
  }

  // ៣. បញ្ជូន Proxy (ថែម DIRECT នៅខាងចុងដើម្បីការពារកុំឱ្យដាច់ Internet បើ Proxy មានបញ្ហា)
  return proxy;
}
