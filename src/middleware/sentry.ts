// FWG-UltraEdge 🌍⚡ — Sentry Observability Middleware
// Version: 3.0.0 | Error Tracking + Performance Monitoring

import type { Env } from "../types/env";

interface SentryEvent {
  level: "fatal" | "error" | "warning" | "info";
  message: string;
  environment: string;
  release?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  request?: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: { frames: Array<{ filename: string; function: string }> };
    }>;
  };
}

// ── Send event to Sentry ──
async function sendToSentry(dsn: string, event: SentryEvent): Promise<void> {
  try {
    // ── Parse DSN ──
    const url = new URL(dsn);
    const key = url.username;
    const projectId = url.pathname.replace("/", "");
    const endpoint = `${url.protocol}//${url.host}/api/${projectId}/store/`;

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": [
          "Sentry sentry_version=7",
          `sentry_key=${key}`,
          "sentry_client=fwg-ultraedge/3.0.0",
        ].join(", "),
      },
      body: JSON.stringify({
        ...event,
        platform: "javascript",
        sdk: { name: "fwg-ultraedge", version: "3.0.0" },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Sentry failure must never affect main response
  }
}

// ── Capture error ──
export async function captureError(
  err: unknown,
  req: Request,
  env: Env,
  extra?: Record<string, unknown>
): Promise<void> {
  if (!env.SENTRY_DSN) return;

  const error = err instanceof Error ? err : new Error(String(err));
  const url = new URL(req.url);

  await sendToSentry(env.SENTRY_DSN, {
    level: "error",
    message: error.message,
    environment: env.ENVIRONMENT ?? "production",
    release: env.APP_VERSION ?? "3.0.0",
    tags: {
      app: env.APP_NAME ?? "FWG-UltraEdge",
      method: req.method,
      pathname: url.pathname,
      cf_ray: req.headers.get("CF-Ray") ?? "unknown",
      cf_country: req.headers.get("CF-IPCountry") ?? "unknown",
    },
    extra,
    request: {
      url: req.url,
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") ?? "",
        "user-agent": req.headers.get("user-agent") ?? "",
        "cf-ray": req.headers.get("CF-Ray") ?? "",
      },
    },
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          ...(error.stack
            ? {
                stacktrace: {
                  frames: error.stack
                    .split("\n")
                    .slice(1)
                    .map((line) => ({
                      filename: line.trim().split(" ")[1] ?? "unknown",
                      function: line.trim().split(" ")[0] ?? "unknown",
                    })),
                },
              }
            : {}),
        },
      ],
    },
  });
}

// ── Capture message ──
export async function captureMessage(
  message: string,
  level: SentryEvent["level"],
  env: Env,
  tags?: Record<string, string>
): Promise<void> {
  if (!env.SENTRY_DSN) return;
  await sendToSentry(env.SENTRY_DSN, {
    level,
    message,
    environment: env.ENVIRONMENT ?? "production",
    release: env.APP_VERSION ?? "3.0.0",
    tags: {
      app: env.APP_NAME ?? "FWG-UltraEdge",
      ...tags,
    },
  });
}

// ── Sentry wrapper middleware ──
export async function withSentry(
  req: Request,
  env: Env,
  next: (req: Request) => Promise<Response>
): Promise<Response> {
  const start = Date.now();
  try {
    const res = await next(req);

    // ── Track 5xx as warnings ──
    if (res.status >= 500 && env.SENTRY_DSN) {
      const url = new URL(req.url);
      await captureMessage(`HTTP ${res.status} on ${url.pathname}`, "warning", env, {
        status: String(res.status),
        latency: String(Date.now() - start),
      });
    }

    return res;
  } catch (err) {
    await captureError(err, req, env, {
      latency: Date.now() - start,
    });
    throw err;
  }
}
