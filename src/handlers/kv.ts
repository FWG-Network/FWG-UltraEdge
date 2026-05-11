// FWG-UltraEdge 🌍⚡ — KV Handler
import type { Env } from "../types/env";

export async function kvHandler(key: string, env: Env): Promise<Response> {
  if (!key) {
    return Response.json({ error: "Key required" }, { status: 400 });
  }
  const value = await env.KV.get(key);
  if (!value) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ key, value }, { status: 200 });
}
