import { useState } from "react";

const tree = [
  {
    name: ".github/",
    icon: "⚙️",
    color: "#f59e0b",
    children: [
      {
        name: "workflows/",
        icon: "🔄",
        color: "#f59e0b",
        children: [
          { name: "deploy.yml", icon: "🚀", color: "#10b981", desc: "11-Job SLSA Pipeline — Secret Scan → OBS Live" },
          { name: "pr-check.yml", icon: "🔍", color: "#6366f1", desc: "Pull Request quick validation (lint + typecheck)" },
          { name: "audit-schedule.yml", icon: "🛡️", color: "#ef4444", desc: "Nightly scheduled security audit" },
        ],
      },
    ],
  },
  {
    name: "src/",
    icon: "🧠",
    color: "#6366f1",
    children: [
      { name: "index.ts", icon: "⚡", color: "#10b981", desc: "Worker entry point — request handler + env bindings" },
      {
        name: "middleware/",
        icon: "🔗",
        color: "#8b5cf6",
        children: [
          { name: "auth.ts", icon: "🔐", color: "#8b5cf6", desc: "JWT / Bearer token authentication middleware" },
          { name: "cors.ts", icon: "🌐", color: "#8b5cf6", desc: "CORS headers with allowlist enforcement" },
          { name: "sentry.ts", icon: "📡", color: "#8b5cf6", desc: "Sentry error tracking + performance monitoring" },
          { name: "rateLimit.ts", icon: "⏱️", color: "#8b5cf6", desc: "KV-backed rate limiting per IP" },
        ],
      },
      {
        name: "router/",
        icon: "🗺️",
        color: "#06b6d4",
        children: [
          { name: "index.ts", icon: "🗺️", color: "#06b6d4", desc: "itty-router instance + route registration" },
          { name: "smartRouter.ts", icon: "🤖", color: "#06b6d4", desc: "Durable Object: SMART_ROUTER class" },
        ],
      },
      {
        name: "handlers/",
        icon: "🎯",
        color: "#f59e0b",
        children: [
          { name: "video.ts", icon: "🎬", color: "#f59e0b", desc: "R2 video upload / stream / delete handlers" },
          { name: "health.ts", icon: "🏥", color: "#10b981", desc: "GET /health — returns 200 + build metadata" },
          { name: "kv.ts", icon: "🗄️", color: "#f59e0b", desc: "KV namespace CRUD operations" },
        ],
      },
      {
        name: "providers/",
        icon: "🔌",
        color: "#ec4899",
        children: [
          { name: "cloudflare.ts", icon: "☁️", color: "#ec4899", desc: "Cloudflare-specific bindings wrapper" },
          { name: "restream.ts", icon: "📺", color: "#ec4899", desc: "Restream API client for live broadcasting" },
        ],
      },
      {
        name: "types/",
        icon: "📐",
        color: "#64748b",
        children: [
          { name: "env.d.ts", icon: "📐", color: "#64748b", desc: "Cloudflare Worker Env interface (KV, R2, DO)" },
          { name: "api.d.ts", icon: "📐", color: "#64748b", desc: "API request/response type definitions" },
        ],
      },
    ],
  },
  {
    name: "test/",
    icon: "🧪",
    color: "#10b981",
    children: [
      {
        name: "unit/",
        icon: "⚡",
        color: "#10b981",
        children: [
          { name: "router.test.ts", icon: "🧪", color: "#10b981", desc: "Route matching and middleware chain tests" },
          { name: "handlers.test.ts", icon: "🧪", color: "#10b981", desc: "Handler logic unit tests (Bun test)" },
          { name: "kv.test.ts", icon: "🧪", color: "#10b981", desc: "KV namespace mock tests" },
        ],
      },
      {
        name: "integration/",
        icon: "🔗",
        color: "#06b6d4",
        children: [
          { name: "api.test.ts", icon: "🔗", color: "#06b6d4", desc: "End-to-end API integration tests" },
          { name: "r2.test.ts", icon: "🔗", color: "#06b6d4", desc: "R2 bucket integration tests" },
        ],
      },
      {
        name: "health/",
        icon: "🏥",
        color: "#f59e0b",
        children: [
          { name: "endpoint.test.ts", icon: "🏥", color: "#f59e0b", desc: "Health endpoint response validation" },
          { name: "bundle.test.ts", icon: "📦", color: "#f59e0b", desc: "Bundle size assertion (< 1MB)" },
        ],
      },
    ],
  },
  {
    name: "scripts/",
    icon: "⚙️",
    color: "#8b5cf6",
    children: [
      { name: "obs-trigger.ts", icon: "🎬", color: "#ef4444", desc: "OBS CLI / Restream API broadcast trigger" },
      { name: "health-check.ts", icon: "🏥", color: "#10b981", desc: "Retry-logic health checker for CI/CD" },
      { name: "rollback.ts", icon: "↩️", color: "#f59e0b", desc: "Self-healing rollback via Wrangler Deployments API" },
      { name: "edge-latency-sim.ts", icon: "⚡", color: "#6366f1", desc: "Simulate edge cold-start latency profile" },
      { name: "hash-verify.ts", icon: "🔏", color: "#8b5cf6", desc: "Verify SHA-256 against SLSA provenance" },
    ],
  },
  {
    name: "config/",
    icon: "🔧",
    color: "#64748b",
    children: [
      { name: "staging.json", icon: "🟡", color: "#f59e0b", desc: "Staging-specific configuration overrides" },
      { name: "production.json", icon: "🟢", color: "#10b981", desc: "Production configuration (no secrets)" },
      { name: "eslint.config.ts", icon: "🎨", color: "#6366f1", desc: "ESLint flat config with TS rules" },
      { name: ".prettierrc", icon: "✨", color: "#ec4899", desc: "Prettier formatting rules" },
    ],
  },
  {
    name: "docs/",
    icon: "📚",
    color: "#06b6d4",
    children: [
      { name: "ARCHITECTURE.md", icon: "🏛️", color: "#06b6d4", desc: "System architecture overview + diagrams" },
      { name: "SLSA.md", icon: "🔏", color: "#8b5cf6", desc: "SLSA provenance verification guide" },
      { name: "DEPLOYMENT.md", icon: "🚀", color: "#10b981", desc: "Deployment runbook (staging + production)" },
      { name: "ROLLBACK.md", icon: "↩️", color: "#f59e0b", desc: "Self-healing rollback procedures" },
      { name: "OBSERVABILITY.md", icon: "📡", color: "#ef4444", desc: "Sentry + Logpush configuration guide" },
    ],
  },
];

const jobs = [
  { id: 1, icon: "🔐", name: "Secret Scanning", tool: "Gitleaks", layer: "Security", color: "#ef4444", needs: [] },
  { id: 2, icon: "🎨", name: "Code Quality", tool: "ESLint + Prettier", layer: "Quality", color: "#6366f1", needs: [1] },
  { id: 3, icon: "🔬", name: "Static Analysis", tool: "tsc --strict", layer: "Quality", color: "#8b5cf6", needs: [1] },
  { id: 4, icon: "⚡", name: "Ultra-Fast Tests", tool: "bun test", layer: "Quality", color: "#10b981", needs: [2, 3] },
  { id: 5, icon: "🛡️", name: "Security Audit", tool: "bun audit + OSV", layer: "Security", color: "#ef4444", needs: [1] },
  { id: 6, icon: "📦", name: "Build + SHA-256", tool: "Wrangler + sha256sum", layer: "Integrity", color: "#f59e0b", needs: [4, 5] },
  { id: 7, icon: "🏛️", name: "SLSA Provenance", tool: "slsa-github-generator", layer: "Integrity", color: "#f59e0b", needs: [6] },
  { id: 8, icon: "🚀", name: "Edge Performance", tool: "Dry Run + Bun Test", layer: "Performance", color: "#06b6d4", needs: [6] },
  { id: 9, icon: "🟡", name: "Staging Deploy", tool: "Wrangler + Health Check", layer: "Deployment", color: "#eab308", needs: [7, 8], env: "develop" },
  { id: 10, icon: "🟢", name: "Production Deploy", tool: "Wrangler + Auto-Rollback", layer: "Deployment", color: "#10b981", needs: [7, 8], env: "main/tags" },
  { id: 11, icon: "🎬", name: "OBS Live Trigger", tool: "obs-cli / Restream API", layer: "Broadcast", color: "#ec4899", needs: [10], env: "production only", optional: true },
];

const layers = ["Security", "Quality", "Integrity", "Performance", "Deployment", "Broadcast"];
const layerColors = {
  Security: "#ef4444",
  Quality: "#6366f1",
  Integrity: "#f59e0b",
  Performance: "#06b6d4",
  Deployment: "#10b981",
  Broadcast: "#ec4899",
};

function TreeNode({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        onClick={() => hasChildren && setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "4px 8px",
          borderRadius: 6,
          cursor: hasChildren ? "pointer" : "default",
          transition: "background 0.15s",
          userSelect: "none",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <span style={{ fontSize: 14, minWidth: 20 }}>
          {hasChildren ? (open ? "▾" : "▸") : "·"}
        </span>
        <span style={{ fontSize: 15 }}>{node.icon}</span>
        <span style={{ color: node.color, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
          {node.name}
        </span>
        {node.desc && (
          <span style={{ color: "#64748b", fontSize: 11, fontStyle: "italic", marginLeft: 4, lineHeight: 1.4 }}>
            — {node.desc}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <div style={{ borderLeft: `1px dashed ${node.color}30`, marginLeft: 20 }}>
          {node.children.map((child, i) => (
            <TreeNode key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ job, active, onClick }) {
  return (
    <div
      onClick={() => onClick(job)}
      style={{
        background: active ? `${job.color}18` : "rgba(255,255,255,0.03)",
        border: `1px solid ${active ? job.color : "rgba(255,255,255,0.08)"}`,
        borderRadius: 10,
        padding: "12px 14px",
        cursor: "pointer",
        transition: "all 0.2s",
        position: "relative",
      }}
    >
      {job.optional && (
        <span style={{
          position: "absolute", top: 6, right: 8,
          fontSize: 9, color: "#64748b",
          background: "rgba(255,255,255,0.06)",
          padding: "2px 5px", borderRadius: 4,
          fontFamily: "monospace",
        }}>OPTIONAL</span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{
          background: job.color + "22",
          color: job.color,
          borderRadius: 6,
          width: 26, height: 26,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700,
          border: `1px solid ${job.color}44`,
        }}>{job.id}</span>
        <span style={{ fontSize: 16 }}>{job.icon}</span>
        <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 13 }}>{job.name}</span>
      </div>
      <div style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace", marginLeft: 34 }}>
        {job.tool}
      </div>
      {job.env && (
        <div style={{ color: job.color, fontSize: 10, marginLeft: 34, marginTop: 3, fontFamily: "monospace" }}>
          ⎇ {job.env}
        </div>
      )}
      {job.needs.length > 0 && (
        <div style={{ color: "#475569", fontSize: 10, marginLeft: 34, marginTop: 2 }}>
          needs: [{job.needs.map(n => `#${n}`).join(", ")}]
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("tree");
  const [activeJob, setActiveJob] = useState(null);
  const [expandAll, setExpandAll] = useState(false);

  const tabs = [
    { id: "tree", label: "📁 Directory Tree" },
    { id: "pipeline", label: "🔄 Pipeline Jobs" },
    { id: "secrets", label: "🔑 Secrets Registry" },
    { id: "bindings", label: "🔗 CF Bindings" },
  ];

  const secrets = [
    { name: "CLOUDFLARE_API_TOKEN", status: "✅", since: "2h ago", usage: "Wrangler deploy auth" },
    { name: "CLOUDFLARE_ACCOUNT_ID", status: "✅", since: "2h ago", usage: "Worker account scope" },
    { name: "CLOUDFLARE_EMAIL", status: "✅", since: "1h ago", usage: "Cloudflare account email" },
    { name: "HEALTH_CHECK_TOKEN", status: "✅", since: "1h ago", usage: "Bearer auth for /health endpoint" },
    { name: "SLACK_WEBHOOK_URL", status: "✅", since: "configured", usage: "Alerts: deploy, failure, rollback" },
    { name: "WORKER_URL_STG", status: "⚙️", since: "optional", usage: "Override staging health check URL" },
    { name: "WORKER_URL_PROD", status: "⚙️", since: "optional", usage: "Override production health check URL" },
    { name: "STREAM_KEY", status: "⚙️", since: "optional", usage: "OBS/Restream live trigger (Job 11)" },
    { name: "RESTREAM_API_KEY", status: "⚙️", since: "optional", usage: "Restream API fallback broadcast" },
    { name: "GITLEAKS_LICENSE", status: "⚙️", since: "optional", usage: "Gitleaks org-level scanning" },
  ];

  const bindings = [
    { type: "KV", binding: "ULTRA_EDGE_KV", id: "d23dc04c127a4918a02b3c72bade6d9d", icon: "🗄️", color: "#f59e0b" },
    { type: "R2", binding: "ULTRA_EDGE_VIDEOS", id: "ultra-edge-videos", icon: "🪣", color: "#06b6d4" },
    { type: "DO", binding: "SMART_ROUTER", id: "SmartRouter (class)", icon: "🤖", color: "#8b5cf6" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070b14",
      color: "#e2e8f0",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1a0533 50%, #001a33 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "20px 28px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 24 }}>🌍⚡</span>
              <span style={{
                fontSize: 22, fontWeight: 800,
                background: "linear-gradient(90deg, #60a5fa, #a78bfa, #34d399)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                letterSpacing: "-0.5px",
              }}>FWG-UltraEdge</span>
              <span style={{
                fontSize: 11, color: "#475569",
                border: "1px solid #334155", borderRadius: 5,
                padding: "2px 7px", fontFamily: "monospace",
              }}>SLSA L3</span>
            </div>
            <div style={{ color: "#64748b", fontSize: 12 }}>
              Enterprise CI/CD Architecture · 11-Job Pipeline · Cloudflare Workers · Bun Runtime
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Bun ⚡", "SLSA L3 🏛️", "CF Workers ☁️", "11 Jobs 🔄"].map(tag => (
              <span key={tag} style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, padding: "3px 9px", fontSize: 11, color: "#94a3b8",
              }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 2, padding: "12px 28px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "#0a0f1e",
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab === t.id ? "rgba(99,102,241,0.15)" : "transparent",
            color: tab === t.id ? "#a5b4fc" : "#64748b",
            border: "none",
            borderBottom: tab === t.id ? "2px solid #6366f1" : "2px solid transparent",
            padding: "8px 16px",
            fontSize: 13, fontWeight: 500,
            cursor: "pointer",
            borderRadius: "6px 6px 0 0",
            transition: "all 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1200 }}>

        {/* TREE TAB */}
        {tab === "tree" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
                  📁 Project Directory Structure
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Click any folder to expand/collapse · FWG-UltraEdge 🌍⚡ Enterprise Layout
                </div>
              </div>
            </div>
            <div style={{
              background: "#0d1117",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: "20px 16px",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}>
              <div style={{ color: "#475569", fontSize: 11, marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                fwg-ultraedge/ &nbsp;·&nbsp; 🌍⚡ FWG-UltraEdge Enterprise Cloudflare Worker
              </div>
              {tree.map((node, i) => (
                <TreeNode key={i} node={node} depth={0} />
              ))}
            </div>
          </div>
        )}

        {/* PIPELINE TAB */}
        {tab === "pipeline" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
                🔄 11-Job SLSA Pipeline
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Click any job for details · Jobs run in dependency order · Bun Runtime throughout
              </div>
            </div>

            {layers.map(layer => {
              const layerJobs = jobs.filter(j => j.layer === layer);
              return (
                <div key={layer} style={{ marginBottom: 20 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    marginBottom: 10,
                  }}>
                    <div style={{
                      width: 3, height: 16, borderRadius: 2,
                      background: layerColors[layer],
                    }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: layerColors[layer], textTransform: "uppercase", letterSpacing: 1 }}>
                      {layer} Layer
                    </span>
                    <div style={{ flex: 1, height: 1, background: `${layerColors[layer]}20` }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                    {layerJobs.map(job => (
                      <JobCard
                        key={job.id}
                        job={job}
                        active={activeJob?.id === job.id}
                        onClick={setActiveJob}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {activeJob && (
              <div style={{
                background: `${activeJob.color}10`,
                border: `1px solid ${activeJob.color}44`,
                borderRadius: 12,
                padding: 20,
                marginTop: 8,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>
                      {activeJob.icon} <span style={{ color: activeJob.color, fontWeight: 700 }}>Job {activeJob.id}: {activeJob.name}</span>
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, fontFamily: "monospace" }}>
                      Tool: {activeJob.tool}
                    </div>
                  </div>
                  <button onClick={() => setActiveJob(null)} style={{
                    background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18,
                  }}>✕</button>
                </div>
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                  {[
                    ["Layer", activeJob.layer],
                    ["Needs Jobs", activeJob.needs.length ? activeJob.needs.map(n => `#${n}`).join(", ") : "None (runs first)"],
                    ["Environment", activeJob.env || "All branches"],
                    ["Optional", activeJob.optional ? "Yes" : "No"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ color: "#64748b", fontSize: 10, marginBottom: 3, textTransform: "uppercase", letterSpacing: 1 }}>{k}</div>
                      <div style={{ color: "#e2e8f0", fontSize: 13, fontFamily: "monospace" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECRETS TAB */}
        {tab === "secrets" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
                🔑 GitHub Secrets Registry
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                All secrets used by the 11-Job pipeline · ✅ = configured · ⚙️ = optional
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {secrets.map(s => (
                <div key={s.name} style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10,
                  padding: "12px 18px",
                  display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
                }}>
                  <span style={{ fontSize: 16 }}>{s.status}</span>
                  <span style={{
                    fontFamily: "monospace", fontSize: 13, fontWeight: 700,
                    color: s.status === "✅" ? "#10b981" : "#64748b",
                    minWidth: 240,
                  }}>{s.name}</span>
                  <span style={{ color: "#475569", fontSize: 11 }}>{s.since}</span>
                  <span style={{ color: "#94a3b8", fontSize: 12, marginLeft: "auto" }}>{s.usage}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BINDINGS TAB */}
        {tab === "bindings" && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>
                🔗 Cloudflare Bindings
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                KV · R2 · Durable Objects · Smart Placement enabled globally
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14, marginBottom: 20 }}>
              {bindings.map(b => (
                <div key={b.binding} style={{
                  background: `${b.color}0d`,
                  border: `1px solid ${b.color}33`,
                  borderRadius: 12,
                  padding: 20,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 24 }}>{b.icon}</span>
                    <div>
                      <div style={{ color: b.color, fontWeight: 700, fontSize: 14 }}>{b.type}</div>
                      <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 13 }}>{b.binding}</div>
                    </div>
                  </div>
                  <div style={{
                    background: "rgba(0,0,0,0.4)", borderRadius: 7,
                    padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#64748b",
                    wordBreak: "break-all",
                  }}>{b.id}</div>
                </div>
              ))}
            </div>

            <div style={{
              background: "rgba(99,102,241,0.07)",
              border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: 12, padding: 18,
            }}>
              <div style={{ fontWeight: 700, color: "#a5b4fc", marginBottom: 10, fontSize: 13 }}>
                🧠 Global Optimization Settings
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  ["placement.mode", "smart"],
                  ["compatibility_date", "2025-04-01"],
                  ["compatibility_flags", "nodejs_compat"],
                  ["limits.cpu_ms", "50"],
                  ["observability", "enabled (100% sampling)"],
                  ["logpush", "enabled"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8, fontFamily: "monospace", fontSize: 12 }}>
                    <span style={{ color: "#64748b" }}>{k}:</span>
                    <span style={{ color: "#34d399" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "14px 28px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        color: "#334155", fontSize: 11, flexWrap: "wrap", gap: 8,
      }}>
        <span>🌍⚡ FWG-UltraEdge · Enterprise DevOps Architecture</span>
        <span>SLSA Level 3 · Bun Runtime · Cloudflare Workers · GitHub Actions</span>
      </div>
    </div>
  );
}
