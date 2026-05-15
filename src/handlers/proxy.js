export function handleProxy(request, env, ctx) {
  // ១. ប្រកាស proxy string
  var proxy = "PROXY 1.1.1.1:443, PROXY 1.0.0.1:443";

  var url = new URL(request.url);
  var host = url.hostname;

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

  // ៣. បញ្ជូន proxy
  return proxy;
}
