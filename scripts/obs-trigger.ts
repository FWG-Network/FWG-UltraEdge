#!/usr/bin/env bun
// ============================================================
// FWG-UltraEdge 🌍⚡ — OBS Live Trigger Script
// Broadcasts deployment success via OBS CLI or Restream API
// Runs only on Production deployments (Job 11)
// ============================================================

const STREAM_KEY = process.env.STREAM_KEY ?? "";
const RESTREAM_API_KEY = process.env.RESTREAM_API_KEY ?? "";
const DEPLOY_VERSION = process.env.DEPLOY_VERSION ?? "unknown";
const DEPLOY_COMMIT = process.env.DEPLOY_COMMIT?.slice(0, 8) ?? "unknown";
const WORKER_URL = process.env.WORKER_URL ?? "";
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

if (!STREAM_KEY) {
  console.log("⏭️  STREAM_KEY not set — OBS trigger skipped");
  process.exit(0);
}

console.log("🎬 FWG-UltraEdge: Initiating LIVE broadcast...");
console.log(`   Version: ${DEPLOY_VERSION} | Commit: ${DEPLOY_COMMIT}`);

// ── Step 1: Attempt OBS CLI trigger ──
async function triggerObsCli(): Promise<boolean> {
  try {
    const proc = Bun.spawn(
      ["obs-cli", "streaming", "start", "--stream-key", STREAM_KEY],
      { stdout: "pipe", stderr: "pipe" }
    );
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      console.log("✅ OBS CLI: Live stream started successfully");
      return true;
    }
    console.log(`⚠️  OBS CLI exited with code ${exitCode}`);
    return false;
  } catch {
    console.log("⚠️  OBS CLI not available — falling back to Restream API");
    return false;
  }
}

// ── Step 2: Restream API fallback ──
async function triggerRestream(): Promise<boolean> {
  if (!RESTREAM_API_KEY) {
    console.log("⏭️  RESTREAM_API_KEY not set — skipping Restream API");
    return false;
  }

  try {
    const res = await fetch("https://api.restream.io/v2/user/channel-settings", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${RESTREAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `🌍⚡ FWG-UltraEdge v${DEPLOY_VERSION} — Ultra Edge Deployment LIVE`,
        description: `Production deployment complete! Commit: ${DEPLOY_COMMIT} | Worker: ${WORKER_URL}`,
      }),
    });

    if (res.ok) {
      console.log("✅ Restream API: Channel updated successfully");
      return true;
    }

    console.log(`⚠️  Restream API returned ${res.status}`);
    return false;
  } catch (err) {
    console.log(`⚠️  Restream API error: ${err}`);
    return false;
  }
}

// ── Step 3: Slack community announcement ──
async function announceToSlack(method: string): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;

  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      attachments: [
        {
          color: "#ff0000",
          title: "🔴 LIVE: FWG-UltraEdge Ultra Edge Deployment 🌍⚡🎬",
          text: "We are LIVE! Production deployment complete — watch the status broadcast!",
          fields: [
            { title: "Version", value: DEPLOY_VERSION, short: true },
            { title: "Commit", value: DEPLOY_COMMIT, short: true },
            { title: "Broadcast Method", value: method, short: true },
            { title: "Status", value: "🔴 Broadcasting", short: true },
          ],
          footer: "FWG-UltraEdge Live System",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }),
  }).catch(() => {});
  console.log("📢 Slack community announcement sent");
}

// ── Main execution ──
const obsSuccess = await triggerObsCli();
const method = obsSuccess ? "OBS CLI" : await triggerRestream() ? "Restream API" : "Slack only";

await announceToSlack(method);
console.log(`🎬 FWG-UltraEdge 🌍⚡ — Broadcast complete via: ${method}`);
