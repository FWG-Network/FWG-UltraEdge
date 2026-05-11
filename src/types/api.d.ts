// FWG-UltraEdge 🌍⚡ — API Type Definitions

export interface HealthResponse {
  status: "ok" | "error";
  app: string;
  version: string;
  environment: string;
  timestamp: string;
  runtime: string;
}

export interface ConfigResponse {
  app: string;
  version: string;
  environment: string;
  videoOrigin: string;
  configApiUrl: string;
}

export interface KVResponse {
  key: string;
  value: string;
}

export interface ErrorResponse {
  error: string;
  message?: string;
}

export interface SlackAlert {
  text?: string;
  attachments?: SlackAttachment[];
}

export interface SlackAttachment {
  color: string;
  title: string;
  text?: string;
  fields?: SlackField[];
  footer?: string;
  ts?: number;
}

export interface SlackField {
  title: string;
  value: string;
  short: boolean;
}
