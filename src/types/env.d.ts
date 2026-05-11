// FWG-UltraEdge 🌍⚡ — Environment Types
/// <reference types="@cloudflare/workers-types" />

export interface Env {
  KV: KVNamespace;
  R2: R2Bucket;
  SMART_ROUTER: DurableObjectNamespace;
  ENVIRONMENT: string;
  APP_NAME: string;
  WORKER_VERSION: string;
  CONFIG_API_URL: string;
  VIDEO_ORIGIN: string;
  HEALTH_CHECK_TOKEN: string;
  SENTRY_DSN: string;
  SLACK_WEBHOOK_URL: string;
}
