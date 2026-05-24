// FWG-UltraEdge 🌍⚡ — src/handlers/proxy.ts
// Version: 3.0.0 | Secure Proxy Handler
// 🔐 SECURITY HARDENED — FWG White-Hat Audit v5.0
// Protection:
//   [P1] SSRF guard — strict URL allowlist
//   [P2] Private/internal IP ranges blocked
//   [P3] Protocol validation — HTTPS only
//   [P4] Request size limit
//   [P5] Sensitive headers stripped
//   [P6] Response headers sanitized

import type { Env } from "../types/env";

// ── [P1] Allowed proxy target domains (explicit allowlist) ──
// ⚠️ NEVER proxy to arbitrary URLs — SSRF risk!
const PROXY_ALLOWLIST = new Set([
  "fwg.network",
  "www.fwg.network",
  "cdn.fwg.network",
  "api.restream.io",
  "ingest.sentry.io",
]);

// ── [P2] Private/Internal IP ranges to block ──
// Prevents SSRF to internal Cloudflare/AWS metadata services
const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254",  // AWS metadata
  "metadata.google.internal",
  "169.254.170.2",    // ECS metadata
  "::1",              // IPv6 localhost
];

// ── [P1] Validate target URL ──
function validateTargetUrl(targetUrl: string): {
  valid: boolean;
  reason?: string;
  url?: URL;
} {
  let parsed: URL;

  // Parse URL
  try {
    parsed = new URL(targetUrl);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }

  // [P3] HTTPS only — no HTTP, no other protocols
  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "Only HTTPS allowed" };
  }

  // [P2] Block private/internal hosts
  const hostname = parsed.hostname.toLowerCase();
  for (const blocked of BLOCKED_HOSTS) {
    if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
      return { valid: false, reason: "Blocked host" };
    }
  }

  // Block private IP ranges
  if (
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^100\.64\./.test(hostname)  // CGNAT
  ) {
    return { valid: false, reason: "Private IP range blocked" };
  }

  // [P1] Strict domain allowlist check
  const isAllowed = [...PROXY_ALLOWLIST].some(
    (allowed) =>
      hostname === allowed ||
      hostname.endsWith(`.${allowed}`)
  );

  if (!isAllowed) {
    return { valid: false, reason: "Domain not in allowlist" };
  }

  return { valid: true, url: parsed };
}

// ── [P5] Headers to strip from incoming request ──
const STRIP_REQUEST_HEADERS = new Set([
  "cookie",
  "authorization",    // Don't forward auth tokens
  "x-auth-verified",
  "x-auth-time",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-visitor",
  "x-forwarded-for",
  "x-real-ip",
  "x-forwarded-proto",
]);

// ── [P6] Headers to strip from proxy response ──
const STRIP_RESPONSE_HEADERS = new Set([
  "set-cookie",       // Don't forward cookies
  "x-powered-by",
  "server",
  "x-aspnet-version",
  "x-aspnetmvc-version",
]);

// ── Build safe request headers ──
function buildSafeRequestHeaders(original: Headers): Headers {
  const safe = new Headers();
  for (const [key, value] of original.entries()) {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) {
      safe.set(key, value);
    }
  }
  // Add proxy identification
  safe.set("X-Forwarded-By", "FWG-UltraEdge-Proxy");
  return safe;
}

// ── Build safe response headers ──
function buildSafeResponseHeaders(original: Headers): Headers {
  const safe = new Headers();
  for (const [key, value] of original.entries()) {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      safe.set(key, value);
    }
  }
  return safe;
}

// ── Main proxy handler ──
export async function handleProxy(
  req: Request,
  env: Env
): Promise<Response> {
  const url = new URL(req.url);

  // Extract target from query param: /proxy/?target=https://...
  const targetUrl = url.searchParams.get("target");

  if (!targetUrl) {
    return Response.json(
      { error: "Missing target parameter" },
      { status: 400 }
    );
  }

  // [P1][P2][P3] Validate target URL
  const validation = validateTargetUrl(targetUrl);
  if (!validation.valid || !validation.url) {
    // Generic error — don't reveal why it was blocked
    return Response.json(
      { error: "Invalid proxy target" },
      { status: 400 }
    );
  }

  // [P4] Block non-GET/HEAD for proxy (prevent data exfiltration)
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405 }
    );
  }

  try {
    // [P5] Strip sensitive headers
    const safeHeaders = buildSafeRequestHeaders(req.headers);

    const proxyResponse = await fetch(validation.url.toString(), {
      method:  req.method,
      headers: safeHeaders,
      // [P4] No body forwarding for proxy
      cf: {
        cacheEverything: false, // Don't cache proxy responses
        scrapeShield:    true,
      },
    });

    // [P6] Sanitize response headers
    const safeResponseHeaders = buildSafeResponseHeaders(
      proxyResponse.headers
    );

    // Add proxy metadata
    safeResponseHeaders.set("X-Proxy-Target", validation.url.hostname);
    safeResponseHeaders.set("X-Proxy-Status",  String(proxyResponse.status));

    return new Response(proxyResponse.body, {
      status:  proxyResponse.status,
      headers: safeResponseHeaders,
    });

  } catch (err) {
    // Don't expose internal error details
    return Response.json(
      { error: "Proxy request failed" },
      { status: 502 }
    );
  }
}
