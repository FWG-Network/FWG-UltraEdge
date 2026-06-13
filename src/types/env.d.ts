// FWG-UltraEdge 🌍⚡ — Environment Types
// Version: 3.0.0 | Cloudflare Workers Runtime
/// <reference types="@cloudflare/workers-types" />

export interface Env {
  // ── KV Namespace ──
  ULTRA_EDGE_KV: KVNamespace;
  

  // ── R2 Bucket ──
  ULTRA_EDGE_VIDEOS: R2Bucket;


  // ── Durable Objects ──
  SMART_ROUTER: DurableObjectNamespace;

  // ── Core Config ──
  ENVIRONMENT: string;
  APP_NAME: string;
  APP_VERSION: string;

  // ── Worker Identity ──
  WORKER_VERSION: string;
  CONFIG_API_URL: string;

  // ── Video / Stream ──
  VIDEO_ORIGIN: string;
  RESTREAM_API_KEY: string;

  // ── Security ──
  HEALTH_CHECK_TOKEN: string;
  AUTH_SECRET: string;
  ALLOWED_ORIGINS: string;

  // ── Observability ──
  SENTRY_DSN: string;
  SLACK_WEBHOOK_URL: string;

  // ── Rate Limit ──
  RATE_LIMIT_MAX: string;
  RATE_LIMIT_WINDOW: string;
}
