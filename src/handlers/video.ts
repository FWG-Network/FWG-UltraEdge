// FWG-UltraEdge 🌍⚡ — Video Handler
import type { Env } from "../types/env";

export async function videoHandler(filename: string, env: Env): Promise<Response> {
  if (!filename) {
    return Response.json({ error: "Filename required" }, { status: 400 });
  }
  const object = await env.R2.get(filename);
  if (!object) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "video/mp4",
      "Cache-Control": "public, max-age=31536000",
    },
  });
}
