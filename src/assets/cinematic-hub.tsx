import { useState, useRef, useEffect } from "react";

const CATALOG = [
  { id: "v1", title: "Neon Horizon", category: "Cinematic", thumb: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg", embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0", duration: "3:33", quality: "4K" },
  { id: "v2", title: "Digital Dreams", category: "Featured", thumb: "https://img.youtube.com/vi/ysz5S6PUM-U/mqdefault.jpg", embedUrl: "https://www.youtube.com/embed/ysz5S6PUM-U?autoplay=1&rel=0", duration: "4:12", quality: "HD" },
  { id: "v3", title: "Edge of Tomorrow", category: "Trending", thumb: "https://img.youtube.com/vi/9bZkp7q19f0/mqdefault.jpg", embedUrl: "https://www.youtube.com/embed/9bZkp7q19f0?autoplay=1&rel=0", duration: "5:01", quality: "4K" },
  { id: "v4", title: "Ultra Signal", category: "New", thumb: "https://img.youtube.com/vi/kJQP7kiw5Fk/mqdefault.jpg", embedUrl: "https://www.youtube.com/embed/kJQP7kiw5Fk?autoplay=1&rel=0", duration: "4:44", quality: "HD" },
];

const TRACKS = [
  { id: "t1", title: "Midnight Pulse", artist: "FWG Soundscape", duration: 217, color: "#e50914" },
  { id: "t2", title: "Ultra Drift", artist: "Edge Series", duration: 183, color: "#ff6b35" },
  { id: "t3", title: "Neon Rain", artist: "FWG Ambient", duration: 264, color: "#a855f7" },
  { id: "t4", title: "Deep Signal", artist: "FWG Bass Lab", duration: 198, color: "#06b6d4" },
];

function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function AudioVisualizer({ isPlaying, color }) {
  const bars = Array.from({ length: 28 });
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32 }}>
      {bars.map((_, i) => (
        <div
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            background: color,
            height: isPlaying ? `${8 + Math.random() * 24}px` : 4,
            animation: isPlaying ? `pulse ${0.4 + (i % 5) * 0.1}s ease-in-out infinite alternate` : "none",
            opacity: 0.85,
            transition: "height 0.15s ease",
          }}
        />
      ))}
    </div>
  );
}

export default function FWGCinematicHub() {
  const [activeTab, setActiveTab] = useState("home");
  const [modal, setModal] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState({});
  const [glowIdx, setGlowIdx] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setGlowIdx(g => (g + 1) % CATALOG.length), 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (playing !== null) {
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setProgress(p => {
          if (p >= TRACKS[playing].duration) { clearInterval(timerRef.current); return 0; }
          return p + 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [playing]);

  const playTrack = (i) => { setPlaying(i); setProgress(0); };
  const stopTrack = () => { setPlaying(null); setProgress(0); };
  const nextTrack = () => playTrack((playing + 1) % TRACKS.length);
  const prevTrack = () => playTrack((playing - 1 + TRACKS.length) % TRACKS.length);

  const track = playing !== null ? TRACKS[playing] : null;

  return (
    <div style={{
      background: "#080810",
      minHeight: "100vh",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      color: "#f0f0f0",
      userSelect: "none",
      overflowX: "hidden",
      position: "relative",
    }}>
      <style>{`
        @keyframes pulse { from { opacity: 0.5; } to { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @keyframes glow { 0%,100% { box-shadow: 0 0 30px rgba(229,9,20,0.3); } 50% { box-shadow: 0 0 60px rgba(229,9,20,0.7); } }
        @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .card-hover:hover { transform: scale(1.04) translateY(-4px); box-shadow: 0 24px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(229,9,20,0.4) !important; }
        .tab-btn:hover { color: #fff !important; }
        .track-row:hover { background: rgba(255,255,255,0.06) !important; }
        .ctrl-btn:hover { background: rgba(255,255,255,0.15) !important; transform: scale(1.1); }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      `}</style>

      {/* Ambient background orbs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -100, left: -100, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(229,9,20,0.12) 0%, transparent 70%)", animation: "float 8s ease-in-out infinite" }} />
        <div style={{ position: "absolute", bottom: 100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)", animation: "float 10s ease-in-out infinite reverse" }} />
        <div style={{ position: "absolute", top: "40%", left: "40%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)" }} />
      </div>

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 28px",
        background: "linear-gradient(180deg, rgba(8,8,16,0.98) 0%, rgba(8,8,16,0.0) 100%)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #e50914, #ff6b35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, animation: "glow 3s ease-in-out infinite",
          }}>🌍</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 2, color: "#fff", textTransform: "uppercase" }}>FWG</div>
            <div style={{ fontSize: 9, color: "#e50914", letterSpacing: 3, textTransform: "uppercase", marginTop: -2 }}>UltraEdge</div>
          </div>
        </div>

        <nav style={{ display: "flex", gap: 4 }}>
          {[["home","🎬","Cinema"],["music","🎧","Music"],["live","📡","Live"]].map(([tab, icon, label]) => (
            <button key={tab} className="tab-btn" onClick={() => setActiveTab(tab)} style={{
              background: activeTab === tab ? "rgba(229,9,20,0.15)" : "transparent",
              border: activeTab === tab ? "1px solid rgba(229,9,20,0.4)" : "1px solid transparent",
              color: activeTab === tab ? "#fff" : "#888",
              padding: "7px 14px", borderRadius: 8, cursor: "pointer",
              fontSize: 12, fontFamily: "inherit", fontWeight: 600,
              transition: "all 0.2s", display: "flex", alignItems: "center", gap: 5,
            }}>
              <span>{icon}</span><span style={{ display: window.innerWidth > 500 ? "inline" : "none" }}>{label}</span>
            </button>
          ))}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {track && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(229,9,20,0.1)", borderRadius: 20,
              padding: "5px 12px", border: "1px solid rgba(229,9,20,0.2)",
              animation: "fadeIn 0.3s ease",
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: track.color, animation: "pulse 1s infinite" }} />
              <span style={{ fontSize: 11, color: "#ccc", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.title}</span>
            </div>
          )}
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #e50914, #ff6b35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👤</div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ position: "relative", zIndex: 1, paddingBottom: track ? 120 : 40 }}>

        {/* ── HOME TAB ── */}
        {activeTab === "home" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            {/* Hero */}
            <div style={{
              padding: "40px 28px 32px",
              background: "linear-gradient(135deg, rgba(229,9,20,0.1) 0%, rgba(168,85,247,0.05) 50%, transparent 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              <div style={{ fontSize: 11, letterSpacing: 4, color: "#e50914", textTransform: "uppercase", marginBottom: 10 }}>FWG UltraEdge Cinema</div>
              <h1 style={{ fontSize: "clamp(28px, 6vw, 48px)", fontWeight: 900, lineHeight: 1.1, marginBottom: 12, letterSpacing: -1 }}>
                Cinematic Experience<br />
                <span style={{ background: "linear-gradient(90deg, #e50914, #ff6b35, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Beyond Limits</span>
              </h1>
              <p style={{ fontSize: 14, color: "#888", maxWidth: 480, lineHeight: 1.6 }}>
                Netflix-standard streaming platform powered by Cloudflare Workers. 4K · Spatial Audio · Zero Latency.
              </p>
            </div>

            {/* Video Grid */}
            <div style={{ padding: "28px 28px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase" }}>🔥 Trending Now</div>
                <div style={{ fontSize: 11, color: "#e50914", cursor: "pointer" }}>View All →</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
                {CATALOG.map((v, i) => (
                  <div key={v.id} className="card-hover" onClick={() => setModal(v)} style={{
                    background: "#111118",
                    borderRadius: 12, overflow: "hidden",
                    cursor: "pointer", position: "relative",
                    transition: "all 0.3s cubic-bezier(.4,0,.2,1)",
                    border: glowIdx === i ? "1px solid rgba(229,9,20,0.5)" : "1px solid rgba(255,255,255,0.05)",
                    boxShadow: glowIdx === i ? "0 0 30px rgba(229,9,20,0.2)" : "none",
                    animation: "fadeIn 0.4s ease",
                    animationDelay: `${i * 0.08}s`,
                    animationFillMode: "both",
                  }}>
                    <div style={{ position: "relative", aspectRatio: "16/9", background: "#1a1a24", overflow: "hidden" }}>
                      <img src={v.thumb} alt={v.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        onError={e => e.target.style.display = "none"} />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)" }} />
                      <div style={{ position: "absolute", top: 8, right: 8, background: "#e50914", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, letterSpacing: 1 }}>{v.quality}</div>
                      <div style={{ position: "absolute", bottom: 6, right: 8, fontSize: 10, color: "rgba(255,255,255,0.8)", background: "rgba(0,0,0,0.6)", padding: "1px 5px", borderRadius: 3 }}>{v.duration}</div>
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "opacity 0.2s" }}
                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                        onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(229,9,20,0.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>▶</div>
                      </div>
                    </div>
                    <div style={{ padding: "10px 12px 12px" }}>
                      <div style={{ fontSize: 9, letterSpacing: 2, color: "#e50914", textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>{v.category}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                        <button onClick={e => { e.stopPropagation(); setLiked(l => ({ ...l, [v.id]: !l[v.id] })); }} style={{ background: "none", border: "none", color: liked[v.id] ? "#e50914" : "#555", cursor: "pointer", fontSize: 14, padding: 0 }}>
                          {liked[v.id] ? "❤️" : "🤍"}
                        </button>
                        <div style={{ fontSize: 10, color: "#555" }}>+ Watchlist</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Music Preview */}
            <div style={{ padding: "28px 28px 0", marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 16 }}>🎧 Now Playing</div>
              <div style={{
                background: "linear-gradient(135deg, #111118, #1a1a24)",
                borderRadius: 16, padding: 20,
                border: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: 16,
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 12,
                  background: track ? `linear-gradient(135deg, ${track.color}, #111)` : "linear-gradient(135deg, #333, #111)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 24, flexShrink: 0,
                  animation: playing !== null ? "spin 4s linear infinite" : "none",
                }}>🎵</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{track ? track.title : "Select a track"}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{track ? track.artist : "FWG Music Library"}</div>
                  {track && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", background: track.color, width: `${(progress / track.duration) * 100}%`, transition: "width 1s linear", borderRadius: 2 }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                        <span style={{ fontSize: 10, color: "#666" }}>{fmtTime(progress)}</span>
                        <span style={{ fontSize: 10, color: "#666" }}>{fmtTime(track.duration)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <button onClick={() => setActiveTab("music")} style={{ background: "rgba(229,9,20,0.15)", border: "1px solid rgba(229,9,20,0.3)", color: "#e50914", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Open Player →</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MUSIC TAB ── */}
        {activeTab === "music" && (
          <div style={{ animation: "fadeIn 0.4s ease", padding: "32px 28px" }}>
            <div style={{ fontSize: 11, letterSpacing: 4, color: "#e50914", textTransform: "uppercase", marginBottom: 8 }}>FWG Audio Lab</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 4, letterSpacing: -0.5 }}>🎧 Earphone Experience</h2>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 28 }}>Optimized for spatial audio · Sweet sounds ពេលពាក់កាស</p>

            {/* Now Playing Card */}
            {track && (
              <div style={{
                background: `linear-gradient(135deg, ${track.color}22, #111118)`,
                borderRadius: 20, padding: 24, marginBottom: 24,
                border: `1px solid ${track.color}44`,
                animation: "glow 3s ease-in-out infinite",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: 16,
                    background: `linear-gradient(135deg, ${track.color}, #111)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 36, flexShrink: 0,
                    animation: playing !== null ? "spin 4s linear infinite" : "none",
                    boxShadow: `0 0 30px ${track.color}66`,
                  }}>🎵</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>{track.title}</div>
                    <div style={{ fontSize: 13, color: "#aaa", marginBottom: 10 }}>{track.artist}</div>
                    <AudioVisualizer isPlaying={playing !== null} color={track.color} />
                  </div>
                </div>

                {/* Progress */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", cursor: "pointer" }}>
                    <div style={{ height: "100%", background: `linear-gradient(90deg, ${track.color}, #ff6b35)`, width: `${(progress / track.duration) * 100}%`, transition: "width 1s linear", borderRadius: 2 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: "#888" }}>{fmtTime(progress)}</span>
                    <span style={{ fontSize: 11, color: "#888" }}>{fmtTime(track.duration)}</span>
                  </div>
                </div>

                {/* Controls */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  {[["⏮", prevTrack], ["⏪", () => setProgress(p => Math.max(0, p - 10))], [playing !== null ? "⏸" : "▶", () => playing !== null ? stopTrack() : playTrack(0)], ["⏩", () => setProgress(p => Math.min(track.duration, p + 10))], ["⏭", nextTrack]].map(([icon, fn], i) => (
                    <button key={i} className="ctrl-btn" onClick={fn} style={{
                      width: i === 2 ? 52 : 40, height: i === 2 ? 52 : 40,
                      borderRadius: "50%",
                      background: i === 2 ? track.color : "rgba(255,255,255,0.08)",
                      border: "none", color: "#fff", fontSize: i === 2 ? 20 : 16,
                      cursor: "pointer", transition: "all 0.2s",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: i === 2 ? `0 0 20px ${track.color}88` : "none",
                    }}>{icon}</button>
                  ))}
                </div>

                {/* Volume */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
                  <button onClick={() => setMuted(m => !m)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 16 }}>{muted ? "🔇" : "🔊"}</button>
                  <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, cursor: "pointer", position: "relative" }}
                    onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setVolume(Math.round(((e.clientX - r.left) / r.width) * 100)); }}>
                    <div style={{ height: "100%", width: `${muted ? 0 : volume}%`, background: track.color, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#888", width: 28 }}>{muted ? 0 : volume}%</span>
                </div>
              </div>
            )}

            {/* Track List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {TRACKS.map((t, i) => (
                <div key={t.id} className="track-row" onClick={() => playing === i ? stopTrack() : playTrack(i)} style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 16px", borderRadius: 12,
                  background: playing === i ? `${t.color}18` : "transparent",
                  cursor: "pointer", transition: "background 0.2s",
                  border: playing === i ? `1px solid ${t.color}33` : "1px solid transparent",
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `linear-gradient(135deg, ${t.color}, #111)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, flexShrink: 0,
                    animation: playing === i ? "spin 4s linear infinite" : "none",
                  }}>{playing === i ? "🎵" : (i + 1)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: playing === i ? t.color : "#f0f0f0" }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 1 }}>{t.artist}</div>
                  </div>
                  {playing === i && <AudioVisualizer isPlaying color={t.color} />}
                  <div style={{ fontSize: 11, color: "#555", flexShrink: 0 }}>{fmtTime(t.duration)}</div>
                  <div style={{ fontSize: 16, color: playing === i ? t.color : "#444" }}>{playing === i ? "⏸" : "▶"}</div>
                </div>
              ))}
            </div>

            {/* Earphone tip */}
            <div style={{ marginTop: 24, padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>🎧</div>
              <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6 }}>
                For the best experience · ពាក់កាសដើម្បីបទពិសោធន៍ល្អបំផុត<br />
                <span style={{ color: "#e50914" }}>Spatial Audio · Bass Enhanced · FWG Signature Sound</span>
              </div>
            </div>
          </div>
        )}

        {/* ── LIVE TAB ── */}
        {activeTab === "live" && (
          <div style={{ animation: "fadeIn 0.4s ease", padding: "32px 28px" }}>
            <div style={{ fontSize: 11, letterSpacing: 4, color: "#e50914", textTransform: "uppercase", marginBottom: 8 }}>FWG Live</div>
            <h2 style={{ fontSize: 28, fontWeight: 900, marginBottom: 4 }}>📡 Live Broadcast</h2>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 28 }}>Powered by Restream · Ultra-low latency</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {["FWG Main Channel", "Tech Stream", "Music Live", "Gaming"].map((ch, i) => (
                <div key={i} style={{
                  background: "#111118", borderRadius: 14, overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer",
                }}>
                  <div style={{ aspectRatio: "16/9", background: `linear-gradient(135deg, ${["#e50914","#ff6b35","#a855f7","#06b6d4"][i]}22, #1a1a24)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, position: "relative" }}>
                    {["🎬","💻","🎵","🎮"][i]}
                    <div style={{ position: "absolute", top: 8, left: 8, background: "#e50914", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, letterSpacing: 1, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", animation: "pulse 1s infinite", display: "inline-block" }} />LIVE
                    </div>
                  </div>
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{ch}</div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 3 }}>{Math.floor(Math.random() * 9000 + 1000).toLocaleString()} viewers</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── VIDEO MODAL ── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 200, display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "14px 20px", background: "linear-gradient(180deg, rgba(0,0,0,0.9) 0%, transparent 100%)", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{modal.title}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{modal.category} · {modal.quality} · {modal.duration}</div>
            </div>
            <button onClick={() => setModal(null)} style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }}>✕</button>
          </div>
          <iframe src={modal.embedUrl} style={{ width: "100%", height: "100%", border: "none" }}
            allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
      )}

      {/* ── MINI PLAYER BAR ── */}
      {track && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 150,
          background: "rgba(8,8,16,0.95)", backdropFilter: "blur(20px)",
          borderTop: `1px solid ${track.color}33`,
          padding: "10px 20px",
          display: "flex", alignItems: "center", gap: 14,
          animation: "fadeIn 0.3s ease",
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: `linear-gradient(135deg, ${track.color}, #111)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0, animation: playing !== null ? "spin 4s linear infinite" : "none" }}>🎵</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.title}</div>
            <div style={{ height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 1, marginTop: 5 }}>
              <div style={{ height: "100%", background: track.color, width: `${(progress / track.duration) * 100}%`, borderRadius: 1, transition: "width 1s linear" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["⏮", prevTrack], [playing !== null ? "⏸" : "▶", () => playing !== null ? stopTrack() : playTrack(0)], ["⏭", nextTrack]].map(([icon, fn], i) => (
              <button key={i} onClick={fn} style={{
                width: i === 1 ? 38 : 32, height: i === 1 ? 38 : 32,
                borderRadius: "50%", background: i === 1 ? track.color : "rgba(255,255,255,0.1)",
                border: "none", color: "#fff", fontSize: i === 1 ? 16 : 13,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: i === 1 ? `0 0 15px ${track.color}66` : "none",
              }}>{icon}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
