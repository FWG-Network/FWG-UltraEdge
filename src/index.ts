export interface Env {
PRIMARY_ORIGIN: string;
SECONDARY_ORIGIN: string;
FWG_API_SECRET: string;
}

const CACHE_TTL_VIDEO = 31536000;
const CACHE_TTL_STATIC = 86400;

async function fetchFromOrigin(
request: Request,
env: Env,
origin: string
): Promise<Response> {
const incoming = new URL(request.url);
const target = new URL(
incoming.pathname + incoming.search,
origin
);

const headers = new Headers(request.headers);

headers.set("X-Forwarded-Proto", "https");

if (env.FWG_API_SECRET) {
headers.set(
"Authorization",
"Bearer ${env.FWG_API_SECRET}"
);
}

const proxyRequest = new Request(target.toString(), {
method: request.method,
headers,
redirect: "follow",
});

return fetch(proxyRequest, {
cf: {
cacheEverything: true,
cacheTtl: CACHE_TTL_STATIC,
polish: "lossy",
mirage: true,
},
});
}

function applySecurityHeaders(
response: Response
): Response {
const headers = new Headers(response.headers);

headers.set(
"Access-Control-Allow-Origin",
"*"
);

headers.set(
"Strict-Transport-Security",
"max-age=31536000; includeSubDomains; preload"
);

headers.set(
"X-Content-Type-Options",
"nosniff"
);

headers.set(
"Referrer-Policy",
"strict-origin-when-cross-origin"
);

return new Response(response.body, {
status: response.status,
statusText: response.statusText,
headers,
});
}

export default {
async fetch(
request: Request,
env: Env,
ctx: ExecutionContext
): Promise<Response> {

if (request.method === "OPTIONS") {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods":
        "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type,Range,Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

const url = new URL(request.url);

const pathname =
  url.pathname.toLowerCase();

const cache = caches.default;

const cacheKey = new Request(
  request.url,
  request
);

if (
  pathname.endsWith(".ts") ||
  pathname.endsWith(".m4s")
) {
  const cached =
    await cache.match(cacheKey);

  if (cached) {
    return cached;
  }
}

let response: Response | null = null;

try {
  response = await fetchFromOrigin(
    request,
    env,
    env.PRIMARY_ORIGIN
  );
} catch {
  try {
    response = await fetchFromOrigin(
      request,
      env,
      env.SECONDARY_ORIGIN
    );
  } catch {
    return new Response(
      "FWG Edge Error: All origins unavailable",
      { status: 503 }
    );
  }
}

const headers = new Headers(
  response.headers
);

if (
  pathname.endsWith(".m3u8") ||
  pathname.endsWith(".mpd")
) {
  headers.set(
    "Cache-Control",
    "no-cache, no-store, must-revalidate"
  );
} else if (
  pathname.endsWith(".ts") ||
  pathname.endsWith(".m4s")
) {
  headers.set(
    "Cache-Control",
    `public,max-age=${CACHE_TTL_VIDEO}`
  );
} else {
  headers.set(
    "Cache-Control",
    "public,max-age=3600"
  );
}

const finalResponse = new Response(
  response.body,
  {
    status: response.status,
    statusText: response.statusText,
    headers,
  }
);

if (
  pathname.endsWith(".ts") ||
  pathname.endsWith(".m4s")
) {
  ctx.waitUntil(
    cache.put(
      cacheKey,
      finalResponse.clone()
    )
  );
}

return applySecurityHeaders(
  finalResponse
);

},
};
