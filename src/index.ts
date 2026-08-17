// =========================================================
// FWG Live Stream Edge Worker — Zero-Lag 1080p+
// Optimized for HLS / DASH live & VOD over Cloudflare
// ===========================================================

export interface Env {
 BACKEND_URL: string;
 FWGAPISECRET: string;
}

// ─── TTL constants ──────────────────────────────────────────
const TTL_SEGMENT     = 31_536_000; // 1 year
const TTL_KEY_FRAME   = 600;        // 10 min
const TTL_MANIFEST    = 2;          // 2s for HLS/DASH
const SWR_MANIFEST    = 3;          // 3s stale-while-revalidate
const TTL_LL_MANIFEST = 1;          // 1s for LL-HLS
const SWR_LL_MANIFEST = 2;          // 2s stale-while-revalidate

// ─── Content classification ─────────────────────────────────
type ContentKind = "manifest" | "ll-manifest" | "segment" | "key" | "mp4" | "other";

function classifyPath(pathname: string): ContentKind {
 if (pathname.endsWith(".m3u8") || pathname.endsWith(".mpd")) {
   // crude classifier: LL-HLS manifests often include "_ll" or "lowlatency"
   if (pathname.includes("_ll") || pathname.includes("lowlatency")) return "ll-manifest";
   return "manifest";
 }
 if (pathname.endsWith(".ts")   || pathname.endsWith(".m4s"))  return "segment";
 if (pathname.endsWith(".key")  || pathname.endsWith(".vtt"))  return "key";
 if (pathname.endsWith(".mp4")  || pathname.endsWith(".webm")) return "mp4";
 return "other";
}

// ─── Cloudflare cache options ───────────────────────────────
function cfOptions(kind: ContentKind): RequestInitCfProperties {
 switch (kind) {
   case "manifest":
     return { cacheEverything: true, cacheTtlByStatus: { "200": TTL_MANIFEST, "500-599": 0 } };
   case "ll-manifest":
     return { cacheEverything: true, cacheTtlByStatus: { "200": TTL_LL_MANIFEST, "500-599": 0 } };
   case "segment":
     return { cacheEverything: true, cacheTtlByStatus: { "200": TTL_SEGMENT, "500-599": 0 } };
   case "mp4":
     return { cacheEverything: true, cacheTtlByStatus: { "200": 3600, "500-599": 0 } };
   case "key":
     return { cacheEverything: true, cacheTtlByStatus: { "200": TTL_KEY_FRAME, "500-599": 0 } };
   default:
     return { cacheEverything: false };
 }
}

// ─── Cache-Control per content kind ─────────────────────────
function cacheHeaders(kind: ContentKind): { browser: string; cdn: string } {
 switch (kind) {
   case "manifest":
     return { browser: "no-store", cdn: `max-age=${TTL_MANIFEST}, stale-while-revalidate=${SWR_MANIFEST}, stale-if-error=30` };
   case "ll-manifest":
     return { browser: "no-store", cdn: `max-age=${TTL_LL_MANIFEST}, stale-while-revalidate=${SWR_LL_MANIFEST}, stale-if-error=30` };
   case "segment":
     return { browser: `public, max-age=${TTL_SEGMENT}, immutable`, cdn: `max-age=${TTL_SEGMENT}, immutable` };
   case "key":
     return { browser: `public, max-age=${TTL_KEY_FRAME}`, cdn: `max-age=${TTL_KEY_FRAME}` };
   case "mp4":
     return { browser: "no-store", cdn: "max-age=3600, stale-if-error=300" };
   default:
     return { browser: "no-store", cdn: "no-store" };
 }
}

// ─── Build streaming response headers ───────────────────────
function buildResponseHeaders(origin: Headers, kind: ContentKind, rid: string): Headers {
 const h = new Headers(origin);

 h.set("Access-Control-Allow-Origin", "*");
 h.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, X-Request-ID");
 h.set("Accept-Ranges", "bytes");

 const policy = cacheHeaders(kind);
 h.set("Cache-Control", policy.browser);
 h.set("Cloudflare-CDN-Cache-Control", policy.cdn);

 h.set("X-Content-Type-Options", "nosniff");
 h.set("X-Request-ID", rid);

 // ⚠️ Do not delete Content-Encoding — preserve integrity
 h.delete("transfer-encoding");

 return h;
}

// ─── Request ID ─────────────────────────────────────────────
const rid = (): string => crypto.randomUUID().slice(0, 8);

// ─── Main handler ───────────────────────────────────────────
export default {
 async fetch(request: Request, env: Env): Promise<Response> {
   const id       = rid();
   const url      = new URL(request.url);
   const pathname = url.pathname.toLowerCase();
   const kind     = classifyPath(pathname);

   // Health check
   if (pathname === "/health" || pathname === "/_fwg/health") {
     return Response.json(
       { status: "ok", rid: id, ts: Date.now(), version: "3.4.0" },
       { headers: { "Cache-Control": "no-store", "X-Request-ID": id } }
     );
   }

   // CORS Preflight
   if (request.method === "OPTIONS") {
     return new Response(null, {
       status: 204,
       headers: {
         "Access-Control-Allow-Origin": "*",
         "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
         "Access-Control-Allow-Headers": "Content-Type, Range, Authorization",
         "Access-Control-Max-Age": "86400",
         "X-Request-ID": id,
       },
     });
   }

   // Reject non-GET/HEAD
   if (!["GET", "HEAD"].includes(request.method)) {
     return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
   }

   // Proxy request to backend — no Range/conditional headers
   const backendBase = env.BACKEND_URL || "https://fallback.fwg.internal";
   const targetUrl   = new URL(url.pathname + url.search, backendBase);

   const proxyHeaders = new Headers();
   for (const key of ["accept", "user-agent"]) {
     const val = request.headers.get(key);
     if (val) proxyHeaders.set(key, val);
   }
   proxyHeaders.set("X-Forwarded-Proto", "https");
   proxyHeaders.set("X-Request-ID", id);
   if (env.FWGAPISECRET) proxyHeaders.set("Authorization", `Bearer ${env.FWGAPISECRET}`);

   let originResponse: Response;
   try {
     originResponse = await fetch(new Request(targetUrl.toString(), {
       method: request.method,
       headers: proxyHeaders,
       redirect: "follow",
     }), { cf: cfOptions(kind) });
   } catch (err) {
     return Response.json(
       { error: "FWG Edge: Backend offline", rid: id },
       { status: 504, headers: { "Retry-After": "5", "X-Request-ID": id } }
     );
   }

   // Defensive handling for unexpected 206
   if (originResponse.status === 206) {
     console.error(`[${id}] Unexpected upstream 206`);
     return new Response("Unexpected partial response from origin", {
       status: 502,
       headers: {
         "Content-Type": "text/plain",
         "X-Request-ID": id,
         "Cache-Control": "no-store",
         "Cloudflare-CDN-Cache-Control": "no-store",
       },
     });
   }

   // Error response path — do not cache
   if (originResponse.status >= 500) {
     return new Response(originResponse.body, {
       status: originResponse.status,
       statusText: originResponse.statusText,
       headers: new Headers({
         "Content-Type": originResponse.headers.get("Content-Type") ?? "text/plain",
         "Cache-Control": "no-store",
         "Cloudflare-CDN-Cache-Control": "no-store",
         "X-Request-ID": id,
       }),
     });
   }

   // Build final response
   const responseHeaders = buildResponseHeaders(originResponse.headers, kind, id);

   return new Response(originResponse.body, {
     status: originResponse.status,
     statusText: originResponse.statusText,
     headers: responseHeaders,
   });
 },
};
export { SmartRouter } from "./durable/SmartRouter";
