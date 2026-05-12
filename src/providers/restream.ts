// FWG-UltraEdge 🌍⚡ — Restream Provider
// Version: 3.0.0 | Live Stream Management + Analytics

import type { Env } from "../types/env";

const RESTREAM_API = "https://api.restream.io/v2";

interface RestreamChannel {
  id: number;
  displayName: string;
  streamKey: string;
  enabled: boolean;
  url: string;
}

interface RestreamProfile {
  id: number;
  email: string;
  displayName: string;
  plan: string;
}

// ── Base fetch with auth ──
async function restreamFetch<T>(
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${RESTREAM_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Restream API ${res.status}: ${err}`);
  }

  return res.json<T>();
}

// ── Get profile ──
export async function getRestreamProfile(env: Env): Promise<Response> {
  try {
    if (!env.RESTREAM_API_KEY) {
      return Response.json(
        { error: "Not Configured", message: "RESTREAM_API_KEY not set" },
        { status: 503 }
      );
    }

    const profile = await restreamFetch<RestreamProfile>("/user/profile", env.RESTREAM_API_KEY);

    return Response.json({
      ok: true,
      profile: {
        id: profile.id,
        displayName: profile.displayName,
        plan: profile.plan,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Restream Error",
        message: err instanceof Error ? err.message : "Profile fetch failed",
      },
      { status: 502 }
    );
  }
}

// ── Get channels ──
export async function getRestreamChannels(env: Env): Promise<Response> {
  try {
    if (!env.RESTREAM_API_KEY) {
      return Response.json(
        { error: "Not Configured", message: "RESTREAM_API_KEY not set" },
        { status: 503 }
      );
    }

    const channels = await restreamFetch<RestreamChannel[]>("/channel/all", env.RESTREAM_API_KEY);

    return Response.json({
      ok: true,
      channels: channels.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        enabled: c.enabled,
        url: c.url,
      })),
      count: channels.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Restream Error",
        message: err instanceof Error ? err.message : "Channels fetch failed",
      },
      { status: 502 }
    );
  }
}

// ── Toggle channel ──
export async function toggleRestreamChannel(
  env: Env,
  channelId: number,
  enabled: boolean
): Promise<Response> {
  try {
    if (!env.RESTREAM_API_KEY) {
      return Response.json(
        { error: "Not Configured", message: "RESTREAM_API_KEY not set" },
        { status: 503 }
      );
    }

    await restreamFetch(`/channel/${channelId}`, env.RESTREAM_API_KEY, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });

    return Response.json({
      ok: true,
      channelId,
      enabled,
      message: `Channel ${channelId} ${enabled ? "enabled" : "disabled"}`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Restream Error",
        message: err instanceof Error ? err.message : "Toggle failed",
      },
      { status: 502 }
    );
  }
}

// ── Get stream analytics ──
export async function getRestreamAnalytics(env: Env): Promise<Response> {
  try {
    if (!env.RESTREAM_API_KEY) {
      return Response.json(
        { error: "Not Configured", message: "RESTREAM_API_KEY not set" },
        { status: 503 }
      );
    }

    const data = await restreamFetch<Record<string, unknown>>(
      "/analytics/summary",
      env.RESTREAM_API_KEY
    );

    return Response.json({
      ok: true,
      analytics: data,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        error: "Restream Error",
        message: err instanceof Error ? err.message : "Analytics fetch failed",
      },
      { status: 502 }
    );
  }
}

// ── Proxy live stream ──
export async function proxyLiveStream(req: Request, env: Env, path: string): Promise<Response> {
  try {
    const origin = env.VIDEO_ORIGIN;
    if (!origin) {
      return Response.json(
        { error: "Not Configured", message: "VIDEO_ORIGIN not set" },
        { status: 503 }
      );
    }

    const upstream = `${origin.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
    const res = await fetch(upstream, {
      headers: {
        "User-Agent": "FWG-UltraEdge/3.0.0",
        Accept: req.headers.get("Accept") ?? "*/*",
        Range: req.headers.get("Range") ?? "",
      },
    });

    if (!res.ok && res.status !== 206) {
      return Response.json(
        { error: "Stream Error", message: `Upstream ${res.status}` },
        { status: res.status }
      );
    }

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "video/mp4",
        "Content-Length": res.headers.get("Content-Length") ?? "",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "X-Stream-Origin": origin,
        "X-Powered-By": "FWG-UltraEdge 🌍⚡",
      },
    });
  } catch (err) {
    return Response.json(
      {
        error: "Stream Error",
        message: err instanceof Error ? err.message : "Proxy failed",
      },
      { status: 502 }
    );
  }
}
