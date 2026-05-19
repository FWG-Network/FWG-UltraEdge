import { useState, useEffect } from "react"; // ១. ថែម useEffect មកដែរ

// បង្កើត State សម្រាប់ទាញទិន្នន័យពិតពី GitHub
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function startAudit() {
      try {
        // បងត្រូវប្តូរ USERNAME និង REPO_NAME ឱ្យត្រូវនឹងរបស់បង
        const response = await fetch(`https://api.github.com/repos/FWG-Network/FWG-UltraEdge/code-scanning/alerts`, {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        const data = await response.json();

        // បំប្លែងទិន្នន័យពី GitHub ឱ្យមកចូលក្នុង Dashboard បង
        const mappedData = data.map(alert => ({
          id: `GH-${alert.number}`,
          severity: alert.rule.security_severity_level?.toUpperCase() || "HIGH",
          category: alert.tool.name,
          icon: alert.rule.security_severity_level === 'critical' ? "💀" : "⚠️",
          color: alert.rule.security_severity_level === 'critical' ? "#ff2d55" : "#ffcc00",
          location: alert.most_recent_instance.location.path,
          detail: alert.rule.description,
          impact: "Security risk detected in GitHub Scan",
          fix: ["Update the affected code", "Check GitHub Security tab for more info"],
          code: alert.html_url
        }));

        setFindings(mappedData);
        setLoading(false);
      } catch (err) {
        console.error("API Error:", err);
        setLoading(false);
      }
    }

    startAudit();
  }, []);

  // បើកំពុងទាញទិន្នន័យ ឱ្យវាបង្ហាញពាក្យ Loading សិន
  if (loading) return <div style={{color: 'white', textAlign: 'center', marginTop: '100px'}}>កំពុងភ្ជាប់ទៅ GitHub Security API...</div>;
  {
    id: "C-002",
    severity: "CRITICAL",
    category: "SLSA Generator Tag Pinning (Incomplete Fix)",
    icon: "🚨",
    color: "#ff6b00",
    glow: "rgba(255,107,0,0.4)",
    location: "Job 7 — slsa-provenance",
    vuln: `uses: slsa-framework/slsa-github-generator/...@v2.0.0`,
    detail: "The pipeline comment admits this is NOT pinned to an immutable SHA yet: '↑ UPGRADE INSTRUCTION: replace @v2.0.0 with exact commit SHA'. The M4-FIXED label is misleading — the actual YAML still uses the mutable @v2.0.0 tag. A compromised/force-pushed tag can replace the generator with malicious code that signs attacker artifacts.",
    impact: "Supply chain compromise. Attacker replaces SLSA generator → malicious artifact gets valid SLSA L3 provenance. Entire trust chain collapses.",
    fix: [
      "Immediately replace @v2.0.0 with the exact commit SHA",
      "Run: git ls-remote https://github.com/slsa-framework/slsa-github-generator refs/tags/v2.0.0",
      "Pin ALL reusable workflow calls to commit SHAs, not tags"
    ],
    code: `# ✅ CORRECT (example SHA — verify yours)\nuses: slsa-framework/slsa-github-generator\\\n  /.github/workflows/generator_generic_slsa3.yml\\\n  @3ea0616b851b8bcd...  # verified SHA of v2.0.0`
  },
  {
    id: "C-003",
    severity: "CRITICAL",
    category: "OSV Scanner — Severity Field Path Unreliable",
    icon: "🔍",
    color: "#ff9500",
    glow: "rgba(255,149,0,0.4)",
    location: "Job 5 — Run OSV Scanner",
    vuln: `.database_specific.severity // "" | ascii_upcase`,
    detail: "OSV JSON schema stores severity in multiple locations: .severity[].type (CVSS), .affected[].severity[], and .database_specific.severity. The pipeline ONLY checks database_specific.severity — if a CVE uses the standard .severity[] array (CVSS v3 scores), it is silently ignored. A CRITICAL CVE can pass the gate undetected.",
    impact: "Critical/High CVEs bypass the security gate. Pipeline proceeds to production with known-critical vulnerabilities.",
    fix: [
      "Check ALL severity fields in OSV JSON schema",
      "Also parse .severity[].score for CVSS ≥ 9.0 (CRITICAL) and ≥ 7.0 (HIGH)",
      "Use osv-scanner's built-in --fail-on-vuln flag as a primary gate"
    ],
    code: `# ✅ Comprehensive severity check\nCRITICAL_COUNT=$(jq '\n  [.results[]?.packages[]?.vulnerabilities[]?\n   | (.severity[]?.score // 0 | . >= 9.0),\n     ((.database_specific.severity // "") \n      | ascii_upcase == "CRITICAL")\n   | select(.)]\n  | length\n' osv-results.json)`
  },
  {
    id: "H-001",
    severity: "HIGH",
    category: "TOCTOU Race — Artifact Integrity Check",
    icon: "⚡",
    color: "#ffcc00",
    glow: "rgba(255,204,0,0.35)",
    location: "Job 8, 9, 10 — Verify artifact integrity",
    vuln: `EXPECTED_B64 from job output → base64 decode → compare`,
    detail: "The SLSA subject hash is passed through GitHub Actions job outputs (GITHUB_OUTPUT), which are stored in runner ephemeral storage. Between Job 6 (build) and Job 10 (prod deploy), the hash traverses: runner disk → Actions API → new runner disk. If the Actions API or output storage is compromised, an attacker can substitute the expected hash to match a tampered artifact. The check compares hash-to-hash, but both values come from the same (potentially compromised) pipeline.",
    impact: "Tampered artifact passes integrity check. Malicious code deploys to production with valid-looking SHA verification.",
    fix: [
      "Use SLSA verifier binary to verify the provenance attestation independently",
      "Compare artifact hash against the signed SLSA attestation, not just job outputs",
      "Add a second independent hash verification using a separate secret-key HMAC"
    ],
    code: `# ✅ Verify against SLSA attestation (not just job outputs)\nslsa-verifier verify-artifact dist.tar.gz \\\n  --provenance-path provenance.intoto.jsonl \\\n  --source-uri github.com/your-org/your-repo \\\n  --source-tag ${{ github.ref_name }}`
  },
  {
    id: "H-002",
    severity: "HIGH",
    category: "Rollback Target Injection",
    icon: "↩️",
    color: "#34c759",
    glow: "rgba(52,199,89,0.35)",
    location: "Job 10 — Capture pre-deploy state",
    vuln: `PREV_VERSION=$(npx wrangler ... | bun -e "...")`,
    detail: "The previous deployment ID is fetched via wrangler CLI and piped to inline Bun code. If wrangler output contains malicious JSON (e.g., from a compromised Cloudflare API response), the bun -e inline script could behave unexpectedly. Additionally, PREV_VERSION is used directly in: wrangler rollback \"${PREV}\" — if PREV contains shell metacharacters, this is a command injection vector.",
    impact: "Rollback to attacker-controlled deployment version, or command injection during auto-rollback.",
    fix: [
      "Sanitize PREV_VERSION: strip all non [a-zA-Z0-9-_] chars",
      "Validate format matches known Cloudflare deployment ID pattern",
      "Quote the variable properly: wrangler rollback \"${PREV}\" (already done but sanitize first)"
    ],
    code: `# ✅ Sanitize deployment ID\nPREV_RAW=$(npx wrangler ... | ...)\n# Cloudflare deployment IDs: UUID format\nif [[ ! \"${PREV_RAW}\" =~ ^[0-9a-f-]{36}$ ]]; then\n  echo \"Invalid deployment ID format\"\n  PREV=\"unknown\"\nelse\n  PREV=\"${PREV_RAW}\"\nfi`
  },
  {
    id: "H-003",
    severity: "HIGH",
    category: "HMAC Replay Attack — No Timestamp Validation Window",
    icon: "🕐",
    color: "#af52de",
    glow: "rgba(175,82,222,0.35)",
    location: "Job 9, 10 — Health check HMAC",
    vuln: `X-Health-Timestamp: ${TIMESTAMP} + X-Health-Signature: ${SIGNATURE}`,
    detail: "The HMAC health check signs the Unix timestamp and sends it in the request. However, if the Worker endpoint does not validate that the timestamp is within an acceptable window (e.g., ±30 seconds), an attacker who can observe the health check request (e.g., via SSRF, log exposure, or network tap) can replay the exact same signed request indefinitely — bypassing the HMAC protection entirely.",
    impact: "Health check endpoint bypassed via replay attack. Attacker can fake a healthy response or probe the internal health endpoint.",
    fix: [
      "Worker must validate: Math.abs(Date.now()/1000 - timestamp) < 30",
      "Add a nonce/jti to the HMAC payload to prevent exact replays",
      "Log and alert on timestamps outside the valid window"
    ],
    code: `// ✅ Worker-side validation (src/index.ts)\nconst ts = parseInt(req.headers.get('X-Health-Timestamp') ?? '0');\nconst now = Math.floor(Date.now() / 1000);\nif (Math.abs(now - ts) > 30) {\n  return new Response('Replay detected', { status: 401 });\n}`
  },
  {
    id: "M-001",
    severity: "MEDIUM",
    category: "Cache Poisoning via Lockfile Hash Collision",
    icon: "📦",
    color: "#32ade6",
    glow: "rgba(50,173,230,0.3)",
    location: "All jobs — Cache Bun modules",
    vuln: `key: bun-${{ runner.os }}-${{ env.BUN_VERSION }}-${{ hashFiles('bun.lockb') }}`,
    detail: "The cache key uses hashFiles('bun.lockb') which is SHA-256 of the lockfile — good. However, the cache stores both ~/.bun/install/cache AND node_modules. node_modules can contain post-install scripts (package.json 'scripts.postinstall'). If a dependency is compromised between cache creation and restoration, the cached node_modules will contain stale malicious code that bun install --frozen-lockfile does NOT re-validate (it reads from cache, not re-downloads).",
    impact: "Persistent cache poisoning. A once-poisoned cache entry serves malicious node_modules to all subsequent pipeline runs.",
    fix: [
      "Cache ONLY ~/.bun/install/cache, not node_modules",
      "Always run bun install --frozen-lockfile even on cache hit (let Bun validate from its own cache)",
      "Add cache key rotation on any security incident"
    ],
    code: `# ✅ Cache only Bun's download cache, not node_modules\n- uses: actions/cache@...\n  with:\n    path: ~/.bun/install/cache\n    key: bun-${{ runner.os }}-${{ env.BUN_VERSION }}-${{ hashFiles('bun.lockb') }}\n# Then always run:\n- run: bun install --frozen-lockfile`
  },
  {
    id: "M-002",
    severity: "MEDIUM",
    category: "Wrangler Deploy — Missing --minify and Source Map Leakage",
    icon: "🗺️",
    color: "#32ade6",
    glow: "rgba(50,173,230,0.3)",
    location: "Job 6, 8 — Build Worker artifact",
    vuln: `npx wrangler deploy --dry-run --outdir dist`,
    detail: "No --minify flag is specified. Wrangler may emit unminified JS to Cloudflare's edge, exposing: internal variable names, comments with infrastructure details (IP ranges, internal hostnames, API endpoint paths), and logic flow that aids reverse engineering. Additionally, if source maps are generated (wrangler.toml: upload_source_maps = true), they expose the full TypeScript source to anyone who knows the Worker's URL (/cdn-cgi/rum or source map headers).",
    impact: "Intellectual property exposure, internal infrastructure reconnaissance via source maps.",
    fix: [
      "Add --minify to all wrangler deploy commands",
      "Ensure wrangler.toml has: upload_source_maps = false for production",
      "Strip all console.log/debug statements in production builds"
    ],
    code: `# ✅ Minified production build\nnpx wrangler@${{ env.WRANGLER_VERSION }} deploy \\\n  --env production \\\n  --name ultraedge-prod \\\n  --minify`
  },
  {
    id: "M-003",
    severity: "MEDIUM",
    category: "ref_name Sanitization — Forward Slash Bypass",
    icon: "🔤",
    color: "#ff9500",
    glow: "rgba(255,149,0,0.3)",
    location: "Job 6 — Sanitize and validate ref_name",
    vuln: `SANITIZED=\"${RAW_REF//[^a-zA-Z0-9._\\/-]/}\"`,
    detail: "The sanitization allows forward slashes (/) in the ref name for feature branches like feature/my-thing. The artifact filename then does: NAME=\"...-${VERSION//\\//-}\" to replace slashes with dashes. However, if the regex validation step passes a string like ../../etc/passwd (which matches the permissive branch regex: [a-zA-Z0-9_/-]{1,100}), and the replacement only catches the first level, path traversal could affect artifact storage paths.",
    impact: "Potential path traversal in artifact naming. Low severity due to GitHub's own ref sanitization, but defense-in-depth requires fixing.",
    fix: [
      "Explicitly reject any ref containing '..' sequences",
      "Use parameter expansion to remove ALL slashes before filename construction",
      "Validate against a strict allowlist: ^(v[0-9]+\\.[0-9]+\\.[0-9]+|main|develop|feature\\/[a-z0-9-]+)$"
    ],
    code: `# ✅ Stricter validation\nif [[ \"${SANITIZED}\" == *\"..\"* ]]; then\n  echo \"Path traversal detected\"\n  exit 1\nfi\n# Strict allowlist\nif [[ ! \"${SANITIZED}\" =~ ^(v[0-9]+\\.[0-9]+\\.[0-9]+|main|develop|feature\\/[a-z0-9-]{1,50})$ ]]; then\n  exit 1\nfi`
  },
  {
    id: "L-001",
    severity: "LOW",
    category: "OBS/Restream — Stream Key in Environment Variable",
    icon: "📡",
    color: "#636366",
    glow: "rgba(99,99,102,0.3)",
    location: "Job 11 — Trigger OBS Live Stream",
    vuln: `env:\n  STREAM_KEY: ${{ secrets.STREAM_KEY }}`,
    detail: "STREAM_KEY is passed as a full environment variable to bun run scripts/obs-trigger.ts. Any package in the dependency tree (including transitive deps) can read process.env.STREAM_KEY. Malicious or compromised npm/bun packages have exploited this pattern to steal credentials in CI environments.",
    impact: "Stream key theft via compromised dependency. Attacker can broadcast to your stream.",
    fix: [
      "Pass only the minimum required scope — if obs-trigger.ts only needs part of the key, split it",
      "Audit obs-trigger.ts and its dependencies for process.env access",
      "Consider using Bun's --env-file with restricted scope"
    ],
    code: `# ✅ Use Bun's secure env injection\nbun run --env-file=.env.stream scripts/obs-trigger.ts\n# .env.stream generated fresh each run, deleted after`
  },
  {
    id: "PROTO-001",
    severity: "INFO",
    category: "VLESS/Trojan Protocol Detection Risk",
    icon: "🌐",
    color: "#636366",
    glow: "rgba(99,99,102,0.25)",
    location: "Cloudflare Worker — Protocol Layer",
    vuln: `VLESS/Trojan over WebSocket on standard HTTPS port`,
    detail: "Deep Packet Inspection (DPI) systems can detect VLESS/Trojan tunnels via: (1) TLS fingerprint analysis (JA3/JA4 hash of ClientHello) — Cloudflare Workers use a known TLS fingerprint; (2) Traffic pattern analysis — VPN traffic has distinct packet size distributions and timing patterns; (3) WebSocket upgrade header inspection — DPI can flag WS upgrades to specific paths; (4) SNI-based blocking — your custom domain fasterwgkhserver.cloudflareaccess.com may be categorized as a proxy service.",
    impact: "Protocol detection and blocking by national firewalls, corporate proxies, or ISP-level DPI systems.",
    fix: [
      "Use path obfuscation: randomize WebSocket upgrade paths (not /vless — too obvious)",
      "Implement traffic padding to normalize packet sizes",
      "Consider XTLS-Vision or Reality protocol for better TLS camouflage",
      "Use multiple worker routes with different domains for redundancy",
      "Implement fake HTTP responses for non-VPN requests to blend with normal traffic"
    ],
    code: `// ✅ Obfuscated path routing (wrangler.toml)\n[routes]\npattern = \"example.com/api/v2/stream*\"\n// Randomize per-deployment:\nconst WS_PATH = process.env.WS_PATH ?? '/ws';\n// Never hardcode protocol-specific paths`
  }
];

const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const severityColors = {
  CRITICAL: "#ff2d55",
  HIGH: "#ff6b00",
  MEDIUM: "#ffcc00",
  LOW: "#636366",
  INFO: "#48484a"
};

export default function SecurityAudit() {
  const [active, setActive] = useState(null);
  const [filter, setFilter] = useState("ALL");

  const counts = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  const filtered = filter === "ALL"
    ? findings
    : findings.filter(f => f.severity === filter);

  const score = 100 - (counts.CRITICAL || 0) * 25 - (counts.HIGH || 0) * 12 - (counts.MEDIUM || 0) * 5 - (counts.LOW || 0) * 2;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      color: "#e5e5ea",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      padding: "0",
      overflowX: "hidden"
    }}>
      <style>{`
       @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Bebas+Neue&display=swap');
        
        .header-grid {
          background: linear-gradient(180deg, #0f0f1a 0%, #0a0a0f 100%);
          border-bottom: 1px solid #1c1c2e;
          padding: 48px 48px 36px;
          position: relative;
          overflow: hidden;
        }
        .header-grid::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background-image: 
            linear-gradient(rgba(255,45,85,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,45,85,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .scan-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255,45,85,0.12);
          border: 1px solid rgba(255,45,85,0.3);
          border-radius: 4px;
          padding: 4px 12px;
          font-size: 10px;
          letter-spacing: 3px;
          color: #ff2d55;
          text-transform: uppercase;
          margin-bottom: 20px;
        }
        .pulse {
          width: 6px; height: 6px;
          background: #ff2d55;
          border-radius: 50%;
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        .title-main {
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(42px, 6vw, 72px);
          letter-spacing: 4px;
          line-height: 1;
          color: #fff;
          margin-bottom: 8px;
        }
        .title-sub {
          font-size: 11px;
          color: #636366;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 36px;
        }
        .meta-row {
          display: flex;
          gap: 32px;
          flex-wrap: wrap;
        }
        .meta-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .meta-label {
          font-size: 9px;
          color: #48484a;
          letter-spacing: 2px;
          text-transform: uppercase;
        }
        .meta-value {
          font-size: 13px;
          color: #aeaeb2;
        }

        .score-ring {
          position: absolute;
          right: 48px;
          top: 40px;
          width: 120px;
          height: 120px;
        }
        .score-text {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .score-num {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 36px;
          color: #ff2d55;
          line-height: 1;
        }
        .score-label {
          font-size: 8px;
          color: #636366;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        .stats-bar {
          display: flex;
          gap: 1px;
          padding: 20px 48px;
          background: #0d0d18;
          border-bottom: 1px solid #1c1c2e;
          flex-wrap: wrap;
        }
        .stat-block {
          flex: 1;
          min-width: 100px;
          padding: 16px 20px;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 2px;
          border: 1px solid transparent;
          position: relative;
          overflow: hidden;
        }
        .stat-block:hover, .stat-block.active {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.08);
        }
        .stat-block.active::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
          background: var(--sev-color);
        }
        .stat-count {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 32px;
          line-height: 1;
          color: var(--sev-color);
        }
        .stat-label {
          font-size: 9px;
          color: #48484a;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-top: 4px;
        }

        .findings-grid {
          padding: 32px 48px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .finding-row {
          display: grid;
          grid-template-columns: 80px 90px 1fr 32px;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          background: #0d0d18;
          border: 1px solid #1c1c2e;
          border-radius: 2px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }
        .finding-row::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: var(--sev-color);
        }
        .finding-row:hover {
          background: #111120;
          border-color: rgba(255,255,255,0.1);
          transform: translateX(2px);
        }
        .finding-row.open {
          background: #111120;
          border-color: rgba(255,255,255,0.15);
        }
        .finding-id {
          font-size: 10px;
          color: #48484a;
          letter-spacing: 1px;
        }
        .sev-chip {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 2px;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          background: rgba(var(--sev-rgb), 0.15);
          color: var(--sev-color);
          border: 1px solid rgba(var(--sev-rgb), 0.3);
        }
        .finding-title {
          font-size: 13px;
          color: #e5e5ea;
          font-weight: 500;
        }
        .finding-loc {
          font-size: 11px;
          color: #48484a;
          margin-top: 2px;
        }
        .chevron {
          font-size: 12px;
          color: #48484a;
          transition: transform 0.2s;
        }
        .open .chevron { transform: rotate(180deg); }

        .detail-panel {
          background: #070710;
          border: 1px solid #1c1c2e;
          border-top: none;
          padding: 28px 28px 28px 108px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        .detail-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .detail-section.full { grid-column: 1 / -1; }
        .detail-heading {
          font-size: 9px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #48484a;
          margin-bottom: 4px;
          border-bottom: 1px solid #1c1c2e;
          padding-bottom: 6px;
        }
        .vuln-code {
          background: #0a0a0f;
          border: 1px solid #1c1c2e;
          border-left: 3px solid #ff2d55;
          padding: 12px 16px;
          font-size: 11px;
          color: #ff6b6b;
          border-radius: 2px;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .fix-code {
          background: #0a0f0a;
          border: 1px solid #1a2e1a;
          border-left: 3px solid #34c759;
          padding: 12px 16px;
          font-size: 10px;
          color: #5ac87c;
          border-radius: 2px;
          white-space: pre-wrap;
          word-break: break-word;
          overflow-x: auto;
        }
        .detail-text {
          font-size: 12px;
          color: #8e8e93;
          line-height: 1.7;
        }
        .fix-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .fix-item {
          display: flex;
          gap: 10px;
          font-size: 12px;
          color: #8e8e93;
          line-height: 1.6;
        }
        .fix-item::before {
          content: '→';
          color: #34c759;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .footer {
          border-top: 1px solid #1c1c2e;
          padding: 20px 48px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #0d0d18;
        }
        .footer-text {
          font-size: 10px;
          color: #3a3a3c;
          letter-spacing: 1px;
        }

        @media (max-width: 768px) {
          .header-grid, .findings-grid, .stats-bar, .footer { padding: 24px; }
          .score-ring { display: none; }
          .detail-panel { grid-template-columns: 1fr; padding: 20px; }
          .finding-row { grid-template-columns: 60px 1fr 24px; }
          .finding-row .finding-id { display: none; }
        }
      `}</style>

      {/* Header */}
      <div className="header-grid">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="scan-badge">
            <div className="pulse" />
            Security Audit Report · FWG-UltraEdge CI/CD
          </div>
          <div className="title-main">VULNERABILITY<br/>ASSESSMENT</div>
          <div className="title-sub">White Hat Security Review — deploy.yml Pipeline Analysis</div>
          <div className="meta-row">
            <div className="meta-item">
              <span className="meta-label">Target</span>
              <span className="meta-value">FWG-UltraEdge SLSA L3 Pipeline</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Scope</span>
              <span className="meta-value">11 CI/CD Jobs · GitHub Actions</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Date</span>
              <span className="meta-value">2026-05-19</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Total Findings</span>
              <span className="meta-value">{findings.length} Issues</span>
            </div>
          </div>
        </div>

        {/* Score ring */}
        <div className="score-ring" style={{ position: "absolute", right: 48, top: 40 }}>
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="50" fill="none" stroke="#1c1c2e" strokeWidth="8"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke="#ff2d55" strokeWidth="8"
              strokeDasharray={`${(score / 100) * 314} 314`}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              style={{ opacity: 0.8 }}
            />
          </svg>
          <div className="score-text">
            <div className="score-num">{Math.max(0, score)}</div>
            <div className="score-label">Security<br/>Score</div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="stats-bar">
        {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"].map(sev => {
          const count = sev === "ALL" ? findings.length : (counts[sev] || 0);
          const color = sev === "ALL" ? "#aeaeb2" : severityColors[sev];
          return (
            <div
              key={sev}
              className={`stat-block ${filter === sev ? "active" : ""}`}
              style={{ "--sev-color": color }}
              onClick={() => setFilter(sev)}
            >
              <div className="stat-count">{count}</div>
              <div className="stat-label">{sev === "ALL" ? "Total" : sev}</div>
            </div>
          );
        })}
      </div>

      {/* Findings */}
      <div className="findings-grid">
        {filtered.map((f, i) => {
          const isOpen = active === f.id;
          const color = severityColors[f.severity];
          const rgb = {
            CRITICAL: "255,45,85",
            HIGH: "255,107,0",
            MEDIUM: "255,204,0",
            LOW: "99,99,102",
            INFO: "72,72,74"
          }[f.severity];

          return (
            <div key={f.id}>
              <div
                className={`finding-row ${isOpen ? "open" : ""}`}
                style={{ "--sev-color": color, "--sev-rgb": rgb }}
                onClick={() => setActive(isOpen ? null : f.id)}
              >
                <span className="finding-id">{f.id}</span>
                <span className="sev-chip">{f.severity}</span>
                <div>
                  <div className="finding-title">{f.icon} {f.category}</div>
                  <div className="finding-loc">{f.location}</div>
                </div>
                <span className="chevron">▼</span>
              </div>

              {isOpen && (
                <div className="detail-panel">
                  <div className="detail-section full">
                    <div className="detail-heading">Vulnerable Code / Pattern</div>
                    <pre className="vuln-code">{f.vuln}</pre>
                  </div>

                  <div className="detail-section">
                    <div className="detail-heading">Technical Analysis</div>
                    <p className="detail-text">{f.detail}</p>
                  </div>

                  <div className="detail-section">
                    <div className="detail-heading">Impact</div>
                    <p className="detail-text" style={{ color: "#ff6b6b" }}>{f.impact}</p>
                    <div className="detail-heading" style={{ marginTop: 16 }}>Mitigation Steps</div>
                    <ul className="fix-list">
                      {f.fix.map((step, j) => (
                        <li key={j} className="fix-item">{step}</li>
                      ))}
                    </ul>
                  </div>

                  {f.code && (
                    <div className="detail-section full">
                      <div className="detail-heading">Remediation Code</div>
                      <pre className="fix-code">{f.code}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="footer">
        <span className="footer-text">WHITE HAT SECURITY REVIEW · FWG-ULTRAEDGE · SLSA L3 PIPELINE</span>
        <span className="footer-text">{counts.CRITICAL || 0} CRITICAL · {counts.HIGH || 0} HIGH · {counts.MEDIUM || 0} MEDIUM · {counts.LOW || 0} LOW · {counts.INFO || 0} INFO</span>
      </div>
    </div>
  )
