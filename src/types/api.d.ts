// FWG-UltraEdge 🌍⚡ — API Type Definitions
// Version: 3.0.0 | Full Type Coverage

// ════════════════════════════════════
// BASE TYPES
// ════════════════════════════════════

export interface BaseResponse {
  ok: boolean;
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
  message: string;
  path?: string;
  retry_after?: number;
}

// ════════════════════════════════════
// HEALTH
// ════════════════════════════════════

export interface HealthResponse extends BaseResponse {
  status: "healthy" | "degraded" | "unhealthy";
  app: string;
  version: string;
  environment: string;
  runtime: string;
  region?: string;
  checks: {
    kv: "ok" | "error";
    r2: "ok" | "error";
    router: "ok" | "error";
  };
}

// ════════════════════════════════════
// VIDEO
// ════════════════════════════════════

export interface VideoMetadata {
  key: string;
  size: number;
  contentType: string;
  etag: string;
  uploaded: string;
}

export interface VideoListResponse extends BaseResponse {
  count: number;
  videos: VideoMetadata[];
}

export interface VideoStreamParams {
  filename: string;
  quality?: "auto" | "1080p" | "720p" | "480p" | "360p";
  format?: "mp4" | "hls" | "dash";
}

export interface LiveStreamParams {
  path: string;
  origin?: string;
}

// ════════════════════════════════════
// KV
// ════════════════════════════════════

export interface KVGetResponse extends BaseResponse {
  key: string;
  value: string;
  metadata: Record<string, unknown>;
}

export interface KVPutResponse extends BaseResponse {
  key: string;
  size: number;
  ttl: number;
  metadata: {
    createdAt: string;
    size: number;
    contentType: string;
  };
}

export interface KVListResponse extends BaseResponse {
  keys: Array<{
    name: string;
    expiration?: number;
    metadata?: Record<string, unknown>;
  }>;
  list_complete: boolean;
  cursor: string | null;
  count: number;
}

// ════════════════════════════════════
// SMART ROUTER (Durable Object)
// ════════════════════════════════════

export interface RouteRecord {
  path: string;
  hits: number;
  lastSeen: string;
  avgLatency: number;
  errors: number;
}

export interface RouterStatsResponse extends BaseResponse {
  total_routes: number;
  total_hits: number;
  routes: RouteRecord[];
}

// ════════════════════════════════════
// CLOUDFLARE PROVIDER
// ════════════════════════════════════

export interface AccountInfoResponse extends BaseResponse {
  app: string;
  version: string;
  environment: string;
  runtime: string;
  smart_router: RouterStatsResponse;
}

export interface R2ObjectInfo {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: Record<string, string>;
  customMetadata?: Record<string, string>;
}

export interface R2ListResponse extends BaseResponse {
  objects: R2ObjectInfo[];
  truncated: boolean;
  cursor: string | null;
  count: number;
}

export interface CachePurgeResponse extends BaseResponse {
  purged: string[];
  count: number;
}

// ════════════════════════════════════
// RESTREAM PROVIDER
// ════════════════════════════════════

export interface RestreamProfileResponse extends BaseResponse {
  profile: {
    id: number;
    displayName: string;
    plan: string;
  };
}

export interface RestreamChannelSummary {
  id: number;
  displayName: string;
  enabled: boolean;
  url: string;
}

export interface RestreamChannelsResponse extends BaseResponse {
  channels: RestreamChannelSummary[];
  count: number;
}

export interface RestreamAnalyticsResponse extends BaseResponse {
  analytics: Record<string, unknown>;
}

// ════════════════════════════════════
// RATE LIMIT
// ════════════════════════════════════

export interface RateLimitHeaders {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
}

export interface RateLimitError extends ErrorResponse {
  retry_after: number;
}

// ════════════════════════════════════
// MIDDLEWARE CONTEXT
// ════════════════════════════════════

export interface RequestContext {
  ip: string;
  country: string;
  ray: string;
  startTime: number;
  authVerified: boolean;
}
