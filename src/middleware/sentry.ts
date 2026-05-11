// FWG-UltraEdge 🌍⚡ — Sentry Middleware
export async function captureError(
  error: unknown,
  dsn: string,
  context: Record<string, string> = {}
): Promise<void> {
  if (!dsn) return;
  try {
    await fetch("https://sentry.io/api/store/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_key=${dsn}`,
      },
      body: JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        level: "error",
        platform: "javascript",
        extra: context,
        tags: { app: "FWG-UltraEdge", runtime: "cloudflare-workers" },
      }),
    });
  } catch {
    // silent fail — never let Sentry break the Worker
  }
}
