import { useState, useEffect, useRef } from "react";

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
    detail: 'github.ref_name interpolated directly into JSON string passed to curl. Branch named: main","evil":"injected  can break JSON and inject arbitrary Slack fields or exfiltrate runner env vars.',
    impact: "Slack message injection. Attacker exfiltrates secrets via crafted branch name.",
    fix: ["Use jq to build JSON safely: jq -n --arg branch \"$REF\" '{text: $branch}'","Never interpolate shell vars directly into JSON strings","Assign github.ref_name to env var first, then pass to jq"],
    code: '# SAFE\nREF="${{ steps.ref-sanitize.outputs.safe_ref }}"\npayload=$(jq -n --arg b "$REF" --arg s "${{ github.sha }}" \\\n  \'{text: ("Branch: " + $b + " SHA: " + $s)}\')\ncurl -s -X POST "${WEBHOOK}" -H "Content-Type: application/json" -d "$payload"',
  },
  {
    id: "C-002", severity: "CRITICAL",
    category: "SLSA Generator Tag Not Pinned to SHA (M4 Incomplete)",
    location: "Job 7 — slsa-provenance",
    vuln: "uses: slsa-framework/slsa-github-generator/...@v2.0.0",
    detail: "Pipeline comment says 'replace @v2.0.0 with exact commit SHA' but actual YAML still uses mutable tag. A force-pushed tag can replace the generator with malicious code that signs attacker artifacts.",
    impact: "Supply chain compromise. Malicious artifact receives valid SLSA L3 provenance. Entire trust chain collapses.",
    fix: ["Run: git ls-remote https://github.com/slsa-framework/slsa-github-generator refs/tags/v2.0.0","Replace @v2.0.0 with the exact 40-char commit SHA","Pin ALL reusable workflow calls to commit SHAs, never mutable tags"],
    code: "# CORRECT\nuses: slsa-framework/slsa-github-generator\\\n  /.github/workflows/generator_generic_slsa3.yml\\\n  @3ea0616b851b8bcd4b...  # verify with git ls-remote",
  },
  {
    id: "C-003", severity: "CRITICAL",
    category: "OSV Scanner Checks Wrong Severity Field",
    location: "Job 5 — Run OSV Scanner",
    vuln: ".database_specific.severity // \"\" | ascii_upcase",
    detail: "OSV JSON stores severity in multiple locations: .severity[].score (CVSS v3) and .database_specific.severity. Pipeline ONLY checks database_specific — CVEs using standard CVSS path silently bypass the gate.",
    impact: "Critical/High CVEs bypass security gate. Pipeline deploys to production with known vulnerabilities.",
    fix: ["Check ALL severity paths in OSV JSON schema","Parse .severity[].score for CVSS >= 9.0 (CRITICAL) and >= 7.0 (HIGH)","Use osv-scanner built-in --fail-on-vuln flag as primary gate"],
    code: "# COMPREHENSIVE check\nCRIT=$(jq '[.results[]?.packages[]?.vulnerabilities[]?\n   | (.severity[]?.score // 0 >= 9.0),\n     ((.database_specific.severity // \"\") | ascii_upcase == \"CRITICAL\")\n   | select(.)] | length' osv-results.json)",
  },
  {
    id: "H-001", severity: "HIGH",
    category: "TOCTOU Race — Artifact Integrity via Job Outputs",
    location: "Job 8, 9, 10 — Verify artifact integrity",
    vuln: "EXPECTED_B64 from job output -> base64 decode -> compare",
    detail: "SLSA subject hash travels: runner disk -> Actions API -> new runner disk. If Actions API is compromised, attacker substitutes expected hash to match tampered artifact. Both values come from same potentially-compromised pipeline.",
    impact: "Tampered artifact passes integrity check. Malicious code deploys to production.",
    fix: ["Use slsa-verifier binary to verify signed provenance attestation independently","Compare artifact hash against SLSA attestation, not just job outputs","Add second independent HMAC verification using separate secret"],
    code: "# Verify against signed SLSA attestation\nslsa-verifier verify-artifact dist.tar.gz \\\n  --provenance-path provenance.intoto.jsonl \\\n  --source-uri github.com/your-org/your-repo \\\n  --source-tag ${{ github.ref_name }}",
  },
  {
    id: "H-002", severity: "HIGH",
    category: "Rollback Target Command Injection",
    location: "Job 10 — Capture pre-deploy state",
    vuln: 'PREV_VERSION=$(npx wrangler ... | bun -e "...")',
    detail: "Previous deployment ID from wrangler CLI used directly in: wrangler rollback \"${PREV}\". Cloudflare API response containing shell metacharacters enables command injection.",
    impact: "Rollback to attacker-controlled version, or command injection during auto-rollback.",
    fix: ["Sanitize PREV_VERSION — strip all non [a-zA-Z0-9-_] chars","Validate format matches Cloudflare UUID pattern: ^[0-9a-f-]{36}$","Quote the variable properly"],
    code: "# Sanitize deployment ID\nif [[ ! \"${PREV_RAW}\" =~ ^[0-9a-f-]{36}$ ]]; then\n  PREV=\"unknown\"\nelse\n  PREV=\"${PREV_RAW}\"\nfi",
  },
  {
    id: "H-003", severity: "HIGH",
    category: "HMAC Replay Attack — No Timestamp Window Validation",
    location: "Job 9, 10 — Health check HMAC",
    vuln: "X-Health-Timestamp + X-Health-Signature (no expiry window)",
    detail: "HMAC signs Unix timestamp and sends in request. If Worker endpoint does NOT validate timestamp is within acceptable window, attacker who observes the request can replay the exact same signed request indefinitely.",
    impact: "Health check endpoint bypassed via replay. Attacker fakes healthy responses.",
    fix: ["Worker must validate: Math.abs(Date.now()/1000 - timestamp) < 30","Add nonce/jti to HMAC payload to prevent exact replays","Log and alert on timestamps outside valid window"],
    code: "// Worker-side replay protection\nconst ts = parseInt(req.headers.get('X-Health-Timestamp') ?? '0');\nconst now = Math.floor(Date.now() / 1000);\nif (Math.abs(now - ts) > 30) {\n  return new Response('Replay detected', { status: 401 });\n}",
  },
  {
    id: "M-001", severity: "MEDIUM",
    category: "Cache Poisoning — node_modules Cached Unsafely",
    location: "All jobs — Cache Bun modules",
    vuln: "path: ~/.bun/install/cache\n      node_modules",
    detail: "Cache stores both ~/.bun/install/cache AND node_modules. Compromised dependency between cache creation and restoration serves stale malicious code. bun install --frozen-lockfile does NOT re-validate from cache.",
    impact: "Persistent cache poisoning. Once-poisoned cache serves malicious node_modules to all subsequent runs.",
    fix: ["Cache ONLY ~/.bun/install/cache, not node_modules","Always run bun install --frozen-lockfile even on cache hit","Rotate cache key immediately on any security incident"],
    code: "# Cache only Bun download cache\n- uses: actions/cache@...\n  with:\n    path: ~/.bun/install/cache\n    key: bun-${{ runner.os }}-${{ env.BUN_VERSION }}-${{ hashFiles('bun.lockb') }}",
  },
  {
    id: "M-002", severity: "MEDIUM",
    category: "Wrangler Missing --minify + Source Map Leakage",
    location: "Job 6, 8 — Build Worker artifact",
    vuln: "npx wrangler deploy --dry-run --outdir dist  # no --minify",
    detail: "No --minify flag. Wrangler emits unminified JS exposing internal variable names, comments with infrastructure details. Source maps may expose full TypeScript source to anyone with the Worker URL.",
    impact: "IP exposure, internal infrastructure reconnaissance via source maps.",
    fix: ["Add --minify to all wrangler deploy commands","Set upload_source_maps = false in wrangler.toml for production","Strip all console.log statements in production builds"],
    code: "# Minified production build\nnpx wrangler@${{ env.WRANGLER_VERSION }} deploy \\\n  --env production --name ultraedge-prod --minify",
  },
  {
    id: "M-003", severity: "MEDIUM",
    category: "ref_name Sanitization — Path Traversal via Forward Slash",
    location: "Job 6 — Sanitize and validate ref_name",
    vuln: 'SANITIZED="${RAW_REF//[^a-zA-Z0-9._\\/-]/}"',
    detail: "Sanitization allows forward slashes for feature branches. A ref like ../../etc/passwd matches the permissive regex [a-zA-Z0-9_/-]{1,100}. Path traversal can affect artifact storage paths.",
    impact: "Potential path traversal in artifact naming. Defense-in-depth failure.",
    fix: ["Explicitly reject any ref containing '..' sequences","Strict allowlist: ^(v[0-9]+\\.[0-9]+\\.[0-9]+|main|develop|feature\\/[a-z0-9-]+)$","Remove ALL slashes before filename construction"],
    code: "# Path traversal guard\nif [[ \"${SANITIZED}\" == *\"..\"* ]]; then\n  echo \"Path traversal detected\"; exit 1\nfi",
  },
  {
    id: "L-001", severity: "LOW",
    category: "Stream Key Exposed to Full Dependency Tree",
    location: "Job 11 — Trigger OBS Live Stream",
    vuln: "env:\n  STREAM_KEY: ${{ secrets.STREAM_KEY }}",
    detail: "STREAM_KEY passed as full environment variable to bun run scripts/obs-trigger.ts. Any package in the dependency tree including transitive deps can read process.env.STREAM_KEY.",
    impact: "Stream key theft via compromised dependency.",
    fix: ["Audit obs-trigger.ts and dependencies for process.env access","Use Bun --env-file with restricted scope per script","Generate short-lived token per run instead of long-lived key"],
    code: "# Scope env vars to specific script only\nbun run --env-file=.env.stream scripts/obs-trigger.ts\ntrap 'rm -f .env.stream' EXIT",
  },
  {
    id: "INFO-001", severity: "INFO",
    category: "VLESS/Trojan Protocol DPI Detection Risk",
    location: "Cloudflare Worker — Protocol Layer",
    vuln: "VLESS/Trojan over WebSocket on HTTPS port 443",
    detail: "DPI systems detect VLESS/Trojan via TLS fingerprint (JA3/JA4), traffic pattern analysis, WebSocket upgrade header inspection (/vless path is a known signature), and SNI-based blocking.",
    impact: "Protocol detection and blocking by national firewalls, corporate proxies, or ISP-level DPI.",
    fix: ["Obfuscate WebSocket path — use random UUID paths, never /vless","Implement traffic padding to normalize packet sizes","Consider XTLS-Vision or Reality protocol for better TLS camouflage","Use multiple worker routes with different domains for redundancy"],
    code: "// Obfuscated path routing\nconst WS_PATH = env.WS_PATH ?? \"/api/v2/data\";\n// Set WS_PATH as Cloudflare Worker secret\n// Never hardcode /vless, /trojan, /ws in source",
  },
];

// ── A) Animated Score Ring ──
function ScoreRing({ score }) {
  const circleRef = useRef(null);
  const circumference = 2 * Math.PI * 50;
  const scoreColor = score >= 70 ? "#34c759" : score >= 40 ? "#ffcc00" : "#ff2d55";

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
    <div style={{ position: "absolute", right: 48, top: 40, width: 120, height: 120 }}>
      <svg viewBox="0 0 120 120" width="120" height="120">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#1c1c2e" strokeWidth="8" />
        <circle ref={circleRef} cx="60" cy="60" r="50" fill="none"
          stroke={scoreColor} strokeWidth="8"
          strokeDasharray={`0 ${circumference}`}
          strokeLinecap="round" transform="rotate(-90 60 60)"
          style={{ opacity: 0.9 }}
        />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2 }}>
        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:36, color:scoreColor, lineHeight:1 }}>{score}</span>
        <span style={{ fontSize:8, color:"#636366", letterSpacing:2, textTransform:"uppercase", textAlign:"center" }}>Security<br/>Score</span>
      </div>
    </div>
  );
}

// ── B) GitHub API ──
async function fetchGitHubAlerts() {
  const token = import.meta.env.VITE_GITHUB_TOKEN;
  const repo  = import.meta.env.VITE_GITHUB_REPO || "FWG-Network/FWG-UltraEdge";
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/code-scanning/alerts?per_page=50&state=open`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return data.map((a) => {
      const s = (a.rule?.security_severity_level || "medium").toUpperCase();
      const sev = ["CRITICAL","HIGH","MEDIUM","LOW","INFO"].includes(s) ? s : "MEDIUM";
      return {
        id: `GH-${a.number}`, severity: sev,
        category: a.rule?.description || a.rule?.id || "Unknown Rule",
        location: a.most_recent_instance?.location?.path || "Unknown file",
        vuln: `Rule: ${a.rule?.id}\nTool: ${a.tool?.name}`,
        detail: a.rule?.full_description || a.rule?.description || "No description.",
        impact: `GitHub Code Scanning — ${a.rule?.tags?.join(", ") || "security"}`,
        fix: ["Review in GitHub Security tab", `See: ${a.html_url}`, "Apply fix and re-run scan"],
        code: `# Full details:\n# ${a.html_url}`,
      };
    });
  } catch { return null; }
}

// ── Main Component ──
export default function SecurityAudit() {
  const [activeId, setActiveId]   = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [findings, setFindings]   = useState(STATIC_FINDINGS);
  const [apiStatus, setApiStatus] = useState("idle");

  useEffect(() => {
    const token = import.meta.env.VITE_GITHUB_TOKEN;
    if (!token) { setApiStatus("static"); return; }
    setApiStatus("loading");
    fetchGitHubAlerts().then((gh) => {
      if (gh && gh.length > 0) { setFindings(gh); setApiStatus("live"); }
      else setApiStatus("static");
    });
  }, []);

  const counts = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity]||0)+1; return acc; }, {});
  const score  = Math.max(0, 100-(counts.CRITICAL||0)*25-(counts.HIGH||0)*12-(counts.MEDIUM||0)*5-(counts.LOW||0)*2);
  const visible = filter === "ALL" ? findings : findings.filter(f => f.severity === filter);

  const statusDot = { loading: ["#ffcc00","Connecting GitHub..."], live: ["#34c759","GitHub Live"], static: ["#636366","Static Data"] }[apiStatus] || ["#636366",""];

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0f", color:"#e5e5ea", fontFamily:"'IBM Plex Mono','Courier New',monospace", overflowX:"hidden" }}>
      <style>{CSS}</style>

      {/* HEADER */}
      <div className="hdr">
        <div style={{ position:"relative", zIndex:1 }}>
          <div className="badge">
            <span className="pulse"/>
            Security Audit &middot; FWG-UltraEdge
            {apiStatus !== "idle" && <span style={{ color: statusDot[0], marginLeft:8 }}>&#9679; {statusDot[1]}</span>}
          </div>
          <h1 className="title">VULNERABILITY<br/>ASSESSMENT</h1>
          <p className="subtitle">White Hat Security Review &mdash; deploy.yml Pipeline Analysis</p>
          <div className="meta-row">
            {[["Target","FWG-UltraEdge SLSA L3"],["Scope","11 CI/CD Jobs"],["Date",new Date().toISOString().slice(0,10)],["Findings",`${findings.length} Issues`]].map(([l,v])=>(
              <div key={l} className="meta-item">
                <span className="meta-lbl">{l}</span>
                <span className="meta-val">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <ScoreRing score={score}/>
      </div>

      {/* FILTER BAR */}
      <div className="filter-bar">
        {["ALL","CRITICAL","HIGH","MEDIUM","LOW","INFO"].map(sev => {
          const cnt = sev==="ALL" ? findings.length : (counts[sev]||0);
          const col = sev==="ALL" ? "#aeaeb2" : SEV_COLORS[sev]?.color;
          return (
            <button key={sev} className={`filt-btn${filter===sev?" active":""}`} style={{"--sc":col}} onClick={()=>setFilter(sev)}>
              <span className="filt-cnt">{cnt}</span>
              <span className="filt-lbl">{sev==="ALL"?"TOTAL":sev}</span>
            </button>
          );
        })}
      </div>

      {/* FINDINGS */}
      <div className="findings">
        {visible.length===0 && <div style={{padding:"48px",textAlign:"center",color:"#48484a",fontSize:13}}>No findings for this severity.</div>}
        {visible.map(f => {
          const open = activeId===f.id;
          const {color,rgb} = SEV_COLORS[f.severity]||SEV_COLORS.INFO;
          return (
            <div key={f.id}>
              <div className={`row${open?" open":""}`} style={{"--sc":color,"--sr":rgb}} onClick={()=>setActiveId(open?null:f.id)}>
                <span className="row-id">{f.id}</span>
                <span className="chip">{f.severity}</span>
                <div>
                  <div className="row-title">{f.category}</div>
                  <div className="row-loc">{f.location}</div>
                </div>
                <span className={`chev${open?" rot":""}`}>&#9660;</span>
              </div>
              {open && (
                <div className="detail">
                  <div className="ds full"><div className="dh">Vulnerable Pattern</div><pre className="vpre">{f.vuln}</pre></div>
                  <div className="ds"><div className="dh">Technical Analysis</div><p className="dtxt">{f.detail}</p></div>
                  <div className="ds">
                    <div className="dh">Impact</div><p className="dtxt" style={{color:"#ff6b6b"}}>{f.impact}</p>
                    <div className="dh" style={{marginTop:16}}>Mitigation Steps</div>
                    <ul className="fix-list">{f.fix.map((s,i)=><li key={i} className="fix-item">{s}</li>)}</ul>
                  </div>
                  {f.code && <div className="ds full"><div className="dh">Remediation Code</div><pre className="cpre">{f.code}</pre></div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER */}
      <div className="footer">
        <span className="ftxt">WHITE HAT REVIEW &middot; FWG-ULTRAEDGE &middot; SLSA L3</span>
        <span className="ftxt">{(counts.CRITICAL||0)} CRIT &nbsp;{(counts.HIGH||0)} HIGH &nbsp;{(counts.MEDIUM||0)} MED &nbsp;{(counts.LOW||0)} LOW &nbsp;{(counts.INFO||0)} INFO</span>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Bebas+Neue&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#0a0a0f}::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
.hdr{background:linear-gradient(180deg,#0f0f1a 0%,#0a0a0f 100%);border-bottom:1px solid #1c1c2e;padding:48px 48px 36px;position:relative;overflow:hidden;}
.hdr::before{content:'';position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(rgba(255,45,85,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,45,85,.03) 1px,transparent 1px);background-size:40px 40px;}
.badge{display:inline-flex;align-items:center;gap:8px;background:rgba(255,45,85,.12);border:1px solid rgba(255,45,85,.3);border-radius:4px;padding:4px 12px;font-size:10px;letter-spacing:2px;color:#ff2d55;text-transform:uppercase;margin-bottom:20px;flex-wrap:wrap;}
.pulse{width:6px;height:6px;background:#ff2d55;border-radius:50%;flex-shrink:0;animation:pulse 1.5s ease-in-out infinite;}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
.title{font-family:'Bebas Neue',sans-serif;font-size:clamp(40px,6vw,72px);letter-spacing:4px;line-height:1;color:#fff;margin-bottom:8px;}
.subtitle{font-size:11px;color:#636366;letter-spacing:2px;text-transform:uppercase;margin-bottom:36px;}
.meta-row{display:flex;gap:32px;flex-wrap:wrap;}
.meta-item{display:flex;flex-direction:column;gap:4px;}
.meta-lbl{font-size:9px;color:#48484a;letter-spacing:2px;text-transform:uppercase;}
.meta-val{font-size:13px;color:#aeaeb2;}
.filter-bar{display:flex;gap:1px;flex-wrap:wrap;padding:20px 48px;background:#0d0d18;border-bottom:1px solid #1c1c2e;}
.filt-btn{flex:1;min-width:90px;padding:14px 16px;background:transparent;border:1px solid transparent;color:#e5e5ea;font-family:'IBM Plex Mono','Courier New',monospace;cursor:pointer;transition:all .2s;border-radius:2px;position:relative;overflow:hidden;}
.filt-btn:hover{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08);}
.filt-btn.active{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08);}
.filt-btn.active::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--sc);}
.filt-cnt{display:block;font-family:'Bebas Neue',sans-serif;font-size:28px;line-height:1;color:var(--sc);}
.filt-lbl{display:block;font-size:9px;color:#48484a;letter-spacing:2px;text-transform:uppercase;margin-top:4px;}
.findings{padding:32px 48px;display:flex;flex-direction:column;gap:2px;}
.row{display:grid;grid-template-columns:80px 90px 1fr 28px;align-items:center;gap:16px;padding:16px 20px;background:#0d0d18;border:1px solid #1c1c2e;border-radius:2px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;user-select:none;}
.row::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--sc);}
.row:hover{background:#111120;border-color:rgba(255,255,255,.1);transform:translateX(2px);}
.row.open{background:#111120;border-color:rgba(255,255,255,.15);border-radius:2px 2px 0 0;border-bottom-color:transparent;}
.row-id{font-size:10px;color:#48484a;letter-spacing:1px;}
.chip{display:inline-flex;align-items:center;padding:3px 8px;border-radius:2px;font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;background:rgba(var(--sr),.15);color:var(--sc);border:1px solid rgba(var(--sr),.3);}
.row-title{font-size:13px;color:#e5e5ea;font-weight:500;}
.row-loc{font-size:11px;color:#48484a;margin-top:2px;}
.chev{font-size:11px;color:#48484a;transition:transform .2s;display:flex;align-items:center;justify-content:center;}
.chev.rot{transform:rotate(180deg);}
.detail{background:#070710;border:1px solid rgba(255,255,255,.15);border-top:none;border-radius:0 0 2px 2px;padding:24px 24px 24px 100px;display:grid;grid-template-columns:1fr 1fr;gap:20px;}
.ds{display:flex;flex-direction:column;gap:8px;}
.full{grid-column:1/-1;}
.dh{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#48484a;padding-bottom:6px;border-bottom:1px solid #1c1c2e;margin-bottom:4px;}
.vpre{background:#0a0a0f;border:1px solid #1c1c2e;border-left:3px solid #ff2d55;padding:12px 14px;font-size:11px;color:#ff6b6b;border-radius:2px;white-space:pre-wrap;word-break:break-all;font-family:'IBM Plex Mono','Courier New',monospace;}
.cpre{background:#0a0f0a;border:1px solid #1a2e1a;border-left:3px solid #34c759;padding:12px 14px;font-size:10px;color:#5ac87c;border-radius:2px;white-space:pre-wrap;word-break:break-word;overflow-x:auto;font-family:'IBM Plex Mono','Courier New',monospace;}
.dtxt{font-size:12px;color:#8e8e93;line-height:1.7;}
.fix-list{list-style:none;display:flex;flex-direction:column;gap:8px;}
.fix-item{display:flex;gap:10px;font-size:12px;color:#8e8e93;line-height:1.6;}
.fix-item::before{content:"->";color:#34c759;flex-shrink:0;}
.footer{border-top:1px solid #1c1c2e;padding:20px 48px;display:flex;justify-content:space-between;align-items:center;background:#0d0d18;flex-wrap:wrap;gap:8px;}
.ftxt{font-size:10px;color:#3a3a3c;letter-spacing:1px;}
@media(max-width:768px){
  .hdr,.findings,.filter-bar,.footer{padding:20px;}
  .detail{grid-template-columns:1fr;padding:16px;}
  .row{grid-template-columns:60px 1fr 24px;}
  .row-id{display:none;}
}
`;
