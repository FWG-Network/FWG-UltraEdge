import { useState, useEffect, useRef, useCallback } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const REPO        = "FWG-Network/FWG-UltraEdge";
const WORKFLOW    = "deploy.yml";
const GH_API      = "https://api.github.com";

const SEV_COLORS = {
  CRITICAL: { color: "#ff2d55", rgb: "255,45,85" },
  HIGH:     { color: "#ff6b00", rgb: "255,107,0" },
  MEDIUM:   { color: "#ffcc00", rgb: "255,204,0" },
  LOW:      { color: "#636366", rgb: "99,99,102" },
  INFO:     { color: "#48484a", rgb: "72,72,74"  },
};

const STATIC_FINDINGS = [
  {
    id: "C-001", severity: "CRITICAL",
    category: "JSON Injection via github.ref_name in curl",
    location: "Job 8, 9, 10 — Slack notification steps",
    vuln: '-d "{\\"Branch\\": \\"${{ github.ref_name }}\\"...}"',
    detail: 'github.ref_name interpolated directly into JSON string. Branch named main","evil":"injected can break JSON and exfiltrate runner env vars.',
    impact: "Slack message injection. Attacker exfiltrates secrets via crafted branch name.",
    fix: ['Use jq to build JSON: jq -n --arg branch "$REF" \'{text: $branch}\'', "Never interpolate shell vars directly into JSON strings", "Assign github.ref_name to env var first, then pass to jq"],
    code: '# SAFE\nREF="${{ steps.ref-sanitize.outputs.safe_ref }}"\npayload=$(jq -n --arg b "$REF" --arg s "${{ github.sha }}" \\\n  \'{text: ("Branch: " + $b + " SHA: " + $s)}\')\ncurl -s -X POST "${WEBHOOK}" -H "Content-Type: application/json" -d "$payload"',
  },
  {
    id: "C-002", severity: "CRITICAL",
    category: "SLSA Generator Tag Not Pinned to SHA",
    location: "Job 7 — slsa-provenance",
    vuln: "uses: slsa-framework/slsa-github-generator/...@v2.0.0",
    detail: "Pipeline uses mutable tag @v2.0.0. Force-pushed tag can replace generator with malicious code that signs attacker artifacts.",
    impact: "Supply chain compromise. Malicious artifact receives valid SLSA L3 provenance.",
    fix: ["Run: git ls-remote https://github.com/slsa-framework/slsa-github-generator refs/tags/v2.0.0", "Replace @v2.0.0 with the exact 40-char commit SHA", "Pin ALL reusable workflow calls to commit SHAs"],
    code: "uses: slsa-framework/slsa-github-generator\\\n  /.github/workflows/generator_generic_slsa3.yml\\\n  @3ea0616b851b8bcd4b...  # pin exact SHA",
  },
  {
    id: "C-003", severity: "CRITICAL",
    category: "OSV Scanner Checks Wrong Severity Field",
    location: "Job 5 — Run OSV Scanner",
    vuln: '.database_specific.severity // "" | ascii_upcase',
    detail: "OSV JSON stores severity in multiple locations. Pipeline ONLY checks database_specific — CVEs using standard CVSS path silently bypass the gate.",
    impact: "Critical/High CVEs bypass security gate. Pipeline deploys with known vulnerabilities.",
    fix: ["Check ALL severity paths in OSV JSON schema", "Parse .severity[].score for CVSS >= 9.0 (CRITICAL)", "Use osv-scanner --fail-on-vuln flag as primary gate"],
    code: "CRIT=$(jq '[.results[]?.packages[]?.vulnerabilities[]?\n   | (.severity[]?.score // 0 >= 9.0),\n     ((.database_specific.severity // \"\") | ascii_upcase == \"CRITICAL\")\n   | select(.)] | length' osv-results.json)",
  },
  {
    id: "H-001", severity: "HIGH",
    category: "TOCTOU Race — Artifact Integrity via Job Outputs",
    location: "Job 8, 9, 10 — Verify artifact integrity",
    vuln: "EXPECTED_B64 from job output -> base64 decode -> compare",
    detail: "SLSA subject hash travels: runner disk → Actions API → new runner disk. Compromised API can substitute expected hash.",
    impact: "Tampered artifact passes integrity check. Malicious code deploys to production.",
    fix: ["Use slsa-verifier binary to verify signed provenance attestation", "Compare artifact hash against SLSA attestation, not job outputs", "Add second independent HMAC verification using separate secret"],
    code: "slsa-verifier verify-artifact dist.tar.gz \\\n  --provenance-path provenance.intoto.jsonl \\\n  --source-uri github.com/FWG-Network/FWG-UltraEdge \\\n  --source-tag ${{ github.ref_name }}",
  },
  {
    id: "H-002", severity: "HIGH",
    category: "Rollback Target Command Injection",
    location: "Job 10 — Capture pre-deploy state",
    vuln: 'PREV_VERSION=$(npx wrangler ... | bun -e "...")',
    detail: "Previous deployment ID from wrangler CLI used directly in rollback command. Cloudflare API response with shell metacharacters enables injection.",
    impact: "Rollback to attacker-controlled version, or command injection during auto-rollback.",
    fix: ["Sanitize PREV_VERSION — strip non [a-zA-Z0-9-_] chars", "Validate format matches Cloudflare UUID: ^[0-9a-f-]{36}$", "Quote variable properly"],
    code: 'if [[ ! "${PREV_RAW}" =~ ^[0-9a-f-]{36}$ ]]; then\n  PREV="unknown"\nelse\n  PREV="${PREV_RAW}"\nfi',
  },
  {
    id: "H-003", severity: "HIGH",
    category: "HMAC Replay Attack — No Timestamp Window",
    location: "Job 9, 10 — Health check HMAC",
    vuln: "X-Health-Timestamp + X-Health-Signature (no expiry window)",
    detail: "HMAC signs Unix timestamp. If Worker does NOT validate timestamp is within acceptable window, attacker replays the signed request indefinitely.",
    impact: "Health check endpoint bypassed via replay. Attacker fakes healthy responses.",
    fix: ["Worker must validate: Math.abs(Date.now()/1000 - timestamp) < 30", "Add nonce/jti to HMAC payload to prevent exact replays", "Log and alert on timestamps outside valid window"],
    code: "const ts = parseInt(req.headers.get('X-Health-Timestamp') ?? '0');\nconst now = Math.floor(Date.now() / 1000);\nif (Math.abs(now - ts) > 30) {\n  return new Response('Replay detected', { status: 401 });\n}",
  },
  {
    id: "M-001", severity: "MEDIUM",
    category: "Cache Poisoning — node_modules Cached Unsafely",
    location: "All jobs — Cache Bun modules",
    vuln: "path: ~/.bun/install/cache\n      node_modules",
    detail: "Cache stores both ~/.bun/install/cache AND node_modules. Compromised dependency serves stale malicious code.",
    impact: "Persistent cache poisoning. Once-poisoned cache serves malicious node_modules.",
    fix: ["Cache ONLY ~/.bun/install/cache, not node_modules", "Always run bun install --frozen-lockfile even on cache hit", "Rotate cache key on any security incident"],
    code: "- uses: actions/cache@v4\n  with:\n    path: ~/.bun/install/cache\n    key: bun-${{ runner.os }}-${{ env.BUN_VERSION }}-${{ hashFiles('bun.lockb') }}",
  },
  {
    id: "M-002", severity: "MEDIUM",
    category: "Wrangler Missing --minify + Source Map Leakage",
    location: "Job 6, 8 — Build Worker artifact",
    vuln: "npx wrangler deploy --dry-run --outdir dist  # no --minify",
    detail: "No --minify flag. Wrangler emits unminified JS exposing internal variable names and comments.",
    impact: "IP exposure, internal infrastructure reconnaissance via source maps.",
    fix: ["Add --minify to all wrangler deploy commands", "Set upload_source_maps = false in wrangler.toml for production", "Strip all console.log statements in production builds"],
    code: "npx wrangler@${{ env.WRANGLER_VERSION }} deploy \\\n  --env production --name ultraedge-prod --minify",
  },
  {
    id: "M-003", severity: "MEDIUM",
    category: "Path Traversal via ref_name Forward Slash",
    location: "Job 6 — Sanitize and validate ref_name",
    vuln: 'SANITIZED="${RAW_REF//[^a-zA-Z0-9._\\/-]/}"',
    detail: "Sanitization allows forward slashes. A ref like ../../etc/passwd can traverse artifact storage paths.",
    impact: "Path traversal in artifact naming. Defense-in-depth failure.",
    fix: ['Explicitly reject any ref containing ".." sequences', 'Strict allowlist: ^(v[0-9]+\\.[0-9]+\\.[0-9]+|main|develop|feature\\/[a-z0-9-]+)$', "Remove ALL slashes before filename construction"],
    code: 'if [[ "${SANITIZED}" == *".."* ]]; then\n  echo "Path traversal detected"; exit 1\nfi',
  },
  {
    id: "L-001", severity: "LOW",
    category: "Stream Key Exposed to Full Dependency Tree",
    location: "Job 11 — Trigger OBS Live Stream",
    vuln: "env:\n  STREAM_KEY: ${{ secrets.STREAM_KEY }}",
    detail: "STREAM_KEY passed as full environment variable. Any transitive dependency can read process.env.STREAM_KEY.",
    impact: "Stream key theft via compromised dependency.",
    fix: ["Audit obs-trigger.ts dependencies for process.env access", "Use Bun --env-file with restricted scope", "Generate short-lived token per run instead of long-lived key"],
    code: "bun run --env-file=.env.stream scripts/obs-trigger.ts\ntrap 'rm -f .env.stream' EXIT",
  },
  {
    id: "INFO-001", severity: "INFO",
    category: "VLESS/Trojan Protocol DPI Detection Risk",
    location: "Cloudflare Worker — Protocol Layer",
    vuln: "VLESS/Trojan over WebSocket on HTTPS port 443",
    detail: "DPI systems detect VLESS/Trojan via TLS fingerprint (JA3/JA4), traffic pattern analysis, WebSocket upgrade header inspection.",
    impact: "Protocol detection and blocking by national firewalls, corporate proxies, or ISP-level DPI.",
    fix: ["Obfuscate WebSocket path — use random UUID paths, never /vless", "Implement traffic padding to normalize packet sizes", "Consider XTLS-Vision or Reality protocol for better TLS camouflage"],
    code: 'const WS_PATH = env.WS_PATH ?? "/api/v2/data";\n// Set WS_PATH as Cloudflare Worker secret\n// Never hardcode /vless, /trojan, /ws in source',
  },
];

// ── GitHub API helpers ────────────────────────────────────────────────────────
async function ghFetch(path, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${GH_API}${path}`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `GitHub API ${res.status}`);
  }
  return res.json();
}

// ── ScoreRing ─────────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const circleRef   = useRef(null);
  const circumference = 2 * Math.PI * 50;
  const scoreColor  = score >= 70 ? "#34c759" : score >= 40 ? "#ffcc00" : "#ff2d55";

  useEffect(() => {
    const el = circleRef.current;
    if (!el) return;
    el.style.strokeDasharray = `0 ${circumference}`;
    el.style.transition = "none";
    const id = setTimeout(() => {
      el.style.transition = "stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)";
      el.style.strokeDasharray = `${(score / 100) * circumference} ${circumference}`;
    }, 400);
    return () => clearTimeout(id);
  }, [score, circumference]);

  return (
    <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" width="120" height="120">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#1a1a2e" strokeWidth="8" />
        <circle ref={circleRef} cx="60" cy="60" r="50" fill="none"
          stroke={scoreColor} strokeWidth="8"
          strokeDasharray={`0 ${circumference}`}
          strokeLinecap="round" transform="rotate(-90 60 60)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, color: scoreColor, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 7, color: "#48484a", letterSpacing: 2, textTransform: "uppercase", textAlign: "center" }}>Security<br />Score</span>
      </div>
    </div>
  );
}

// ── StatusDot ─────────────────────────────────────────────────────────────────
function StatusDot({ status }) {
  const map = {
    success:     "#34c759",
    failure:     "#ff2d55",
    in_progress: "#ffcc00",
    queued:      "#636366",
    cancelled:   "#48484a",
    skipped:     "#2c2c3a",
    timed_out:   "#ff6b00",
  };
  const color = map[status] || "#2c2c3a";
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0, marginTop: 1,
    }} />
  );
}

// ── GitHubPanel ───────────────────────────────────────────────────────────────
function GitHubPanel({ data, loading, error, token, onTokenChange, onRefresh }) {
  const [showToken, setShowToken] = useState(false);
  const [draft, setDraft]         = useState("");

  const handleSubmit = () => { if (draft.trim()) onTokenChange(draft.trim()); };

  if (!token) return (
    <div className="gh-panel">
      <div className="gh-title">⚡ GitHub Live Data — {REPO}</div>
      <p className="gh-sub">Enter a GitHub PAT (scopes: <code>repo</code>, <code>actions:read</code>) to load live CI/CD data.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input
          type={showToken ? "text" : "password"}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx  or  github_pat_..."
          className="gh-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
        />
        <button className="gh-btn ghost" onClick={() => setShowToken(v => !v)}>{showToken ? "Hide" : "Show"}</button>
        <button className="gh-btn" onClick={handleSubmit} disabled={!draft.trim()}>Connect</button>
      </div>
      <p className="gh-hint">Token used only client-side in this browser session. Not stored anywhere.</p>
    </div>
  );

  return (
    <div className="gh-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="gh-title">⚡ GitHub Live — <span style={{ color: "#58a6ff" }}>{REPO}</span></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="gh-btn ghost" onClick={() => onTokenChange("")}>Disconnect</button>
          <button className="gh-btn" onClick={onRefresh} disabled={loading}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="gh-error">⚠ {error}</div>}

      {loading && !data && (
        <div style={{ textAlign: "center", padding: "28px", color: "#2c2c3a", fontSize: 11, letterSpacing: 2 }}>
          FETCHING GITHUB DATA…
        </div>
      )}

      {data && (
        <div className="gh-grid">
          {/* Repo Stats */}
          <div className="gh-card">
            <div className="gh-card-title">Repository</div>
            <div className="gh-stat">{data.repo?.stargazers_count ?? "—"} <span>★ Stars</span></div>
            <div className="gh-stat">{data.repo?.open_issues_count ?? "—"} <span>Open Issues</span></div>
            <div className="gh-stat">{data.repo?.forks_count ?? "—"} <span>Forks</span></div>
            <div className="gh-badge" style={{ color: data.repo?.visibility === "public" ? "#34c759" : "#ffcc00", marginTop: 8 }}>
              {(data.repo?.visibility ?? "unknown").toUpperCase()}
            </div>
          </div>

          {/* Latest Run */}
          <div className="gh-card">
            <div className="gh-card-title">Latest Pipeline Run ({WORKFLOW})</div>
            {data.latestRun ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <StatusDot status={data.latestRun.conclusion ?? data.latestRun.status} />
                  <span className="gh-run-name">{data.latestRun.display_title ?? data.latestRun.name}</span>
                </div>
                {[
                  ["Branch",    data.latestRun.head_branch],
                  ["Status",    data.latestRun.conclusion ?? data.latestRun.status],
                  ["SHA",       data.latestRun.head_sha?.slice(0, 7)],
                  ["Triggered", new Date(data.latestRun.created_at).toLocaleString()],
                  ["Actor",     data.latestRun.actor?.login],
                ].map(([l, v]) => (
                  <div key={l} className="gh-meta-row">
                    <span>{l}</span>
                    <span style={l === "Status" && data.latestRun.conclusion === "failure" ? { color: "#ff2d55" }
                      : l === "Status" && data.latestRun.conclusion === "success" ? { color: "#34c759" } : {}}>
                      {v}
                    </span>
                  </div>
                ))}
                <a href={data.latestRun.html_url} target="_blank" rel="noopener noreferrer" className="gh-link">
                  View Run on GitHub →
                </a>
              </>
            ) : <span className="gh-empty">No runs found for {WORKFLOW}</span>}
          </div>

          {/* Commits */}
          <div className="gh-card gh-card-wide">
            <div className="gh-card-title">Recent Commits — main</div>
            {data.commits?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {data.commits.slice(0, 6).map(c => (
                  <div key={c.sha} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <a href={c.html_url} target="_blank" rel="noopener noreferrer" className="gh-sha">
                      {c.sha.slice(0, 7)}
                    </a>
                    <span className="gh-commit-msg">{c.commit.message.split("\n")[0]}</span>
                    <span className="gh-commit-author">{c.commit.author.name}</span>
                    <span className="gh-commit-author">{new Date(c.commit.author.date).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : <span className="gh-empty">No commits found</span>}
          </div>

          {/* Run History */}
          <div className="gh-card gh-card-wide">
            <div className="gh-card-title">Pipeline Run History (Last 10 runs)</div>
            {data.runs?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.runs.slice(0, 10).map(r => (
                  <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <StatusDot status={r.conclusion ?? r.status} />
                    <a href={r.head_commit?.url ?? r.html_url} target="_blank" rel="noopener noreferrer" className="gh-sha">
                      {r.head_sha?.slice(0, 7)}
                    </a>
                    <a href={r.html_url} target="_blank" rel="noopener noreferrer"
                      className="gh-commit-msg" style={{ flex: 1, color: "#636366", textDecoration: "none" }}>
                      {r.display_title ?? r.name}
                    </a>
                    <span className="gh-commit-author">{r.head_branch}</span>
                    <span className="gh-commit-author" style={{
                      color: r.conclusion === "failure" ? "#ff2d55" : r.conclusion === "success" ? "#34c759" : "#636366"
                    }}>
                      {r.conclusion ?? r.status}
                    </span>
                    <span className="gh-commit-author">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : <span className="gh-empty">No runs found</span>}
          </div>

          {/* Open Issues */}
          <div className="gh-card gh-card-wide">
            <div className="gh-card-title">Open Issues / Pull Requests</div>
            {data.issues?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {data.issues.slice(0, 8).map(i => (
                  <div key={i.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: i.pull_request ? "#58a6ff" : "#34c759", fontSize: 9, flexShrink: 0, width: 22 }}>
                      {i.pull_request ? "PR" : "ISS"}
                    </span>
                    <a href={i.html_url} target="_blank" rel="noopener noreferrer"
                      className="gh-link" style={{ flex: 1, margin: 0 }}>
                      {i.title}
                    </a>
                    <span className="gh-commit-author">#{i.number}</span>
                    <span className="gh-commit-author">{i.user?.login}</span>
                  </div>
                ))}
              </div>
            ) : <div className="gh-empty">No open issues 🎉</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SecurityAudit() {
  const [activeId, setActiveId]   = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [mounted, setMounted]     = useState(false);
  const [token, setToken]         = useState("");
  const [ghData, setGhData]       = useState(null);
  const [ghLoading, setGhLoading] = useState(false);
  const [ghError, setGhError]     = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const fetchGitHub = useCallback(async (tok = token) => {
    if (!tok) return;
    setGhLoading(true);
    setGhError(null);
    try {
      const [repo, runsData, commits, issues] = await Promise.all([
        ghFetch(`/repos/${REPO}`, tok),
        ghFetch(`/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=10&branch=main`, tok),
        ghFetch(`/repos/${REPO}/commits?per_page=6&sha=main`, tok),
        ghFetch(`/repos/${REPO}/issues?state=open&per_page=8`, tok),
      ]);
      setGhData({
        repo,
        runs:      runsData.workflow_runs ?? [],
        latestRun: runsData.workflow_runs?.[0] ?? null,
        commits,
        issues,
      });
    } catch (err) {
      setGhError(err.message);
    } finally {
      setGhLoading(false);
    }
  }, [token]);

  // Auto-fetch on valid token
  useEffect(() => {
    if (token.startsWith("ghp_") || token.startsWith("github_pat_")) {
      fetchGitHub(token);
    }
    if (!token) setGhData(null);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts  = STATIC_FINDINGS.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
  const score   = Math.max(0, 100 - (counts.CRITICAL || 0) * 25 - (counts.HIGH || 0) * 12 - (counts.MEDIUM || 0) * 5 - (counts.LOW || 0) * 2);
  const visible = filter === "ALL" ? STATIC_FINDINGS : STATIC_FINDINGS.filter(f => f.severity === filter);

  return (
    <div style={{
      minHeight: "100vh", background: "#06060f", color: "#e5e5ea",
      fontFamily: "'IBM Plex Mono','Courier New',monospace",
      opacity: mounted ? 1 : 0, transition: "opacity 0.35s ease",
    }}>
      <style>{CSS}</style>

      {/* HEADER */}
      <div className="hdr">
        <div style={{ flex: 1, position: "relative", zIndex: 1 }}>
          <div className="badge"><span className="pulse" />Security Audit · FWG-UltraEdge · SLSA L3</div>
          <h1 className="title">VULNERABILITY<br />ASSESSMENT</h1>
          <p className="subtitle">White Hat Review — deploy.yml CI/CD Pipeline · 11 Jobs Analyzed</p>
          <div className="meta-row">
            {[
              ["Target",   "FWG-UltraEdge"],
              ["Repo",     REPO],
              ["Scope",    "11 Jobs"],
              ["Date",     new Date().toISOString().slice(0, 10)],
              ["Total",    `${STATIC_FINDINGS.length} Findings`],
              ["Critical", counts.CRITICAL || 0],
              ["High",     counts.HIGH || 0],
            ].map(([l, v]) => (
              <div key={l} className="meta-item">
                <span className="meta-lbl">{l}</span>
                <span className="meta-val"
                  style={l === "Critical" ? { color: "#ff2d55" } : l === "High" ? { color: "#ff6b00" } : {}}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
        <ScoreRing score={score} />
      </div>

      {/* GITHUB PANEL */}
      <div style={{ padding: "20px 48px 0" }}>
        <GitHubPanel
          data={ghData}
          loading={ghLoading}
          error={ghError}
          token={token}
          onTokenChange={setToken}
          onRefresh={() => fetchGitHub(token)}
        />
      </div>

      {/* FILTER BAR */}
      <div className="filter-bar">
        {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map(sev => {
          const cnt = sev === "ALL" ? STATIC_FINDINGS.length : (counts[sev] || 0);
          const col = sev === "ALL" ? "#aeaeb2" : SEV_COLORS[sev]?.color;
          return (
            <button key={sev} className={`filt-btn${filter === sev ? " active" : ""}`}
              style={{ "--sc": col }} onClick={() => setFilter(sev)}>
              <span className="filt-cnt">{cnt}</span>
              <span className="filt-lbl">{sev === "ALL" ? "TOTAL" : sev}</span>
            </button>
          );
        })}
      </div>

      {/* FINDINGS */}
      <div className="findings">
        {visible.map((f, idx) => {
          const open = activeId === f.id;
          const { color, rgb } = SEV_COLORS[f.severity] || SEV_COLORS.INFO;
          return (
            <div key={f.id} style={{ animation: `fadeUp 0.3s ease both`, animationDelay: `${idx * 35}ms` }}>
              <div className={`row${open ? " open" : ""}`}
                style={{ "--sc": color, "--sr": rgb }}
                onClick={() => setActiveId(open ? null : f.id)}>
                <span className="row-id">{f.id}</span>
                <span className="chip">{f.severity}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="row-title">{f.category}</div>
                  <div className="row-loc">{f.location}</div>
                </div>
                <span className={`chev${open ? " rot" : ""}`}>▼</span>
              </div>
              {open && (
                <div className="detail">
                  <div className="ds full">
                    <div className="dh">⚠ Vulnerable Pattern</div>
                    <pre className="vpre">{f.vuln}</pre>
                  </div>
                  <div className="ds">
                    <div className="dh">Technical Analysis</div>
                    <p className="dtxt">{f.detail}</p>
                    <div className="dh" style={{ marginTop: 16 }}>Impact</div>
                    <p className="dtxt" style={{ color: "#ff6b6b" }}>{f.impact}</p>
                  </div>
                  <div className="ds">
                    <div className="dh">→ Mitigation Steps</div>
                    <ul className="fix-list">
                      {f.fix.map((s, i) => <li key={i} className="fix-item">{s}</li>)}
                    </ul>
                  </div>
                  {f.code && (
                    <div className="ds full">
                      <div className="dh">✓ Remediation Code</div>
                      <pre className="cpre">{f.code}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER */}
      <div className="footer">
        <span className="ftxt">WHITE HAT REVIEW · FWG-ULTRAEDGE · SLSA L3</span>
        <a href={`https://github.com/${REPO}/actions`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 8, color: "#2c2c3a", textDecoration: "none", letterSpacing: 1 }}>
          github.com/{REPO}/actions ↗
        </a>
        <span className="ftxt">
          {counts.CRITICAL || 0} CRIT &nbsp;
          {counts.HIGH     || 0} HIGH &nbsp;
          {counts.MEDIUM   || 0} MED &nbsp;
          {counts.LOW      || 0} LOW &nbsp;
          {counts.INFO     || 0} INFO
        </span>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Bebas+Neue&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:#06060f}
::-webkit-scrollbar-thumb{background:#1c1c2e;border-radius:2px}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

.hdr{
  background:linear-gradient(160deg,#0d0d1f 0%,#06060f 100%);
  border-bottom:1px solid #16162a;
  padding:44px 48px 32px;
  position:relative;overflow:hidden;
  display:flex;align-items:flex-start;gap:28px;
}
.hdr::before{
  content:'';position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(255,45,85,.02) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,45,85,.02) 1px,transparent 1px);
  background-size:40px 40px;
}
.hdr::after{
  content:'';position:absolute;bottom:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,rgba(255,45,85,.35),transparent);
}
.badge{
  display:inline-flex;align-items:center;gap:8px;
  background:rgba(255,45,85,.09);border:1px solid rgba(255,45,85,.22);
  border-radius:3px;padding:5px 12px;font-size:9px;letter-spacing:2px;
  color:#ff2d55;text-transform:uppercase;margin-bottom:18px;
}
.pulse{
  width:6px;height:6px;background:#ff2d55;border-radius:50%;
  flex-shrink:0;animation:pulse 1.5s ease-in-out infinite;
}
.title{
  font-family:'Bebas Neue',sans-serif;
  font-size:clamp(38px,5.5vw,66px);letter-spacing:5px;line-height:1;
  color:#fff;margin-bottom:10px;
}
.subtitle{font-size:9px;color:#3a3a3c;letter-spacing:2px;text-transform:uppercase;margin-bottom:28px;}
.meta-row{display:flex;gap:24px;flex-wrap:wrap;}
.meta-item{display:flex;flex-direction:column;gap:4px;}
.meta-lbl{font-size:8px;color:#2c2c3a;letter-spacing:2px;text-transform:uppercase;}
.meta-val{font-size:12px;color:#aeaeb2;font-weight:500;}

/* ── GitHub Panel ── */
.gh-panel{
  background:#09091a;border:1px solid #16162a;
  border-radius:3px;padding:22px 24px;
}
.gh-title{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#aeaeb2;margin-bottom:10px;font-weight:600;}
.gh-sub{font-size:11px;color:#2c2c3a;margin-bottom:12px;line-height:1.7;}
.gh-hint{font-size:9px;color:#1c1c2e;margin-top:8px;letter-spacing:1px;}
.gh-input{
  flex:1;min-width:220px;
  background:#06060f;border:1px solid #1c1c2e;border-radius:2px;
  padding:8px 12px;color:#e5e5ea;
  font-family:'IBM Plex Mono',monospace;font-size:11px;
  outline:none;transition:border-color .18s;
}
.gh-input:focus{border-color:#ff2d55;}
.gh-input::placeholder{color:#2c2c3a;}
.gh-btn{
  background:rgba(255,45,85,.09);border:1px solid rgba(255,45,85,.22);
  border-radius:2px;padding:8px 16px;color:#ff2d55;
  font-family:'IBM Plex Mono',monospace;font-size:9px;
  letter-spacing:1.5px;text-transform:uppercase;
  cursor:pointer;transition:all .18s;white-space:nowrap;
}
.gh-btn:hover:not(:disabled){background:rgba(255,45,85,.18);}
.gh-btn:disabled{opacity:.4;cursor:not-allowed;}
.gh-btn.ghost{background:transparent;border-color:#1c1c2e;color:#636366;}
.gh-btn.ghost:hover{border-color:#2c2c3a;color:#aeaeb2;}
.gh-error{
  background:rgba(255,45,85,.07);border:1px solid rgba(255,45,85,.18);
  border-radius:2px;padding:8px 12px;font-size:10px;color:#ff2d55;margin-bottom:12px;
}
.gh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;}
.gh-card{background:#06060f;border:1px solid #14142a;border-radius:2px;padding:14px 16px;}
.gh-card-wide{grid-column:1/-1;}
.gh-card-title{
  font-size:8px;letter-spacing:2px;text-transform:uppercase;
  color:#2c2c3a;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #14142a;
}
.gh-stat{font-size:20px;font-family:'Bebas Neue',sans-serif;color:#e5e5ea;line-height:1.3;}
.gh-stat span{font-family:'IBM Plex Mono',monospace;font-size:9px;color:#2c2c3a;margin-left:6px;}
.gh-badge{font-size:8px;letter-spacing:2px;}
.gh-meta-row{
  display:flex;justify-content:space-between;align-items:center;
  font-size:10px;color:#636366;padding:4px 0;border-bottom:1px solid #0d0d1a;
}
.gh-meta-row span:last-child{color:#aeaeb2;font-size:10px;}
.gh-run-name{font-size:10px;color:#e5e5ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gh-sha{
  font-size:9px;color:#ff6b00;font-family:monospace;flex-shrink:0;
  background:rgba(255,107,0,.08);padding:1px 5px;border-radius:2px;
  text-decoration:none;
}
.gh-sha:hover{background:rgba(255,107,0,.18);}
.gh-commit-msg{font-size:10px;color:#636366;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;}
.gh-commit-author{font-size:9px;color:#2c2c3a;flex-shrink:0;white-space:nowrap;}
.gh-link{font-size:9px;color:#58a6ff;text-decoration:none;letter-spacing:1px;margin-top:8px;display:inline-block;}
.gh-link:hover{color:#79b8ff;}
.gh-empty{font-size:10px;color:#1c1c2e;font-style:italic;}

/* ── Filter Bar ── */
.filter-bar{
  display:flex;gap:1px;flex-wrap:wrap;
  padding:14px 48px;
  background:#09091a;
  border-top:1px solid #16162a;
  border-bottom:1px solid #16162a;
  margin-top:20px;
}
.filt-btn{
  flex:1;min-width:80px;padding:12px;
  background:transparent;border:1px solid transparent;
  color:#e5e5ea;font-family:'IBM Plex Mono','Courier New',monospace;
  cursor:pointer;transition:all .18s;border-radius:2px;
  position:relative;overflow:hidden;
}
.filt-btn:hover{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.07);}
.filt-btn.active{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.09);}
.filt-btn.active::after{
  content:'';position:absolute;bottom:0;left:0;right:0;height:2px;
  background:var(--sc);box-shadow:0 0 8px var(--sc);
}
.filt-cnt{display:block;font-family:'Bebas Neue',sans-serif;font-size:26px;line-height:1;color:var(--sc);}
.filt-lbl{display:block;font-size:7px;color:#2c2c3a;letter-spacing:2px;text-transform:uppercase;margin-top:4px;}

/* ── Findings ── */
.findings{padding:24px 48px;display:flex;flex-direction:column;gap:3px;}
.row{
  display:grid;grid-template-columns:72px 90px 1fr 22px;
  align-items:center;gap:14px;padding:13px 18px;
  background:#09091a;border:1px solid #14142a;border-radius:2px;
  cursor:pointer;transition:all .18s;position:relative;overflow:hidden;user-select:none;
}
.row::before{
  content:'';position:absolute;left:0;top:0;bottom:0;width:3px;
  background:var(--sc);box-shadow:0 0 8px rgba(var(--sr),.45);
}
.row:hover{background:#0c0c20;border-color:rgba(255,255,255,.09);transform:translateX(2px);}
.row.open{background:#0c0c20;border-color:rgba(255,255,255,.11);border-radius:2px 2px 0 0;border-bottom-color:transparent;}
.row-id{font-size:9px;color:#2c2c3a;letter-spacing:1px;}
.chip{
  display:inline-flex;align-items:center;padding:3px 7px;border-radius:2px;
  font-size:7px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;
  background:rgba(var(--sr),.1);color:var(--sc);border:1px solid rgba(var(--sr),.25);
}
.row-title{font-size:12px;color:#e5e5ea;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.row-loc{font-size:9px;color:#2c2c3a;margin-top:3px;}
.chev{font-size:9px;color:#2c2c3a;transition:transform .2s;display:flex;align-items:center;justify-content:center;}
.chev.rot{transform:rotate(180deg);}
.detail{
  background:#060610;border:1px solid rgba(255,255,255,.09);
  border-top:none;border-radius:0 0 2px 2px;
  padding:22px 22px 22px 92px;
  display:grid;grid-template-columns:1fr 1fr;gap:18px;
}
.ds{display:flex;flex-direction:column;gap:8px;}
.full{grid-column:1/-1;}
.dh{
  font-size:7px;letter-spacing:2px;text-transform:uppercase;color:#2c2c3a;
  padding-bottom:6px;border-bottom:1px solid #14142a;margin-bottom:4px;
}
.vpre{
  background:#08080f;border:1px solid #1a1a2e;border-left:3px solid #ff2d55;
  padding:10px 12px;font-size:10px;color:#ff6b6b;border-radius:2px;
  white-space:pre-wrap;word-break:break-all;
  font-family:'IBM Plex Mono','Courier New',monospace;
}
.cpre{
  background:#050f05;border:1px solid #0d1f0d;border-left:3px solid #34c759;
  padding:10px 12px;font-size:10px;color:#4cb86b;border-radius:2px;
  white-space:pre-wrap;word-break:break-word;overflow-x:auto;
  font-family:'IBM Plex Mono','Courier New',monospace;
}
.dtxt{font-size:11px;color:#48484a;line-height:1.75;}
.fix-list{list-style:none;display:flex;flex-direction:column;gap:7px;}
.fix-item{display:flex;gap:10px;font-size:11px;color:#48484a;line-height:1.6;}
.fix-item::before{content:"->";color:#34c759;flex-shrink:0;}

/* ── Footer ── */
.footer{
  border-top:1px solid #16162a;padding:16px 48px;
  display:flex;justify-content:space-between;align-items:center;
  background:#09091a;flex-wrap:wrap;gap:8px;
}
.ftxt{font-size:8px;color:#1c1c2e;letter-spacing:1px;}

/* ── Responsive ── */
@media(max-width:768px){
  .hdr{padding:20px;flex-direction:column;}
  .findings,.filter-bar,.footer{padding:16px 20px;}
  .gh-panel{padding:16px;}
  .detail{grid-template-columns:1fr;padding:14px;}
  .row{grid-template-columns:56px 1fr 20px;gap:10px;}
  .row-id{display:none;}
  .title{font-size:34px;}
}
`;
