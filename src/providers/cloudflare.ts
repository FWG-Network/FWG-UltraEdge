// FWG-UltraEdge 🌍⚡ — Cloudflare Provider
import type { Env } from "../types/env";

export function getAccountInfo(env: Env) {
  return {
    app: env.APP_NAME,
    version: env.WORKER_VERSION,
    environment: env.ENVIRONMENT,
  };
}
